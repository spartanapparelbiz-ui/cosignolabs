import { getStore } from "../store";
import { isLiveBrowser, remoteBrowserProvider } from "../browser";
import { ALLOWED_SOURCES, isAllowedSource } from "../browser/sources";
import { extractProduct, isUsableProduct } from "../browser/extractProduct";
import { SANDBOX_SEARCH_URL } from "../browser/sandbox";
import { ensureBrowserSession, runReadOnlyAction } from "./browserOps";
import { logSecurity } from "../log";
import type { BrowserProductRecord } from "../types";
import type { MissionTool, ToolContext } from "./tools";

/**
 * The laptop-comparison mission — the first complete browser-operator slice.
 * Eight fixed steps: confirm requirements → search → review three products →
 * compare → recommend → save the report. Everything here is READ-ONLY: pages
 * are opened and read, information actually present is extracted (missing
 * fields stay null), and the mission STOPS at the recommended product page —
 * no cart, no checkout, no login, no form is ever touched.
 *
 * Live vs sandbox is never mixed: with a configured remote provider the
 * operator reads real retailer pages; without one the labeled sandbox drives
 * the identical loop and every output says so.
 */

const MAX_PRODUCTS = 3;
const MAX_CANDIDATES = 8;
const MAX_SOURCES_TRIED = 3;

/* ------------------------------------------------------------- helpers */

function outputOf(ctx: ToolContext, tool: string): Record<string, unknown> {
  const step = ctx.steps.find((s) => s.tool === tool && s.state === "completed");
  return step?.output ?? {};
}

interface Candidate {
  url: string;
  text: string;
  source: string;
}

function budgetFromGoal(goal: string): number {
  const m = /\$\s?([0-9]{3,5})(?:,([0-9]{3}))?/.exec(goal.replace(/,/g, ""));
  const v = m ? Number(m[1]) : NaN;
  return Number.isFinite(v) && v >= 200 ? v : 1000;
}

function requirementsFromGoal(goal: string): string[] {
  const g = goal.toLowerCase();
  const reqs: string[] = [];
  if (/\b(school|college|student|study)\b/.test(g)) reqs.push("school work");
  if (/\b(cod(e|ing)|program|develop)\b/.test(g)) reqs.push("coding");
  if (/\bgam(e|ing)\b/.test(g)) reqs.push(/light gaming|casual gam/.test(g) ? "light gaming" : "gaming");
  if (/\b(battery|portable|travel)\b/.test(g)) reqs.push("battery life");
  return reqs.length > 0 ? reqs : ["everyday use"];
}

/** Deterministic, data-supported score. Facts only — a null adds nothing. */
function scoreProduct(p: BrowserProductRecord, budget: number, reqs: string[]): number {
  let score = 0;
  if (p.current_price !== null && p.current_price <= budget) score += 2;
  const memGb = p.memory ? Number(/([0-9]+)/.exec(p.memory)?.[1] ?? 0) : 0;
  if (memGb >= 16) score += 2;
  else if (memGb >= 8) score += 1;
  const stor = p.storage ?? "";
  if (/\b1\s?TB\b/i.test(stor) || Number(/([0-9]{3,4})/.exec(stor)?.[1] ?? 0) >= 512) score += 1;
  const cpu = p.processor ?? "";
  if (/i7|i9|ryzen\s*[79]|ultra\s*[79]|m[34]/i.test(cpu)) score += 2;
  else if (/i5|ryzen\s*5|ultra\s*5/i.test(cpu)) score += 1;
  const gpu = p.graphics ?? "";
  const discrete = /rtx|gtx|radeon\s+rx/i.test(gpu);
  if (discrete) score += reqs.some((r) => r.includes("gaming")) ? 2 : 1;
  if (reqs.includes("battery life") && p.battery_claim && Number(/([0-9]+)/.exec(p.battery_claim)?.[1] ?? 0) >= 8) score += 1;
  if (p.availability && /out of stock|sold out|unavailable/i.test(p.availability)) score -= 3;
  return score;
}

function strengthsOf(p: BrowserProductRecord, budget: number): string[] {
  const out: string[] = [];
  if (p.current_price !== null && p.current_price <= budget) out.push(`within the $${budget} budget at $${p.current_price.toFixed(2)}`);
  if (p.memory && Number(/([0-9]+)/.exec(p.memory)?.[1] ?? 0) >= 16) out.push(`${p.memory} handles coding and multitasking well`);
  if (p.graphics && /rtx|gtx|radeon\s+rx/i.test(p.graphics)) out.push(`dedicated graphics (${p.graphics})`);
  if (p.storage) out.push(`${p.storage} of storage`);
  if (p.battery_claim) out.push(`battery claim: ${p.battery_claim}`);
  return out.length > 0 ? out : ["listed within the search results"];
}

function weaknessesOf(p: BrowserProductRecord): string[] {
  const out: string[] = [];
  if (p.current_price === null) out.push("no confirmed current price");
  if (!p.graphics || !/rtx|gtx|radeon\s+rx/i.test(p.graphics ?? "")) out.push("no dedicated graphics confirmed");
  if (!p.warranty) out.push("warranty not confirmed on the page");
  if (!p.return_policy) out.push("return policy not confirmed on the page");
  if (p.availability && /out of stock|sold out|unavailable/i.test(p.availability)) out.push("currently unavailable");
  return out;
}

/** Labeled sandbox "preview" — an honest placeholder, never a fake live page. */
function sandboxPreviewSvg(label: string): string {
  const safe = label.replace(/[<>&"]/g, "").slice(0, 60);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="640" height="400" viewBox="0 0 640 400"><rect width="640" height="400" fill="#F3E9DA"/><rect x="0" y="0" width="640" height="44" fill="#E7DAC6"/><circle cx="22" cy="22" r="6" fill="#D9C8AE"/><circle cx="42" cy="22" r="6" fill="#D9C8AE"/><circle cx="62" cy="22" r="6" fill="#D9C8AE"/><text x="320" y="190" font-family="system-ui,sans-serif" font-size="20" font-weight="700" fill="#141414" text-anchor="middle">sandbox preview — not a live page</text><text x="320" y="222" font-family="system-ui,sans-serif" font-size="14" fill="#5C5650" text-anchor="middle">${safe}</text><text x="320" y="252" font-family="system-ui,sans-serif" font-size="12" fill="#5C5650" text-anchor="middle">connect a browser provider for real pages</text></svg>`;
  return `data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`;
}

/** Refresh the stored page preview honestly (live screenshot or labeled sandbox). */
async function updatePreview(userId: string, sessionId: string, url: string, label: string): Promise<void> {
  const live = isLiveBrowser();
  const ref = live ? await remoteBrowserProvider.screenshot(url) : sandboxPreviewSvg(label);
  if (ref) {
    await getStore().updateBrowserSession(userId, sessionId, { screenshot_ref: ref });
  }
}

/* ---------------------------------------------------------------- tools */

const laptopConfirm: MissionTool = {
  id: "laptop.confirm",
  timeoutMs: 10_000,
  async run(ctx) {
    const goal = ctx.mission.goal;
    const budget = budgetFromGoal(goal);
    const reqs = requirementsFromGoal(goal);
    const answer = typeof ctx.step.input.answer === "string" ? ctx.step.input.answer : null;

    // Country matters only when real regional prices are involved.
    if (isLiveBrowser() && !answer) {
      return {
        kind: "question",
        question: {
          question: "Which country's prices should I use?",
          why: "prices and availability differ by region.",
          options: ["United States", "United Kingdom", "Canada"],
          recommended: "United States",
          effect: "search results and prices are read for the country you pick.",
        },
      };
    }
    const country = answer ?? "United States";
    return {
      kind: "ok",
      summary: `requirements confirmed: under $${budget}, for ${reqs.join(", ")} — prices in ${country}.`,
      output: { budget, requirements: reqs, country },
      sources: [],
    };
  },
};

const laptopSearch: MissionTool = {
  id: "laptop.search",
  timeoutMs: 55_000,
  async run(ctx) {
    const confirm = outputOf(ctx, "laptop.confirm");
    const budget = typeof confirm.budget === "number" ? confirm.budget : 1000;
    const { session, handle } = await ensureBrowserSession(ctx.userId, ctx.mission, "browser", ctx.mission.goal);
    const store = getStore();
    const live = isLiveBrowser();
    const query = `laptop under $${budget}`;

    const candidates: Candidate[] = [];
    const blocked: string[] = [];

    if (!live) {
      // Sandbox: the labeled fixture search page lists three laptops.
      const res = await runReadOnlyAction(ctx.userId, ctx.mission, session, handle, `Searching for laptops under $${budget}`, {
        kind: "navigate",
        target: SANDBOX_SEARCH_URL,
      });
      for (const l of res.observation?.links ?? []) {
        if (candidates.length < MAX_CANDIDATES) candidates.push({ url: l.href, text: l.text, source: "workspace sandbox" });
      }
      await updatePreview(ctx.userId, session.id, SANDBOX_SEARCH_URL, "search results");
    } else {
      // Live: walk the allowed sources in order; a blocked source is recorded
      // honestly and the next one is tried — never bypassed.
      for (const source of ALLOWED_SOURCES.slice(0, MAX_SOURCES_TRIED + 2)) {
        if (candidates.length >= MAX_CANDIDATES) break;
        if (blocked.length + 1 > MAX_SOURCES_TRIED && candidates.length > 0) break;
        const url = source.searchUrl(query);
        const res = await runReadOnlyAction(ctx.userId, ctx.mission, session, handle, `Searching ${source.name} for laptops under $${budget}`, {
          kind: "navigate",
          target: url,
        });
        if (!res.ok || !res.observation) {
          blocked.push(source.name);
          continue;
        }
        for (const l of res.observation.links) {
          if (candidates.length >= MAX_CANDIDATES) break;
          if (!isAllowedSource(l.href)) continue;
          if (!/laptop|notebook|ideapad|thinkpad|inspiron|pavilion|vivobook|zenbook|aspire|surface/i.test(l.text + " " + l.href)) continue;
          if (/search|filter|category|help|support|account|cart/i.test(l.href)) continue;
          if (l.text.length < 12) continue;
          if (candidates.some((c) => c.url === l.href)) continue;
          candidates.push({ url: l.href, text: l.text, source: source.name });
        }
        await updatePreview(ctx.userId, session.id, url, `${source.name} search results`);
        if (blocked.length >= MAX_SOURCES_TRIED && candidates.length === 0) break;
      }
    }

    if (candidates.length === 0) {
      const blockedNote = blocked.length > 0 ? ` ${blocked.join(", ")} blocked automated access.` : "";
      throw new Error(`no products could be found on the allowed sources.${blockedNote}`);
    }

    await store.updateBrowserSession(ctx.userId, session.id, {
      status: "active",
      last_action: `Found ${candidates.length} possible products`,
    });

    return {
      kind: "ok",
      summary: `found ${candidates.length} possible product${candidates.length === 1 ? "" : "s"}${blocked.length > 0 ? ` — ${blocked.join(", ")} could not be read (blocked automated access)` : ""}.`,
      output: { candidates, blocked, simulated: !live },
      sources: [
        {
          name: live ? "web search" : "workspace sandbox",
          detail: `${candidates.length} candidates across ${new Set(candidates.map((c) => c.source)).size} source${blocked.length > 0 ? `; blocked: ${blocked.join(", ")}` : ""}`,
          simulated: !live,
        },
      ],
    };
  },
};

const laptopReview: MissionTool = {
  id: "laptop.review",
  timeoutMs: 55_000,
  async run(ctx) {
    const store = getStore();
    const search = outputOf(ctx, "laptop.search");
    const candidates = Array.isArray(search.candidates) ? (search.candidates as Candidate[]) : [];
    const live = isLiveBrowser();
    const { session, handle } = await ensureBrowserSession(ctx.userId, ctx.mission, "browser", ctx.mission.goal);

    // Which product this step reviews: the explicit index if set, else the
    // count of already-completed review steps (works for compiled plans too).
    const explicit = typeof ctx.step.input.product_index === "number" ? ctx.step.input.product_index : null;
    const done = ctx.steps.filter((s) => s.tool === "laptop.review" && s.state === "completed").length;
    const position = explicit ?? done;
    const ordinal = ["first", "second", "third"][position] ?? `${position + 1}th`;

    const already = await store.listBrowserProducts(ctx.userId, ctx.mission.id);
    const reviewedUrls = new Set(already.map((p) => p.product_url));
    const pool = candidates.filter((c) => !reviewedUrls.has(c.url));

    // Try up to three candidates for this slot; failures are recorded honestly.
    const skipped: string[] = [];
    for (const candidate of pool.slice(0, 3)) {
      await store.updateBrowserSession(ctx.userId, session.id, {
        status: "navigating",
        last_action: `Reviewing the ${ordinal} product: ${candidate.text.slice(0, 80)}`,
      });
      const res = await runReadOnlyAction(ctx.userId, ctx.mission, session, handle, `Reviewing ${candidate.text.slice(0, 80)}`, {
        kind: "inspect",
        target: candidate.url,
      });
      if (!res.ok || !res.observation) {
        skipped.push(`${candidate.text.slice(0, 60)} — ${res.summary}`);
        continue;
      }
      const extracted = extractProduct(res.observation);
      if (!isUsableProduct(extracted)) {
        skipped.push(`${candidate.text.slice(0, 60)} — the page didn't show usable product details.`);
        continue;
      }
      if (extracted.injection) {
        logSecurity("injection_flagged", { context: "browser_product", url: candidate.url });
      }
      const product = await store.createBrowserProduct({
        user_id: ctx.userId,
        mission_id: ctx.mission.id,
        session_id: session.id,
        name: extracted.name,
        brand: extracted.brand,
        current_price: extracted.currentPrice,
        currency: extracted.currency,
        retailer: extracted.retailer,
        product_url: extracted.productUrl,
        processor: extracted.processor,
        memory: extracted.memory,
        storage: extracted.storage,
        display: extracted.display,
        graphics: extracted.graphics,
        battery_claim: extracted.batteryClaim,
        availability: extracted.availability,
        warranty: extracted.warranty,
        return_policy: extracted.returnPolicy,
        source_title: extracted.sourceTitle,
        injection_flag: extracted.injection,
        simulated: !live,
        accessed_at: extracted.accessedAt,
      });
      const priceNote = product.current_price !== null ? `Price found: $${product.current_price.toFixed(2)}` : "No price shown on the page";
      await store.updateBrowserSession(ctx.userId, session.id, {
        status: "extracting",
        last_action: `${priceNote} — ${product.name.slice(0, 60)}`,
      });
      await updatePreview(ctx.userId, session.id, candidate.url, product.name);
      return {
        kind: "ok",
        summary: `reviewed ${product.name}${product.current_price !== null ? ` — $${product.current_price.toFixed(2)}` : " — no price confirmed"}${skipped.length > 0 ? ` (skipped ${skipped.length} unreadable page${skipped.length === 1 ? "" : "s"})` : ""}.`,
        output: {
          product_id: product.id,
          name: product.name,
          price: product.current_price,
          retailer: product.retailer,
          url: product.product_url,
          skipped,
          simulated: !live,
        },
        sources: [
          {
            name: product.retailer,
            detail: `${product.name}${product.current_price !== null ? ` — $${product.current_price.toFixed(2)}` : ""} (${product.product_url})`,
            simulated: !live,
          },
        ],
      };
    }

    throw new Error(
      pool.length === 0
        ? "no unreviewed candidates were left to open."
        : `none of the candidate pages could be read: ${skipped.join("; ").slice(0, 220)}`
    );
  },
};

const laptopCompare: MissionTool = {
  id: "laptop.compare",
  timeoutMs: 15_000,
  async run(ctx) {
    const confirm = outputOf(ctx, "laptop.confirm");
    const budget = typeof confirm.budget === "number" ? confirm.budget : 1000;
    const reqs = Array.isArray(confirm.requirements) ? (confirm.requirements as string[]) : ["everyday use"];
    const products = await getStore().listBrowserProducts(ctx.userId, ctx.mission.id);

    if (products.length === 0) {
      throw new Error("no products were collected, so there is nothing to compare.");
    }
    const scored = products
      .slice(0, MAX_PRODUCTS)
      .map((p) => ({
        product: p,
        score: scoreProduct(p, budget, reqs),
        strengths: strengthsOf(p, budget),
        weaknesses: weaknessesOf(p),
      }))
      .sort((a, b) => b.score - a.score || (a.product.current_price ?? Infinity) - (b.product.current_price ?? Infinity));

    const shortfall = products.length < MAX_PRODUCTS
      ? ` only ${products.length} of ${MAX_PRODUCTS} products could be reviewed — the comparison covers what was actually read.`
      : "";
    return {
      kind: "ok",
      summary: `compared ${scored.length} product${scored.length === 1 ? "" : "s"} against your requirements (${reqs.join(", ")}).${shortfall}`,
      output: {
        comparison: scored.map((s) => ({
          product_id: s.product.id,
          name: s.product.name,
          price: s.product.current_price,
          score: s.score,
          strengths: s.strengths,
          weaknesses: s.weaknesses,
        })),
        budget,
        requirements: reqs,
        simulated: scored.some((s) => s.product.simulated),
      },
      sources: scored.map((s) => ({
        name: s.product.retailer,
        detail: s.product.name,
        simulated: s.product.simulated,
      })),
    };
  },
};

const laptopRecommend: MissionTool = {
  id: "laptop.recommend",
  timeoutMs: 55_000,
  async run(ctx) {
    const cmp = outputOf(ctx, "laptop.compare");
    const rows = Array.isArray(cmp.comparison)
      ? (cmp.comparison as { product_id: string; name: string; price: number | null; score: number; strengths: string[]; weaknesses: string[] }[])
      : [];
    // A recommendation must be SUPPORTED by the data: a confirmed price and
    // the top comparison score. No priced product → no recommendation.
    const pick = rows.find((r) => r.price !== null);
    if (!pick) {
      return {
        kind: "ok",
        summary: "no product had a confirmed price, so cosigno is not making a recommendation.",
        output: { recommendation: null, reason: "no confirmed prices" },
        sources: [],
      };
    }
    const products = await getStore().listBrowserProducts(ctx.userId, ctx.mission.id);
    const product = products.find((p) => p.id === pick.product_id);
    const reason = `strongest fit in the comparison: ${pick.strengths.slice(0, 3).join("; ")}.`;

    // Open the recommended product page and STOP — this phase never adds to a
    // cart, never fills a form, never checks out.
    if (product) {
      const { session, handle } = await ensureBrowserSession(ctx.userId, ctx.mission, "browser", ctx.mission.goal);
      await runReadOnlyAction(ctx.userId, ctx.mission, session, handle, `Opening the recommended product: ${product.name.slice(0, 70)}`, {
        kind: "openLink",
        target: product.product_url,
      });
      await updatePreview(ctx.userId, session.id, product.product_url, product.name);
      await getStore().updateBrowserSession(ctx.userId, session.id, {
        last_action: `Recommended: ${product.name.slice(0, 70)} — stopped before any purchase`,
      });
    }

    return {
      kind: "ok",
      summary: `recommended ${pick.name}${pick.price !== null ? ` at $${pick.price.toFixed(2)}` : ""} — stopped at the product page; no purchase was attempted.`,
      output: {
        recommendation: {
          product_id: pick.product_id,
          name: pick.name,
          price: pick.price,
          retailer: product?.retailer ?? "",
          url: product?.product_url ?? "",
        },
        reason,
        simulated: product?.simulated ?? true,
      },
      sources: product
        ? [{ name: product.retailer, detail: `${product.name} (${product.product_url})`, simulated: product.simulated }]
        : [],
    };
  },
};

const laptopReport: MissionTool = {
  id: "laptop.report",
  timeoutMs: 20_000,
  async run(ctx) {
    const store = getStore();
    const confirm = outputOf(ctx, "laptop.confirm");
    const cmp = outputOf(ctx, "laptop.compare");
    const rec = outputOf(ctx, "laptop.recommend");
    const search = outputOf(ctx, "laptop.search");
    const budget = typeof confirm.budget === "number" ? confirm.budget : 1000;
    const reqs = Array.isArray(confirm.requirements) ? (confirm.requirements as string[]) : [];
    const rows = Array.isArray(cmp.comparison)
      ? (cmp.comparison as { product_id: string; name: string; price: number | null; strengths: string[]; weaknesses: string[] }[])
      : [];
    const products = await store.listBrowserProducts(ctx.userId, ctx.mission.id);
    const recommendation = (rec.recommendation ?? null) as { product_id: string; name: string; price: number | null; retailer: string; url: string } | null;
    const blocked = Array.isArray(search.blocked) ? (search.blocked as string[]) : [];
    const simulated = products.some((p) => p.simulated);
    const checkedOn = new Date().toISOString().slice(0, 10);

    const cell = (v: string | null) => v ?? "not shown on the page";
    const bestFor = (p: BrowserProductRecord) =>
      /rtx|gtx|radeon\s+rx/i.test(p.graphics ?? "") ? "gaming + coding" : Number(/([0-9]+)/.exec(p.memory ?? "")?.[1] ?? 0) >= 16 ? "coding + multitasking" : "everyday school work";
    const drawback = (p: BrowserProductRecord) => weaknessesOf(p)[0] ?? "none confirmed";

    const table = [
      `| Product | Price | Processor | Memory | Storage | Graphics | Best for | Main drawback |`,
      `| --- | --- | --- | --- | --- | --- | --- | --- |`,
      ...products.map(
        (p) =>
          `| ${p.name.slice(0, 60)} | ${p.current_price !== null ? `$${p.current_price.toFixed(2)}` : "not shown"} | ${cell(p.processor)} | ${cell(p.memory)} | ${cell(p.storage)} | ${cell(p.graphics)} | ${bestFor(p)} | ${drawback(p)} |`
      ),
    ].join("\n");

    const content = [
      `# Laptop comparison under $${budget.toLocaleString()}`,
      simulated ? `\n> sandbox comparison — built from labeled example pages, not live prices. connect a browser provider for real current prices.\n` : "",
      `**Your requirements:** ${reqs.join(", ") || "everyday use"}`,
      `**Date checked:** ${checkedOn}`,
      "",
      `## Comparison`,
      "",
      table,
      "",
      `## Strengths and weaknesses`,
      "",
      ...rows.map((r) => [`### ${r.name}`, ...r.strengths.map((s) => `- ✔ ${s}`), ...r.weaknesses.map((w) => `- ✘ ${w}`), ""].join("\n")),
      recommendation
        ? `## Recommendation\n\n**${recommendation.name}** from ${recommendation.retailer}${recommendation.price !== null ? ` at $${recommendation.price.toFixed(2)}` : ""}.\n\n${String(rec.reason ?? "")}\n\n[Open the product page](${recommendation.url})`
        : `## Recommendation\n\nNo recommendation — no product had a confirmed price, and cosigno does not recommend without supporting data.`,
      "",
      `## Sources`,
      "",
      ...products.map((p) => `- ${p.retailer}: [${p.source_title.slice(0, 80)}](${p.product_url}) — accessed ${p.accessed_at.slice(0, 10)}${p.simulated ? " _(sandbox)_" : ""}`),
      blocked.length > 0 ? `\n> Could not read: ${blocked.join(", ")} (blocked automated access).` : "",
      "",
      `> Prices and availability may change after this mission was completed.`,
    ].join("\n");

    const file = await store.createFile({
      user_id: ctx.userId,
      session_id: ctx.mission.session_id,
      name: `Laptop comparison under $${budget.toLocaleString()}`,
      mime: "text/markdown",
      content,
    });

    // Close out: the browser session ends cleanly, and the mission receipt is
    // written here (the report IS the final step).
    const sessions = await store.listBrowserSessions(ctx.userId, ctx.mission.id);
    for (const s of sessions) {
      if (!["expired", "stopped", "failed_safely", "completed"].includes(s.status)) {
        await store.updateBrowserSession(ctx.userId, s.id, { status: "completed", last_action: "Mission complete" });
      }
    }
    const doneSteps = ctx.steps.filter((s) => s.state === "completed");
    const receipt = {
      completed_steps: [...doneSteps.map((s) => s.purpose), ctx.step.purpose],
      deliverables: [{ file_id: file.id, name: file.name }],
      verifications: [],
      recommendation: recommendation?.name ?? null,
      products_reviewed: products.length,
      plan_versions: ctx.mission.plan_version,
      external_changes: "none — this mission was read-only",
    };
    await store.updateMission(ctx.userId, ctx.mission.id, { receipt });

    return {
      kind: "ok",
      summary: `comparison report saved${recommendation ? ` — recommending ${recommendation.name}` : ""} (${products.length} product${products.length === 1 ? "" : "s"} reviewed, no external changes made).`,
      output: { file_id: file.id, file_name: file.name, deliverable: "comparison", recommendation },
      sources: [{ name: "files", detail: `deliverable “${file.name}” saved (v1)`, simulated }],
    };
  },
};

export const LAPTOP_TOOLS: Record<string, MissionTool> = {
  [laptopConfirm.id]: laptopConfirm,
  [laptopSearch.id]: laptopSearch,
  [laptopReview.id]: laptopReview,
  [laptopCompare.id]: laptopCompare,
  [laptopRecommend.id]: laptopRecommend,
  [laptopReport.id]: laptopReport,
};
