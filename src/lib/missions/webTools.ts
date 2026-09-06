import { getStore } from "../store";
import { isLiveBrowser } from "../browser";
import { GENERAL_SOURCES, isAllowedResearchTarget, sourceNameFor } from "../browser/sources";
import { sandboxResultUrl } from "../browser/sandbox";
import { callPlanner, plannerConfigured } from "../agent/provider";
import { modelFor } from "../ai/routing";
import { getUserPlan } from "../billing";
import { detectInjection } from "../agent/untrusted";
import { ensureBrowserSession, runReadOnlyAction } from "./browserOps";
import type { PageObservation } from "../browser/provider";
import type { MissionSourceRef } from "../types";
import type { MissionTool, ToolContext, ToolResult } from "./tools";

/**
 * DOMAIN-AGNOSTIC RESEARCH — the tools a plan reaches for when the goal is
 * not one of the shapes somebody hand-built.
 *
 * The existing browser tools are vertical slices: `laptop.search` knows about
 * laptop retailers, and `browser.research` opened a fixed list of laptop
 * pages no matter what the mission was actually about. Ask for apartments and
 * you got laptops — the plan looked right and the work was wrong.
 *
 * These three tools carry no domain knowledge at all. They take their subject
 * from the mission's own goal:
 *   web.research      → work out what to search for, search, read what comes
 *                       back, and record only what the pages actually showed
 *   analyze.compare   → rank what was found against the criteria in the goal
 *   deliverable.report→ write it up, titled from the goal, with its sources
 *
 * Honesty rules, unchanged from the rest of the registry:
 *  · a field the page didn't show stays null — it is never inferred,
 *  · live and sandbox are never mixed, and sandbox output says so everywhere,
 *  · every action here is READ-ONLY; nothing consequential can happen,
 *  · page text is untrusted data. It is scanned for injection attempts and is
 *    only ever recorded as findings — it never becomes an instruction.
 */

const MAX_CANDIDATES = 5;
const MAX_QUERIES = 2;

/* ------------------------------------------------------------------ shared */

export interface WebFinding {
  title: string;
  url: string;
  source: string;
  /** Bounded plain-text of what the page showed. */
  summary: string;
  /** A money/measure figure when the page actually stated one, else null. */
  figure: number | null;
  /** Where that figure came from — the labeled row, or the page's prose. */
  figureFrom: string | null;
  /** Row pairs the page presented as structured detail. */
  attributes: Record<string, string>;
  /** True when the page carried something that looked like an instruction. */
  flagged: boolean;
  simulated: boolean;
}

function outputOf(ctx: ToolContext, tool: string): Record<string, unknown> {
  const step = ctx.steps.find((s) => s.tool === tool && s.state === "completed");
  return step?.output ?? {};
}

/** Findings from whichever research step ran, whatever it was called. */
function findingsFrom(ctx: ToolContext): WebFinding[] {
  for (const tool of ["web.research", "browser.research"]) {
    const out = outputOf(ctx, tool);
    if (Array.isArray(out.findings) && out.findings.length > 0) return out.findings as WebFinding[];
  }
  return [];
}

/**
 * The first money-shaped figure in a string. Returns null rather than
 * guessing: a missing price must read as missing, never as free.
 */
function figureIn(text: string): number | null {
  const m = /(?:\$|usd\s*)\s?([0-9][0-9,]{0,9}(?:\.[0-9]{1,2})?)/i.exec(text);
  if (!m) return null;
  const n = Number(m[1].replace(/,/g, ""));
  return Number.isFinite(n) ? n : null;
}

/** Attribute keys that name the number an option is actually judged on. */
const FIGURE_KEY = /\b(price|rent|cost|total|fare|rate|amount|fee|figure|from)\b/;

/**
 * WHICH number on the page is this option's number.
 *
 * Not "the first money-shaped string", which is how a search for apartments
 * "under $1,500" gave every single result a figure of $1,500 — the constraint
 * out of the user's own sentence, echoed back in the page title, read as if
 * it were each listing's rent. Four different apartments all priced at the
 * ceiling, ranked by a tie-break, and presented as a recommendation.
 *
 * So the structured detail a page publishes about itself is trusted first,
 * and prose last:
 *   1. a labeled row whose key names a price ("rent", "total", "fare"),
 *   2. any other labeled row carrying a money value,
 *   3. the page's own prose — weakest, and the one that carries headers,
 *      banners, and the search terms that got us here.
 * Nothing anywhere → null, and the option is listed as "not stated" rather
 * than ranked on a number nobody published.
 */
function figureFor(
  summary: string,
  attributes: Record<string, string>
): { figure: number | null; from: string | null } {
  const entries = Object.entries(attributes);

  for (const [key, value] of entries) {
    if (!FIGURE_KEY.test(key)) continue;
    const n = figureIn(value);
    if (n !== null) return { figure: n, from: key };
  }
  for (const [key, value] of entries) {
    const n = figureIn(value);
    if (n !== null) return { figure: n, from: key };
  }
  const n = figureIn(summary);
  return n === null ? { figure: null, from: null } : { figure: n, from: "page text" };
}

function attributesOf(obs: PageObservation): Record<string, string> {
  const attrs: Record<string, string> = {};
  for (const table of obs.tables) {
    for (const row of table.rows) {
      if (row.length >= 2 && row[0] && row[1]) {
        const key = row[0].trim().slice(0, 40).toLowerCase();
        if (key && !attrs[key]) attrs[key] = row[1].trim().slice(0, 160);
      }
      if (Object.keys(attrs).length >= 12) return attrs;
    }
  }
  return attrs;
}

function findingFrom(obs: PageObservation): WebFinding {
  const attrs = attributesOf(obs);
  const { figure, from } = figureFor(obs.summary, attrs);
  // Page text is untrusted. A page that tries to issue instructions is
  // recorded and flagged; it never changes what cosigno does next.
  const flagged = detectInjection(`${obs.summary}\n${obs.headings.join("\n")}`);
  return {
    title: obs.title.slice(0, 200),
    url: obs.url,
    source: sourceNameFor(obs.url),
    summary: obs.summary.slice(0, 600),
    figure,
    figureFrom: from,
    attributes: attrs,
    flagged,
    simulated: obs.simulated,
  };
}

/* ------------------------------------------------------- query derivation */

/** Words that carry no search value — dropped from a keyword fallback query. */
const STOPWORDS = new Set([
  "the", "a", "an", "and", "or", "for", "to", "of", "in", "on", "at", "my", "me", "i",
  "please", "can", "you", "find", "get", "research", "look", "up", "best", "some",
  "create", "make", "give", "show", "compare", "comparison", "then", "with", "that",
  "about", "into", "from", "is", "are", "be", "do", "want", "need", "help",
]);

/** A usable search query from the goal alone, with no model call. */
export function keywordQuery(goal: string): string {
  const words = goal
    .toLowerCase()
    .replace(/[^a-z0-9$., -]/g, " ")
    .split(/\s+/)
    .filter((w) => w && !STOPWORDS.has(w));
  const q = words.join(" ").trim();
  return (q || goal.trim()).slice(0, 120);
}

interface ResearchIntent {
  queries: string[];
  /** What the user is actually choosing between, e.g. "apartment". */
  subject: string;
  /** The things that decide the answer, e.g. ["monthly rent", "distance"]. */
  criteria: string[];
}

const INTENT_TOOL = {
  name: "research_intent",
  description: "Work out what to search for and what actually decides the answer.",
  input_schema: {
    type: "object",
    properties: {
      subject: { type: "string", description: "The kind of thing being chosen or researched, 1-3 words, lowercase." },
      queries: {
        type: "array",
        items: { type: "string" },
        description: "1-2 web search queries that would surface real candidates.",
      },
      criteria: {
        type: "array",
        items: { type: "string" },
        description: "2-5 factors that decide which option is best, drawn from the goal. Lowercase.",
      },
    },
    required: ["subject", "queries", "criteria"],
  },
};

/**
 * What to search for, and what makes one result better than another.
 *
 * With a planner configured this is read from the goal by the model, which is
 * what lets the same tool serve apartments, flights, and suppliers. Without
 * one it degrades to keywords — narrower, but never wrong about its own
 * confidence, and the mission still runs.
 */
async function researchIntent(ctx: ToolContext): Promise<ResearchIntent> {
  const goal = ctx.mission.goal;
  const fallback: ResearchIntent = {
    queries: [keywordQuery(goal)],
    subject: "option",
    criteria: [],
  };
  if (!plannerConfigured()) return fallback;
  try {
    const plan = await getUserPlan(ctx.userId);
    const res = await callPlanner({
      model: modelFor("classify"),
      maxTokens: 500,
      system:
        "You turn a person's goal into web research parameters. Return search queries a search engine would answer well, and the factors that genuinely decide which option is best. Never invent a constraint the goal doesn't contain.",
      userContent: `GOAL: ${goal.slice(0, 1000)}`,
      tool: INTENT_TOOL,
      meta: {
        userId: ctx.userId,
        plan: typeof plan === "string" ? plan : String(plan),
        task: "research_intent",
        missionId: ctx.mission.id,
        sessionId: ctx.mission.session_id,
      },
    });
    const raw = res.toolInput;
    if (!raw) return fallback;
    const queries = Array.isArray(raw.queries)
      ? raw.queries.filter((q): q is string => typeof q === "string" && q.trim().length > 0).slice(0, MAX_QUERIES)
      : [];
    const criteria = Array.isArray(raw.criteria)
      ? raw.criteria.filter((c): c is string => typeof c === "string" && c.trim().length > 0).slice(0, 5)
      : [];
    return {
      queries: queries.length > 0 ? queries.map((q) => q.slice(0, 120)) : fallback.queries,
      subject: typeof raw.subject === "string" && raw.subject.trim() ? raw.subject.trim().slice(0, 40) : fallback.subject,
      criteria,
    };
  } catch {
    return fallback;
  }
}

/* ------------------------------------------------------------ web.research */

const webResearch: MissionTool = {
  id: "web.research",
  timeoutMs: 55_000,
  async run(ctx): Promise<ToolResult> {
    const live = isLiveBrowser();
    const intent = await researchIntent(ctx);
    const { session, handle } = await ensureBrowserSession(
      ctx.userId,
      ctx.mission,
      "browser",
      ctx.mission.goal
    );

    // 1) SEARCH. Each query produces a result page whose links are the
    //    candidates. Live runs start at a public search engine; sandbox runs
    //    derive a labeled result set from the same query, so the loop is
    //    identical in both and only the data source differs.
    const candidateUrls: string[] = [];
    const searched: string[] = [];
    for (const query of intent.queries) {
      const target = live ? GENERAL_SOURCES[0].searchUrl(query) : `https://sandbox.example/search?q=${encodeURIComponent(query)}`;
      const res = await runReadOnlyAction(
        ctx.userId,
        ctx.mission,
        session,
        handle,
        `search for “${query}”`,
        { kind: live ? "navigate" : "searchWithinPage", target: live ? target : query }
      );
      if (!res.ok) continue;
      searched.push(query);
      const links = res.observation?.links ?? [];
      for (const l of links) {
        const href = l.href.startsWith("http") ? l.href : "";
        if (!href || !isAllowedResearchTarget(href)) continue;
        if (!candidateUrls.includes(href)) candidateUrls.push(href);
        if (candidateUrls.length >= MAX_CANDIDATES) break;
      }
      // The sandbox result page links are generated from the query itself;
      // if a provider returned none, fall back to those so the loop still
      // has something to read.
      if (!live && candidateUrls.length === 0) {
        for (let i = 1; i <= 3; i++) candidateUrls.push(sandboxResultUrl(query, i));
      }
      if (candidateUrls.length >= MAX_CANDIDATES) break;
    }

    if (candidateUrls.length === 0) {
      return {
        kind: "ok",
        summary: `searched for ${intent.queries.map((q) => `“${q}”`).join(" and ")} but no readable results came back — nothing was found to compare.`,
        output: { findings: [], queries: intent.queries, criteria: intent.criteria, subject: intent.subject, simulated: !live },
        sources: [],
      };
    }

    // 2) READ. Open each candidate and record only what the page showed.
    const findings: WebFinding[] = [];
    for (const url of candidateUrls.slice(0, MAX_CANDIDATES)) {
      const res = await runReadOnlyAction(
        ctx.userId,
        ctx.mission,
        session,
        handle,
        `read ${sourceNameFor(url)}`,
        { kind: "inspect", target: url }
      );
      if (res.observation) findings.push(findingFrom(res.observation));
    }

    await getStore().updateBrowserSession(ctx.userId, session.id, { status: "extracting" });

    const withFigure = findings.filter((f) => f.figure !== null).length;
    const flagged = findings.filter((f) => f.flagged).length;
    const sources: MissionSourceRef[] = findings.map((f) => ({
      name: f.source,
      detail: `${f.title}${f.figure !== null ? ` — $${f.figure.toLocaleString()}` : ""} (${f.url})`,
      simulated: f.simulated,
    }));

    return {
      kind: "ok",
      summary: [
        `read ${findings.length} ${intent.subject}${findings.length === 1 ? "" : "s"} from ${searched.length} search${searched.length === 1 ? "" : "es"}`,
        withFigure > 0 ? `${withFigure} with a stated figure` : "none stated a figure",
        flagged > 0 ? `${flagged} page${flagged === 1 ? "" : "s"} carried instruction-like text and were recorded as data only` : "",
      ]
        .filter(Boolean)
        .join(" — ") + ".",
      output: {
        findings,
        queries: intent.queries,
        criteria: intent.criteria,
        subject: intent.subject,
        simulated: !live,
      },
      sources,
    };
  },
};

/* --------------------------------------------------------- analyze.compare */

const analyzeCompare: MissionTool = {
  id: "analyze.compare",
  timeoutMs: 20_000,
  async run(ctx): Promise<ToolResult> {
    const research = findingsFrom(ctx);
    const meta = outputOf(ctx, "web.research");
    const criteria = Array.isArray(meta.criteria) ? (meta.criteria as string[]) : [];
    const subject = typeof meta.subject === "string" ? meta.subject : "option";
    const simulated = meta.simulated !== false;

    if (research.length === 0) {
      return {
        kind: "ok",
        summary: "there was nothing to compare — the research step found no readable results.",
        output: { ranked: [], criteria, subject, simulated },
        sources: [],
      };
    }

    // Rank on the one dimension the pages actually stated. Anything richer
    // would be an opinion presented as a measurement: results without a
    // figure are kept and listed, never silently dropped or ranked as if
    // they had one.
    const priced = research.filter((f): f is WebFinding & { figure: number } => f.figure !== null);
    const ranked = [...priced].sort((a, b) => a.figure - b.figure);
    const unpriced = research.filter((f) => f.figure === null);
    const pick = ranked[0] ?? null;

    return {
      kind: "ok",
      summary: pick
        ? `compared ${research.length} ${subject}s — ${pick.title} is the lowest at $${pick.figure.toLocaleString()}${unpriced.length > 0 ? `, and ${unpriced.length} didn't state a figure` : ""}.`
        : `compared ${research.length} ${subject}s — none stated a figure, so they're listed without a ranking.`,
      output: {
        ranked,
        unranked: unpriced,
        recommendation: pick,
        criteria,
        subject,
        simulated,
      },
      sources: [
        {
          name: "comparison",
          detail: `${ranked.length} ranked by stated figure, ${unpriced.length} listed without one`,
          simulated,
        },
      ],
    };
  },
};

/* ------------------------------------------------------ deliverable.report */

/** A short title for the report, taken from the goal itself. */
function reportTitle(goal: string): string {
  const t = goal.trim().replace(/\s+/g, " ").replace(/[.?!]+$/, "");
  return t.length > 70 ? `${t.slice(0, 67)}…` : t || "research report";
}

const deliverableReport: MissionTool = {
  id: "deliverable.report",
  timeoutMs: 20_000,
  async run(ctx): Promise<ToolResult> {
    const compare = outputOf(ctx, "analyze.compare");
    const ranked = Array.isArray(compare.ranked) ? (compare.ranked as WebFinding[]) : [];
    const unranked = Array.isArray(compare.unranked) ? (compare.unranked as WebFinding[]) : [];
    const all = ranked.length + unranked.length > 0 ? [...ranked, ...unranked] : findingsFrom(ctx);
    const criteria = Array.isArray(compare.criteria) ? (compare.criteria as string[]) : [];
    const simulated = compare.simulated !== false || all.some((f) => f.simulated);
    const pick = (compare.recommendation as WebFinding | null) ?? null;
    const title = reportTitle(ctx.mission.goal);

    // The attribute columns are whatever the pages actually presented, so a
    // report about apartments has apartment columns without anyone naming
    // them in advance.
    // Columns the table already has under another name are dropped rather
    // than printed twice: the option's own title, the search terms, and the
    // row the figure column was read from.
    const usedForFigure = new Set(all.map((f) => f.figureFrom).filter((k): k is string => Boolean(k)));
    const attrKeys = [...new Set(all.flatMap((f) => Object.keys(f.attributes)))]
      .filter((k) => !usedForFigure.has(k))
      .filter((k) => !/^(query|source|option|title|name|url|link)$/.test(k))
      .slice(0, 4);

    const header = ["option", "source", "figure", ...attrKeys];
    const rows = all.map((f) =>
      [
        f.title.replace(/\|/g, "—"),
        f.source,
        f.figure !== null ? `$${f.figure.toLocaleString()}` : "not stated",
        ...attrKeys.map((k) => (f.attributes[k] ?? "—").replace(/\|/g, "—")),
      ].join(" | ")
    );

    const flagged = all.filter((f) => f.flagged);

    const content = [
      `# ${title}`,
      simulated
        ? "\n> sandbox research — these are generated example results, not real listings. connect a live browser provider for real pages.\n"
        : "",
      criteria.length > 0 ? `**what this was judged on:** ${criteria.join(", ")}\n` : "",
      `| ${header.join(" | ")} |`,
      `| ${header.map(() => "---").join(" | ")} |`,
      ...rows.map((r) => `| ${r} |`),
      "",
      pick
        ? `## recommendation\n\n**${pick.title}** — ${pick.source}, $${pick.figure!.toLocaleString()}.\n\nchosen because it is the lowest stated figure among the ${ranked.length} option${ranked.length === 1 ? "" : "s"} that published one.${unranked.length > 0 ? ` ${unranked.length} further option${unranked.length === 1 ? "" : "s"} didn't state a figure and ${unranked.length === 1 ? "is" : "are"} listed above without a ranking.` : ""}`
        : "## recommendation\n\n_no option stated a comparable figure, so no ranking is claimed._",
      "",
      flagged.length > 0
        ? `## note\n\n${flagged.length} page${flagged.length === 1 ? "" : "s"} contained text written as if instructing an assistant. it was recorded as page content only and changed nothing about this research.\n`
        : "",
      `## sources\n\n${all.map((f) => `- ${f.url}${f.simulated ? " _(sandbox)_" : ""}`).join("\n") || "- none"}`,
    ]
      .filter((s) => s !== "")
      .join("\n");

    const file = await getStore().createFile({
      user_id: ctx.userId,
      session_id: ctx.mission.session_id,
      name: title,
      mime: "text/markdown",
      content,
    });

    return {
      kind: "ok",
      summary: `saved “${title}” — ${all.length} option${all.length === 1 ? "" : "s"}${pick ? `, recommending ${pick.title}` : ", with no ranking claimed"}.`,
      output: {
        file_id: file.id,
        file_name: file.name,
        deliverable: "report",
        recommendation: pick,
        count: all.length,
        simulated,
      },
      sources: [{ name: "files", detail: `deliverable “${file.name}” saved`, simulated }],
    };
  },
};

export const WEB_TOOLS: Record<string, MissionTool> = {
  [webResearch.id]: webResearch,
  [analyzeCompare.id]: analyzeCompare,
  [deliverableReport.id]: deliverableReport,
};
