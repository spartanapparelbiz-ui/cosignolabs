import { CATEGORIES } from "@/lib/types";
import type { ActionCategory, Tier } from "@/lib/types";
import { assessBlastRadius } from "@/lib/authz/blastRadius";

/**
 * Digital twins.
 *
 * A twin is a TYPED STRUCTURAL MODEL of a connected application: which resource
 * types it exposes, which operations exist on each, what each operation mutates,
 * and what authority it therefore requires. The planner reasons against this
 * model instead of guessing endpoints — an operation that isn't in the twin
 * cannot be planned, so a malformed or invented API call never reaches the
 * network.
 *
 * IMPORTANT — what a twin is and is not:
 *   · It IS a capability/schema mirror, derived from the provider's real
 *     declared actions (and, for MCP/OpenAPI connections, from their real tool
 *     and operation schemas).
 *   · It is NOT a data mirror. It does not claim to hold your actual
 *     repositories, customers, or orders. Instance counts appear only where a
 *     connector has genuinely synced them; otherwise the twin reports the
 *     resource type as un-synced rather than inventing a number.
 *
 * That boundary is the whole point: the model is trustworthy precisely because
 * it never asserts state it hasn't observed.
 */

export type Mutation = "read" | "create" | "update" | "delete";

export interface TwinOperation {
  /** Provider-scoped action id, e.g. "create_issue". */
  id: string;
  /** Derived verb. */
  mutation: Mutation;
  summary: string;
  /** Does it change the outside world? */
  mutates: boolean;
  /** Category the Boundary maps it to — supplies the un-lowerable floor. */
  category: ActionCategory;
  tier: Tier;
  reversible: boolean;
}

export interface TwinResource {
  /** Singular resource name, e.g. "issue". */
  name: string;
  label: string;
  operations: TwinOperation[];
  /**
   * How many instances of this resource the twin has actually observed.
   * `null` means "not synced" — never zero-as-unknown.
   */
  synced_count: number | null;
}

export interface DigitalTwin {
  connection_key: string;
  name: string;
  kind: "app" | "mcp";
  status: string;
  /** Where the model came from — provider registry, MCP schema, or OpenAPI. */
  source: "provider" | "mcp" | "openapi";
  resources: TwinResource[];
  operation_count: number;
  /** True when NO resource has synced instances (capability-only twin). */
  schema_only: boolean;
}

/* -------------------------------------------------------------------------- */
/* derivation                                                                  */
/* -------------------------------------------------------------------------- */

const VERB_MAP: Record<string, Mutation> = {
  list: "read", get: "read", search: "read", read: "read", fetch: "read", find: "read",
  create: "create", add: "create", send: "create", post: "create", open: "create", upload: "create",
  update: "update", edit: "update", set: "update", move: "update", label: "update",
  archive: "update", close: "update", merge: "update", comment: "create", reply: "create",
  delete: "delete", remove: "delete", drop: "delete", revoke: "delete",
};

/** Reversibility by mutation class — deletes and sends can't be taken back. */
const REVERSIBLE: Record<Mutation, boolean> = {
  read: true,
  create: false,
  update: true,
  delete: false,
};

/**
 * Split a provider action id into (verb, resource). Ids follow the codebase's
 * own `verb_resource` convention ("create_issue", "list_repositories").
 */
export function splitActionId(id: string): { verb: string; resource: string } {
  const parts = id.split(/[_.]/).filter(Boolean);
  if (parts.length === 1) return { verb: parts[0], resource: "item" };
  const [verb, ...rest] = parts;
  return { verb, resource: rest.join("_") };
}

export function mutationOf(verb: string, mutates: boolean): Mutation {
  return VERB_MAP[verb] ?? (mutates ? "update" : "read");
}

/**
 * Normalize a resource key to its singular form so `list_issues` and
 * `create_issue` land on ONE resource. Without this the twin shows the same
 * resource twice with its operations split across both.
 */
export function singularize(resource: string): string {
  if (/ies$/.test(resource)) return resource.replace(/ies$/, "y");
  if (/(ss|us|is)$/.test(resource)) return resource;
  if (/s$/.test(resource)) return resource.replace(/s$/, "");
  return resource;
}

/** Singular→display label ("pull_request" → "Pull requests"). */
function labelOf(resource: string): string {
  const words = singularize(resource).replace(/_/g, " ");
  const plural = /y$/.test(words) ? words.replace(/y$/, "ies") : `${words}s`;
  return plural.charAt(0).toUpperCase() + plural.slice(1);
}

/** Map a twin operation onto the Boundary's category vocabulary. */
export function categoryFor(mutation: Mutation, resource: string): ActionCategory {
  if (mutation === "delete") return "delete";
  if (/payment|charge|invoice/.test(resource)) return "payment";
  if (/refund/.test(resource)) return "refund";
  if (mutation === "read") return "search";
  if (/message|email|mail/.test(resource)) return "send_email";
  if (/post|content|tweet/.test(resource)) return "post_content";
  return "update_record";
}

export interface RawAction {
  id: string;
  summary: string;
  mutates: boolean;
}

/**
 * Build a twin from a connection's REAL declared actions. Nothing here is
 * invented: every operation corresponds to an action the provider (or MCP
 * server, or imported OpenAPI document) actually exposes.
 */
export function buildTwin(input: {
  connection_key: string;
  name: string;
  kind: "app" | "mcp";
  status: string;
  source: DigitalTwin["source"];
  actions: RawAction[];
  /** Observed instance counts, keyed by resource. Absent ⇒ un-synced. */
  syncedCounts?: Record<string, number>;
}): DigitalTwin {
  const byResource = new Map<string, TwinOperation[]>();

  for (const a of input.actions) {
    const { verb, resource: raw } = splitActionId(a.id);
    const resource = singularize(raw);
    const mutation = mutationOf(verb, a.mutates);
    const category = categoryFor(mutation, resource);
    const meta = CATEGORIES[category];
    const tier: Tier = meta?.pinned ? 3 : meta?.defaultTier ?? 2;

    const op: TwinOperation = {
      id: a.id,
      mutation,
      summary: a.summary,
      mutates: a.mutates,
      category,
      tier,
      reversible: REVERSIBLE[mutation],
    };
    byResource.set(resource, [...(byResource.get(resource) ?? []), op]);
  }

  const resources: TwinResource[] = [...byResource.entries()]
    .map(([name, operations]) => ({
      name,
      label: labelOf(name),
      operations: operations.sort((x, y) => x.mutation.localeCompare(y.mutation)),
      synced_count: input.syncedCounts?.[name] ?? null,
    }))
    .sort((a, b) => a.label.localeCompare(b.label));

  return {
    connection_key: input.connection_key,
    name: input.name,
    kind: input.kind,
    status: input.status,
    source: input.source,
    resources,
    operation_count: input.actions.length,
    schema_only: resources.every((r) => r.synced_count === null),
  };
}

/* -------------------------------------------------------------------------- */
/* change preview                                                              */
/* -------------------------------------------------------------------------- */

export interface FieldChange {
  field: string;
  before: unknown;
  after: unknown;
}

export interface ChangePreview {
  operation: string;
  resource: string;
  mutation: Mutation;
  /** Field-level before → after for the exact payload proposed. */
  changes: FieldChange[];
  reversible: boolean;
  requires: "auto" | "approve" | "sign" | "deny";
  blast_level: string;
  /** Plain-language statement of what will happen if approved. */
  effect: string;
  /** True when the twin has no such operation — the call is refused. */
  unknown_operation: boolean;
}

/**
 * Preview a proposed change against the twin. An operation the twin doesn't
 * declare is REFUSED rather than attempted: the planner cannot invent an
 * endpoint, which is the core safety property of reasoning over a model.
 */
export function previewChange(
  twin: DigitalTwin,
  operationId: string,
  before: Record<string, unknown>,
  after: Record<string, unknown>
): ChangePreview {
  const resource = twin.resources.find((r) => r.operations.some((o) => o.id === operationId));
  const op = resource?.operations.find((o) => o.id === operationId);

  if (!op || !resource) {
    return {
      operation: operationId,
      resource: "unknown",
      mutation: "read",
      changes: [],
      reversible: true,
      requires: "deny",
      blast_level: "unknown",
      effect: `"${operationId}" is not an operation this connection exposes — cosigno will not attempt it.`,
      unknown_operation: true,
    };
  }

  const keys = Array.from(new Set([...Object.keys(before), ...Object.keys(after)])).sort();
  const changes: FieldChange[] = keys
    .filter((k) => JSON.stringify(before[k]) !== JSON.stringify(after[k]))
    .map((k) => ({ field: k, before: before[k] ?? null, after: after[k] ?? null }));

  const blast = assessBlastRadius({
    reversible: op.reversible,
    records_affected: op.mutation === "read" ? 0 : 1,
    amount_cents: typeof after.amount_cents === "number" ? after.amount_cents : undefined,
  });

  const requires: ChangePreview["requires"] =
    op.tier === 3 ? "sign" : op.tier === 2 ? "approve" : blast.required_authority;

  const verb =
    op.mutation === "delete"
      ? "permanently remove"
      : op.mutation === "create"
        ? "create"
        : op.mutation === "update"
          ? "change"
          : "read";

  return {
    operation: operationId,
    resource: resource.name,
    mutation: op.mutation,
    changes,
    reversible: op.reversible,
    requires,
    blast_level: blast.level,
    effect:
      op.mutation === "read"
        ? `Reads ${resource.label.toLowerCase()}. Nothing changes.`
        : `Will ${verb} ${changes.length || "several"} field${changes.length === 1 ? "" : "s"} on this ${resource.name.replace(/_/g, " ")}${op.reversible ? "" : " — this cannot be undone"}.`,
    unknown_operation: false,
  };
}
