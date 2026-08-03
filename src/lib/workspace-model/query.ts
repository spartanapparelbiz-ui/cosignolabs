/**
 * Natural-language query over the Workspace Model.
 *
 * "Which AI can modify production databases?" is a question about authority,
 * and the answer has to be the SAME every time it's asked — so this is a
 * deterministic parser over the graph, not a model call. The parser extracts
 * intent (find / impact / permission / capability), plus filters for connector,
 * canonical object, risk and reversibility, and runs them against the graph.
 *
 * Every result carries the interpretation that produced it, so a user can see
 * exactly how their sentence was read and correct it. When a term is
 * unrecognized it is reported as unmatched rather than silently dropped: a
 * query that quietly ignores half its words gives false confidence.
 */

import type { GraphNode, WorkspaceGraph } from "./graph";
import { analyzeDependencies } from "./dependencies";
import { canonicalize } from "./canonical";

export type QueryIntent = "find" | "impact" | "permission" | "capability";

export interface QueryFilters {
  connectors: string[];
  canonical: string[];
  risk: ("read" | "write" | "destructive")[];
  kinds: GraphNode["kind"][];
  /** "irreversible" narrows to operations that cannot be undone. */
  irreversibleOnly: boolean;
  /** Free text that matched nothing structural — used for label search. */
  text: string[];
}

export interface QueryInterpretation {
  intent: QueryIntent;
  filters: QueryFilters;
  /** Words the parser could not use. Surfaced, never hidden. */
  unmatched: string[];
  /** One sentence describing how the query was read. */
  reading: string;
}

export interface QueryResult {
  query: string;
  interpretation: QueryInterpretation;
  nodes: GraphNode[];
  /** Set when the intent resolved to an impact question. */
  impact?: ReturnType<typeof analyzeDependencies>;
  /** True when the query was understood but the workspace has no match. */
  empty_because_no_match: boolean;
  answer: string;
}

const STOPWORDS = new Set([
  "show", "me", "find", "every", "all", "the", "a", "an", "which", "what", "who", "list",
  "that", "is", "are", "can", "with", "in", "on", "to", "of", "for", "and", "or", "my",
  "would", "be", "if", "this", "it", "does", "do", "using", "used", "use", "has", "have",
  "there", "any", "get", "give", "tell", "about", "from", "by", "we", "our", "us",
]);

const RISK_WORDS: { re: RegExp; risk: "read" | "write" | "destructive" }[] = [
  { re: /\b(delete|deleting|destroy|destructive|drop|remove|purge|wipe)\b/, risk: "destructive" },
  { re: /\b(modify|modifying|write|writes|change|changing|update|updating|edit|mutate|mutating)\b/, risk: "write" },
  { re: /\b(read|reads|reading|view|search|list|lookup|query)\b/, risk: "read" },
];

/** Parse a sentence into an interpretation. No network, no model, no state. */
export function parseQuery(query: string, graph: WorkspaceGraph): QueryInterpretation {
  const lower = query.toLowerCase();
  const filters: QueryFilters = {
    connectors: [],
    canonical: [],
    risk: [],
    kinds: [],
    irreversibleOnly: false,
    text: [],
  };

  // Intent.
  let intent: QueryIntent = "find";
  if (/\b(affect|affected|impact|depends?|depend on|break|breaks|if .* (deleted|removed))\b/.test(lower)) {
    intent = "impact";
  } else if (/\b(permission|permissions|access|authority|allowed|who can|which ai can|scope)\b/.test(lower)) {
    intent = "permission";
  } else if (/\b(action|actions|operation|operations|capabilit|can cosigno|what can)\b/.test(lower)) {
    intent = "capability";
  }

  // Risk.
  for (const r of RISK_WORDS) if (r.re.test(lower)) filters.risk.push(r.risk);
  if (/\b(irreversible|cannot be undone|permanent|unrecoverable)\b/.test(lower)) {
    filters.irreversibleOnly = true;
  }

  // Node kinds named explicitly.
  if (/\b(connector|connectors|integration|integrations|system|systems|app|apps)\b/.test(lower)) {
    filters.kinds.push("connector");
  }
  if (/\b(workflow|workflows|automation|automations)\b/.test(lower)) filters.kinds.push("operation");
  if (intent === "permission") filters.kinds.push("permission");

  // Connectors + canonical objects that actually exist in THIS workspace.
  const connectorNames = new Map<string, string>();
  const canonicalNames = new Map<string, string>();
  for (const n of graph.nodes) {
    if (n.kind === "connector") {
      connectorNames.set(n.label.toLowerCase(), n.connector);
      connectorNames.set(n.connector.toLowerCase(), n.connector);
    }
    if (n.canonical) canonicalNames.set(n.canonical.replace(/_/g, " "), n.canonical);
  }
  for (const [name, key] of connectorNames) {
    if (name.length > 2 && lower.includes(name) && !filters.connectors.includes(key)) {
      filters.connectors.push(key);
    }
  }

  const tokens = lower.split(/[^a-z0-9_]+/).filter((t) => t && !STOPWORDS.has(t));
  const used = new Set<string>();

  for (const token of tokens) {
    const singular = token.replace(/ies$/, "y").replace(/([^s])s$/, "$1");
    for (const candidate of [token, singular]) {
      const direct = canonicalNames.get(candidate);
      if (direct && !filters.canonical.includes(direct)) {
        filters.canonical.push(direct);
        used.add(token);
      }
    }
    if (used.has(token)) continue;
    // Fall back to the canonicalizer so "cust" or "deal" still resolve to the
    // object they mean, provided the workspace actually exposes it.
    const guessed = canonicalize(singular);
    if (
      guessed.domain !== "generic" &&
      graph.nodes.some((n) => n.canonical === guessed.type) &&
      !filters.canonical.includes(guessed.type)
    ) {
      filters.canonical.push(guessed.type);
      used.add(token);
    }
  }

  const structural = new Set<string>();
  for (const c of filters.connectors) structural.add(c.toLowerCase());
  for (const [name, key] of connectorNames) if (filters.connectors.includes(key)) structural.add(name);

  const unmatched: string[] = [];
  for (const token of tokens) {
    if (used.has(token)) continue;
    if (structural.has(token)) continue;
    if (RISK_WORDS.some((r) => r.re.test(token))) continue;
    if (/^(permission|permissions|access|authority|workflow|workflows|connector|connectors|integration|integrations|system|systems|affect|affected|impact|depends|depend|break|breaks|action|actions|operation|operations|irreversible|failed|production|deleted|removed|ai|apis?)$/.test(token)) {
      continue;
    }
    unmatched.push(token);
    filters.text.push(token);
  }

  return { intent, filters, unmatched, reading: describe(intent, filters) };
}

function describe(intent: QueryIntent, f: QueryFilters): string {
  const parts: string[] = [];
  if (f.risk.length) parts.push(`${f.risk.join(" or ")} operations`);
  if (f.canonical.length) parts.push(`on ${f.canonical.map((c) => c.replace(/_/g, " ")).join(", ")}`);
  if (f.connectors.length) parts.push(`in ${f.connectors.join(", ")}`);
  if (f.irreversibleOnly) parts.push("that cannot be undone");
  const scope = parts.length ? parts.join(" ") : "everything in the model";
  const lead =
    intent === "impact"
      ? "What depends on"
      : intent === "permission"
        ? "Which permissions govern"
        : intent === "capability"
          ? "Which actions exist for"
          : "Find";
  return `${lead} ${scope}.`;
}

/** Run a parsed query against the graph. */
export function runQuery(graph: WorkspaceGraph, query: string): QueryResult {
  const interpretation = parseQuery(query, graph);
  const { filters, intent } = interpretation;

  let nodes = graph.nodes.filter((n) => n.kind !== "workspace");

  if (filters.connectors.length) {
    // Permission nodes are workspace-wide; keep them only when they're reached
    // through an operation belonging to a named connector.
    const permsInScope = new Set(
      graph.edges
        .filter((e) => e.kind === "requires")
        .filter((e) => filters.connectors.some((c) => e.from.startsWith(`operation:${c}:`)))
        .map((e) => e.to)
    );
    nodes = nodes.filter(
      (n) => filters.connectors.includes(n.connector) || (n.kind === "permission" && permsInScope.has(n.id))
    );
  }
  if (filters.canonical.length) {
    nodes = nodes.filter((n) => (n.canonical ? filters.canonical.includes(n.canonical) : n.kind === "connector"));
  }
  if (filters.risk.length) {
    // Risk only describes operations; other node kinds pass through so a risk
    // filter narrows the actions without hiding the systems they belong to.
    nodes = nodes.filter((n) => n.kind !== "operation" || filters.risk.includes(n.risk ?? "read"));
  }
  if (filters.irreversibleOnly) {
    nodes = nodes.filter((n) => (n.kind === "operation" ? n.reversible === false : false));
  }
  if (filters.kinds.length) {
    nodes = nodes.filter((n) => filters.kinds.includes(n.kind));
  } else if (intent === "capability" || filters.risk.length) {
    nodes = nodes.filter((n) => n.kind === "operation");
  } else if (intent === "permission") {
    nodes = nodes.filter((n) => n.kind === "permission" || n.kind === "operation");
  }
  if (filters.text.length) {
    const matched = nodes.filter((n) =>
      filters.text.some((t) => n.label.toLowerCase().includes(t) || n.id.toLowerCase().includes(t))
    );
    // Free text only NARROWS when it actually hits something; an unknown word
    // must not silently empty an otherwise valid result set.
    if (matched.length) nodes = matched;
  }

  let impact: QueryResult["impact"];
  if (intent === "impact") {
    const target =
      nodes.find((n) => n.kind === "resource") ??
      graph.nodes.find((n) => n.kind === "resource" && filters.canonical.includes(n.canonical ?? ""));
    if (target) impact = analyzeDependencies(graph, target.id, { action: "delete" });
  }

  nodes = nodes.slice().sort((a, b) => rank(a) - rank(b) || a.label.localeCompare(b.label));

  return {
    query,
    interpretation,
    nodes: nodes.slice(0, 200),
    impact,
    empty_because_no_match: nodes.length === 0,
    answer: answerFor(intent, nodes, impact, interpretation),
  };
}

const KIND_RANK: Record<GraphNode["kind"], number> = {
  connector: 0,
  resource: 1,
  operation: 2,
  permission: 3,
  workspace: 4,
};
function rank(n: GraphNode): number {
  return KIND_RANK[n.kind];
}

function answerFor(
  intent: QueryIntent,
  nodes: GraphNode[],
  impact: QueryResult["impact"],
  interpretation: QueryInterpretation
): string {
  if (impact) return impact.summary;
  if (nodes.length === 0) {
    return `Nothing in the Workspace Model matches that. ${interpretation.reading} No connected system exposes it.`;
  }
  const byKind = nodes.reduce<Record<string, number>>((acc, n) => {
    acc[n.kind] = (acc[n.kind] ?? 0) + 1;
    return acc;
  }, {});
  const parts = Object.entries(byKind).map(([k, n]) => `${n} ${k}${n === 1 ? "" : "s"}`);
  const lead = intent === "permission" ? "Governed by" : "Found";
  return `${lead} ${parts.join(", ")} across the Workspace Model.`;
}
