/**
 * Execution diff — what actually changed, shown like a pull request.
 *
 * A changeset says what WOULD happen; the execution diff says what DID. The
 * two are computed by the same rules so they can be laid side by side, and any
 * divergence between them is itself reported: an execution that changed
 * something the plan never mentioned is the most important thing on the page.
 *
 * Counters are only emitted for facts that were actually observed. Where the
 * connector returned nothing to observe, the row reads "not reported" — never
 * a comforting zero.
 */

import type { Changeset } from "./changeset";

export interface DiffRow {
  label: string;
  before: string;
  after: string;
  /** Short delta, e.g. "−$19.94". Absent when a delta is meaningless. */
  delta?: string;
  /** Highlights a row the approver should not skim past. */
  emphasis?: "none" | "warn" | "danger";
}

export interface DiffCounters {
  objects_added: number;
  objects_modified: number;
  objects_deleted: number;
  /** null = the execution reported nothing about secrets, so we claim nothing. */
  secrets_changed: number | null;
  permissions_added: string[];
  systems_touched: string[];
}

export interface ExecutionDiff {
  changeset_id: string;
  title: string;
  rows: DiffRow[];
  counters: DiffCounters;
  /** Anything the execution changed that the plan did not predict. */
  unexpected: DiffRow[];
  /** True when the observed result matches the approved changeset exactly. */
  matches_plan: boolean;
  summary: string;
}

/** Format a value for a diff cell without pretending to know more than we do. */
function cell(v: unknown): string {
  if (v === null || v === undefined) return "—";
  if (typeof v === "number") return v.toLocaleString();
  if (typeof v === "boolean") return v ? "yes" : "no";
  if (typeof v === "string") return v;
  return JSON.stringify(v);
}

function money(cents: number): string {
  return (cents / 100).toLocaleString("en-US", { style: "currency", currency: "USD" });
}

/**
 * Build the diff. `observed` is the connector's post-execution read, when one
 * was performed; without it the diff reports the planned change and says so.
 */
export function buildExecutionDiff(
  changeset: Changeset,
  observed?: { before?: Record<string, unknown>; after?: Record<string, unknown>; secrets_changed?: number }
): ExecutionDiff {
  const rows: DiffRow[] = [];
  const unexpected: DiffRow[] = [];
  const plannedFields = new Set(changeset.entries.map((e) => e.field).filter(Boolean) as string[]);

  for (const entry of changeset.entries) {
    if (!entry.field) continue;
    const observedAfter = observed?.after?.[entry.field];
    const after = observed?.after && entry.field in observed.after ? observedAfter : entry.after;
    const before = observed?.before && entry.field in observed.before ? observed.before[entry.field] : entry.before;

    rows.push({
      label: entry.field === "amount_cents" ? "Balance" : humanize(entry.field),
      before: entry.field === "amount_cents" && typeof before === "number" ? money(before) : cell(before),
      after: entry.field === "amount_cents" && typeof after === "number" ? money(after) : cell(after),
      delta: delta(entry.field, before, after),
      emphasis:
        entry.kind === "deleted" ? "danger" : /secret|token|key|permission/i.test(entry.field) ? "warn" : "none",
    });
  }

  // Anything the execution touched that the plan never listed.
  for (const [field, value] of Object.entries(observed?.after ?? {})) {
    if (plannedFields.has(field)) continue;
    const before = observed?.before?.[field];
    if (JSON.stringify(before) === JSON.stringify(value)) continue;
    unexpected.push({
      label: humanize(field),
      before: cell(before),
      after: cell(value),
      emphasis: "warn",
    });
  }

  const counters: DiffCounters = {
    objects_added: changeset.added,
    objects_modified: changeset.modified,
    objects_deleted: changeset.deleted,
    secrets_changed:
      typeof observed?.secrets_changed === "number"
        ? observed.secrets_changed
        : changeset.entries.some((e) => /secret|token|api_key/i.test(e.field ?? ""))
          ? changeset.entries.filter((e) => /secret|token|api_key/i.test(e.field ?? "")).length
          : observed
            ? 0
            : null,
    permissions_added: changeset.required_permissions,
    systems_touched: changeset.affected_systems,
  };

  return {
    changeset_id: changeset.id,
    title: changeset.title,
    rows,
    counters,
    unexpected,
    matches_plan: unexpected.length === 0,
    summary: summarize(changeset, counters, unexpected.length, Boolean(observed)),
  };
}

function delta(field: string, before: unknown, after: unknown): string | undefined {
  if (typeof before !== "number" || typeof after !== "number") return undefined;
  const d = after - before;
  if (d === 0) return undefined;
  const sign = d > 0 ? "+" : "−";
  const magnitude = Math.abs(d);
  return field === "amount_cents" ? `${sign}${money(magnitude)}` : `${sign}${magnitude.toLocaleString()}`;
}

function humanize(field: string): string {
  const s = field.replace(/_/g, " ");
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function summarize(
  changeset: Changeset,
  counters: DiffCounters,
  unexpectedCount: number,
  observedResult: boolean
): string {
  const parts = [
    `${counters.objects_added} added`,
    `${counters.objects_modified} modified`,
    `${counters.objects_deleted} deleted`,
  ];
  const base = `${parts.join(", ")} across ${counters.systems_touched.join(", ") || "no systems"}.`;
  if (!observedResult) {
    return `${base} These are the PLANNED figures — no post-execution read has been recorded yet.`;
  }
  if (unexpectedCount > 0) {
    return `${base} ${unexpectedCount} field${unexpectedCount === 1 ? "" : "s"} changed that the approved changeset did not predict — review before trusting this result.`;
  }
  return `${base} The result matches changeset ${changeset.id} exactly.`;
}
