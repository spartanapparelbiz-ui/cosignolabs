/**
 * Changesets — a pull request for the real world.
 *
 * Nothing executes from a description. Every planned action first becomes a
 * Changeset: exactly what would be added, modified and deleted, which systems
 * it reaches, what it costs, what it risks, which permissions it consumes, and
 * how it would be rolled back. A human reads that and approves it — or doesn't.
 *
 * The changeset is computed against the Workspace Model, never against
 * production. An operation the model doesn't declare produces a REFUSED
 * changeset rather than an attempted call, which is the property that stops a
 * planner from inventing an endpoint and finding out what happens.
 */

import { assessBlastRadius, maxAuthority, type Authority, type BlastAssessment } from "@/lib/authz/blastRadius";
import { previewChange, type DigitalTwin, type FieldChange } from "@/lib/twin/model";
import { canonicalize, permissionFor } from "./canonical";
import { analyzeDependencies, type DependencyReport } from "./dependencies";
import { buildRollbackPlan, type RollbackPlan } from "./rollback";
import { resourceNodeId, type WorkspaceGraph } from "./graph";

export interface ChangeEntry {
  kind: "added" | "modified" | "deleted";
  /** Human label of the object the entry touches. */
  object: string;
  connector: string;
  field?: string;
  before?: unknown;
  after?: unknown;
}

export interface CostEstimate {
  /** Money the change moves, in cents. `null` when none was declared. */
  amount_cents: number | null;
  /** How many API calls the change is expected to make. */
  api_calls: number;
  /** Where the number came from — or why there isn't one. */
  basis: string;
}

export interface Changeset {
  id: string;
  title: string;
  operation: string;
  connector: string;
  resource: string;
  entries: ChangeEntry[];
  added: number;
  modified: number;
  deleted: number;
  affected_systems: string[];
  cost: CostEstimate;
  risk: BlastAssessment;
  required_permissions: string[];
  rollback: RollbackPlan;
  /** The authority needed to approve THIS changeset. */
  requires: Authority;
  /** True when the model refuses the operation outright. */
  refused: boolean;
  refusal_reason: string | null;
  summary: string;
  impact: DependencyReport | null;
}

export interface ChangesetInput {
  twin: DigitalTwin | undefined;
  graph?: WorkspaceGraph;
  /** Operation id as declared by the twin, e.g. "create_refund". */
  operation: string;
  before?: Record<string, unknown>;
  after?: Record<string, unknown>;
  /** Records the change touches, when the caller genuinely knows. */
  records_affected?: number;
  external_recipients?: number;
  pii?: boolean;
  production?: boolean;
}

/**
 * Stable, content-derived id. Deterministic on purpose: the same proposed
 * change always yields the same changeset id, so a re-plan is recognizable as
 * the same change rather than a new one.
 */
export function changesetId(connector: string, operation: string, changes: FieldChange[]): string {
  const seed = `${connector}:${operation}:${changes.map((c) => `${c.field}=${JSON.stringify(c.after)}`).join("|")}`;
  let hash = 0x811c9dc5;
  for (let i = 0; i < seed.length; i++) {
    hash ^= seed.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return `cs_${hash.toString(16).padStart(8, "0")}`;
}

export function buildChangeset(input: ChangesetInput): Changeset {
  const before = input.before ?? {};
  const after = input.after ?? {};
  const connector = input.twin?.connection_key ?? "unknown";

  if (!input.twin) {
    return refusedChangeset(
      connector,
      input.operation,
      `No Workspace Model exists for "${connector}". cosigno will not call a system it has not modelled.`
    );
  }

  const preview = previewChange(input.twin, input.operation, before, after);
  if (preview.unknown_operation) {
    return refusedChangeset(connector, input.operation, preview.effect);
  }

  const canonical = canonicalize(preview.resource);
  const op = input.twin.resources
    .find((r) => r.name === preview.resource)
    ?.operations.find((o) => o.id === input.operation);

  const amountCents =
    typeof after.amount_cents === "number"
      ? after.amount_cents
      : typeof after.amount === "number"
        ? after.amount
        : null;

  // Impact across the whole workspace, when a graph was supplied.
  const impact = input.graph
    ? analyzeDependencies(input.graph, resourceNodeId(connector, preview.resource), {
        action: preview.mutation === "read" ? "read" : preview.mutation === "delete" ? "delete" : "update",
      })
    : null;

  const affectedSystems = Array.from(new Set([connector, ...(impact?.systems ?? [])]));

  const entries = toEntries(preview.mutation, canonical.label, connector, preview.changes);

  const risk = assessBlastRadius({
    amount_cents: amountCents ?? undefined,
    records_affected: preview.mutation === "read" ? 0 : (input.records_affected ?? 1),
    external_recipients: input.external_recipients,
    reversible: preview.reversible,
    pii: input.pii,
    production: input.production,
    credential_change: canonical.type === "secret" || canonical.type === "permission",
  });

  const rollback = buildRollbackPlan({
    twin: input.twin,
    connector,
    resource: preview.resource,
    mutation: preview.mutation,
    changes: preview.changes,
    affected_systems: affectedSystems,
    amount_cents: amountCents ?? undefined,
  });

  const permissions = new Set<string>([permissionFor(canonical, preview.mutation)]);
  // A rollback that runs a different operation needs its own grant, and the
  // approver should see that before approving, not at undo time.
  for (const step of rollback.steps) {
    if (!step.operation) continue;
    const stepOp = input.twin.resources
      .flatMap((r) => r.operations)
      .find((o) => o.id === step.operation);
    if (stepOp) permissions.add(permissionFor(canonical, stepOp.mutation));
  }

  // Authority is the MAX of everything that has an opinion: the twin's tier
  // floor, the blast radius, and the operation's own category. It can only be
  // raised here, never lowered.
  const requires = [
    preview.requires as Authority,
    risk.required_authority,
    op?.tier === 3 ? ("sign" as Authority) : ("auto" as Authority),
  ].reduce((a, b) => maxAuthority(a, b), "auto" as Authority);

  const changes = preview.changes;

  return {
    id: changesetId(connector, input.operation, changes),
    title: `${preview.mutation === "delete" ? "Delete" : preview.mutation === "create" ? "Create" : preview.mutation === "update" ? "Update" : "Read"} ${canonical.label.toLowerCase()} · ${input.twin.name}`,
    operation: input.operation,
    connector,
    resource: preview.resource,
    entries,
    added: entries.filter((e) => e.kind === "added").length,
    modified: entries.filter((e) => e.kind === "modified").length,
    deleted: entries.filter((e) => e.kind === "deleted").length,
    affected_systems: affectedSystems,
    cost: {
      amount_cents: amountCents,
      api_calls: 1 + rollback.steps.length,
      basis:
        amountCents === null
          ? "No monetary amount is declared in this payload, so cosigno reports no cost rather than guessing one."
          : `Declared amount on the payload: ${(amountCents / 100).toLocaleString("en-US", { style: "currency", currency: "USD" })}.`,
    },
    risk,
    required_permissions: [...permissions].sort(),
    rollback,
    requires,
    refused: false,
    refusal_reason: null,
    summary: preview.effect,
    impact,
  };
}

function toEntries(
  mutation: string,
  objectLabel: string,
  connector: string,
  changes: FieldChange[]
): ChangeEntry[] {
  if (mutation === "read") return [];
  const kind: ChangeEntry["kind"] =
    mutation === "create" ? "added" : mutation === "delete" ? "deleted" : "modified";

  if (changes.length === 0) {
    return [{ kind, object: objectLabel, connector }];
  }
  return changes.map((c) => ({
    kind,
    object: objectLabel,
    connector,
    field: c.field,
    before: c.before,
    after: c.after,
  }));
}

function refusedChangeset(connector: string, operation: string, reason: string): Changeset {
  return {
    id: changesetId(connector, operation, []),
    title: `Refused · ${operation}`,
    operation,
    connector,
    resource: "unknown",
    entries: [],
    added: 0,
    modified: 0,
    deleted: 0,
    affected_systems: [],
    cost: { amount_cents: null, api_calls: 0, basis: "Nothing will run, so nothing is spent." },
    risk: assessBlastRadius({ records_affected: 0, reversible: true }),
    required_permissions: [],
    rollback: {
      supported: "full",
      steps: [],
      requires: "auto",
      estimated_recovery: "immediate",
      affected_systems: [],
      caveats: ["Nothing executes, so there is nothing to roll back."],
    },
    requires: "deny",
    refused: true,
    refusal_reason: reason,
    summary: reason,
    impact: null,
  };
}
