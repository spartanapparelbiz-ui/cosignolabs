import type { ActionCategory, ActionRecord, Tier } from "./types";

/**
 * Pure presentation logic for action cards — what an action WILL do, what it
 * touches, and what happened. No React, no DOM, total functions (never throw
 * on weird payloads) so every card renders something sensible and the whole
 * module is unit-testable. Presentation ONLY: nothing here participates in
 * the approval state machine.
 */

/* ---------------------------------------------------------------- helpers */

function num(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string" && /^\d+$/.test(v.trim())) return Number(v);
  return null;
}

function shortStr(v: unknown, max = 26): string | null {
  if (typeof v !== "string") return null;
  const s = v.trim();
  if (!s) return null;
  return s.length > max ? `${s.slice(0, max - 1)}…` : s;
}

/** Best count-of-things guess from a payload (match_count, count, arrays). */
export function payloadCount(payload: Record<string, unknown>): number | null {
  if (!payload || typeof payload !== "object") return null;
  for (const key of ["match_count", "count", "quantity", "items_count"]) {
    const n = num(payload[key]);
    if (n !== null) return n;
  }
  for (const v of Object.values(payload)) {
    if (Array.isArray(v) && v.length > 0) return v.length;
  }
  return null;
}

/** The noun those counted things most plausibly are, per category. */
function countNoun(category: ActionCategory): string {
  switch (category) {
    case "send_email":
    case "draft":
      return "emails";
    case "update_record":
      return "records";
    case "refund":
    case "payment":
    case "spend":
      return "payments";
    default:
      return "items";
  }
}

/* ------------------------------------------------- "what this will do" line */

/**
 * One calm sentence describing the effect and its reversibility. Drawn from
 * the server-resolved category/tier plus payload counts — never from model
 * prose, so it can't be talked into understating an effect.
 */
export function effectLine(
  action: Pick<ActionRecord, "category" | "tier" | "payload">
): string {
  const n = payloadCount(action.payload ?? {});
  const amount = shortStr(action.payload?.amount, 18);
  switch (action.category) {
    case "search":
      return "read-only — nothing changes.";
    case "summarize":
      return "read-only — a summary is added to this thread.";
    case "draft":
      return n
        ? `saves ${n} draft${n === 1 ? "" : "s"} — nothing is sent.`
        : "saved as a draft — nothing is sent.";
    case "send_email":
      return `this sends ${n ?? 1} email${(n ?? 1) === 1 ? "" : "s"} on your behalf.`;
    case "post_content":
      return "this publishes content outside your workspace.";
    case "update_record":
      return n
        ? `this changes ${n} record${n === 1 ? "" : "s"} in a connected tool.`
        : "this changes data in a connected tool.";
    case "spend":
      return amount
        ? `this commits spend of ${amount} under your cap.`
        : "this commits spend under your configured cap.";
    case "webhook":
      return "this fires your configured outbound webhook.";
    case "delete":
      return n
        ? `this permanently deletes ${n} item${n === 1 ? "" : "s"} — it can't be undone.`
        : "this permanently deletes items — it can't be undone.";
    case "refund":
      return amount
        ? `this returns ${amount} to a customer.`
        : "this returns money to a customer.";
    case "payment":
      return amount
        ? `this sends a payment of ${amount} out.`
        : "this moves money out.";
    default:
      return action.tier === 1
        ? "read-only or reversible — runs automatically."
        : "this changes something outside your workspace.";
  }
}

/* ----------------------------------------------------------- impact chips */

/** The trailing reversibility chip: risk at a glance, styled by the card. */
export function reversibilityChip(
  category: ActionCategory,
  tier: Tier
): { label: string; grade: "safe" | "external" | "permanent" } {
  if (category === "delete") return { label: "permanent", grade: "permanent" };
  if (category === "refund" || category === "payment" || category === "spend")
    return { label: "moves money", grade: "permanent" };
  if (tier === 1)
    return {
      label: category === "draft" ? "reversible" : "read-only",
      grade: "safe",
    };
  if (category === "send_email" || category === "post_content" || category === "webhook")
    return { label: "leaves your workspace", grade: "external" };
  return { label: "changes data", grade: "external" };
}

export interface ImpactChip {
  label: string;
  grade: "neutral" | "safe" | "external" | "permanent";
}

/**
 * Small chips showing what the action touches, drawn from the payload.
 * Known keys render friendly ("last 30 days", `label "newsletters"`, counts
 * with a category-appropriate noun); the reversibility chip always closes
 * the row. Capped so the row never crowds the card.
 */
export function impactChips(
  action: Pick<ActionRecord, "category" | "tier" | "payload">
): ImpactChip[] {
  const p = action.payload ?? {};
  const chips: ImpactChip[] = [];
  const add = (label: string | null) => {
    if (label && chips.length < 4 && !chips.some((c) => c.label === label)) {
      chips.push({ label, grade: "neutral" });
    }
  };

  // where it acts
  add(shortStr(p.source) ?? shortStr(p.destination) ?? shortStr(p.integration));
  const to = shortStr(p.to) ?? shortStr(p.recipient);
  if (to) add(`to ${to}`);
  add(shortStr(p.target) ?? shortStr(p.order) ?? shortStr(p.record_id));

  // how much
  const n = payloadCount(p);
  if (n !== null) add(`${n} ${countNoun(action.category)}`);
  add(shortStr(p.amount, 18));

  // scope / shape
  const days = num(p.window_days);
  if (days !== null) add(`last ${days} days`);
  else {
    const w = shortStr(p.window, 12);
    if (w) add(`last ${w}`);
  }
  if (typeof p.label === "string" && p.label.trim()) add(`label "${shortStr(p.label, 18)}"`);
  add(shortStr(p.operation, 20));

  const rev = reversibilityChip(action.category, action.tier);
  return [...chips.slice(0, 4), { label: rev.label, grade: rev.grade }];
}

/* ------------------------------------------------------------ diff view */

export interface DiffRow {
  field: string;
  before: string;
  after: string;
}

function display(v: unknown): string {
  if (v === null || v === undefined) return "—";
  if (typeof v === "object") return JSON.stringify(v);
  return String(v);
}

/**
 * Extract a before → after diff when the payload describes a change:
 *   - payload.changes: { field: { from, to } | { before, after } }
 *   - payload.before + payload.after objects (union of keys)
 * Returns null when the payload isn't change-shaped — the card falls back
 * to the plain payload well.
 */
export function extractDiff(payload: Record<string, unknown>): DiffRow[] | null {
  if (!payload || typeof payload !== "object") return null;

  const changes = payload.changes;
  if (changes && typeof changes === "object" && !Array.isArray(changes)) {
    const rows: DiffRow[] = [];
    for (const [field, v] of Object.entries(changes as Record<string, unknown>)) {
      if (v && typeof v === "object") {
        const o = v as Record<string, unknown>;
        const from = "from" in o ? o.from : "before" in o ? o.before : undefined;
        const to = "to" in o ? o.to : "after" in o ? o.after : undefined;
        if (from !== undefined || to !== undefined) {
          rows.push({ field, before: display(from), after: display(to) });
        }
      }
    }
    if (rows.length > 0) return rows;
  }

  const before = payload.before;
  const after = payload.after;
  if (
    before && after &&
    typeof before === "object" && typeof after === "object" &&
    !Array.isArray(before) && !Array.isArray(after)
  ) {
    const b = before as Record<string, unknown>;
    const a = after as Record<string, unknown>;
    const keys = [...new Set([...Object.keys(b), ...Object.keys(a)])];
    const rows = keys.map((field) => ({
      field,
      before: display(b[field]),
      after: display(a[field]),
    }));
    if (rows.length > 0) return rows;
  }

  return null;
}

/* -------------------------------------------------------- result preview */

export interface ResultPreview {
  summary: string;
  /** Compact list items when the result carries a list (capped at 5). */
  items: string[];
  /** How many more items exist beyond the preview. */
  more: number;
}

/** Compact, expandable preview of what an execution returned. */
export function resultPreview(
  result: Record<string, unknown> | null
): ResultPreview | null {
  if (!result || typeof result !== "object") return null;
  const summary =
    shortStr(result.summary, 200) ?? shortStr(result.error, 200) ?? "";
  let items: string[] = [];
  for (const [key, v] of Object.entries(result)) {
    if (key === "summary" || key === "error") continue;
    if (Array.isArray(v) && v.length > 0) {
      items = v.slice(0, 5).map((item) =>
        typeof item === "object" && item !== null
          ? display(item).slice(0, 80)
          : String(item).slice(0, 80)
      );
      return { summary, items, more: Math.max(0, v.length - 5) };
    }
  }
  if (!summary) return null;
  return { summary, items, more: 0 };
}

/* -------------------------------------------------------- session counts */

export interface SessionCounts {
  proposed: number;
  executed: number;
  vetoed: number;
  failed: number;
}

/** The quiet audit-trail counter: everything proposed this session, and how it resolved. */
export function sessionCounts(
  actions: ReadonlyArray<Pick<ActionRecord, "status">>
): SessionCounts {
  return {
    proposed: actions.length,
    executed: actions.filter((a) => a.status === "executed").length,
    vetoed: actions.filter((a) => a.status === "vetoed").length,
    failed: actions.filter((a) => a.status === "failed").length,
  };
}

export function sessionCountsLine(c: SessionCounts): string | null {
  if (c.proposed === 0) return null;
  const parts = [`${c.proposed} proposed`, `${c.executed} executed`, `${c.vetoed} vetoed`];
  if (c.failed > 0) parts.push(`${c.failed} failed`);
  return parts.join(" · ");
}
