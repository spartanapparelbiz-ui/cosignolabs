/**
 * The Rollback Engine.
 *
 * Every planned action is asked one question before it is allowed anywhere
 * near production: *how do we take this back?* The answer is computed from the
 * Workspace Model — the inverse of a `create` is the connector's own `delete`
 * operation, the inverse of an `update` is the same update replayed with the
 * captured BEFORE values — and it is computed BEFORE execution, because an
 * undo plan invented after the damage is not a plan, it's a hope.
 *
 * Where an inverse genuinely does not exist (a sent email, an issued refund,
 * a hard delete on a connector with no restore operation) the engine says so
 * plainly and marks the change irreversible. It never claims an undo it cannot
 * perform, and a rollback that is itself destructive requires its own approval.
 */

import type { Authority } from "@/lib/authz/blastRadius";
import type { DigitalTwin, FieldChange, Mutation } from "@/lib/twin/model";

export type RollbackSupport = "full" | "partial" | "none";

export interface RollbackStep {
  title: string;
  detail: string;
  /** The model operation that performs the undo, when one exists. */
  operation: string | null;
  connector: string;
  /** True when cosigno can run it without a human doing anything by hand. */
  automatic: boolean;
}

export interface RollbackPlan {
  supported: RollbackSupport;
  steps: RollbackStep[];
  /** Authority the ROLLBACK itself demands — an undo can be dangerous too. */
  requires: Authority;
  /** Honest order of magnitude, not a fabricated ETA. */
  estimated_recovery: "immediate" | "seconds" | "minutes" | "manual";
  affected_systems: string[];
  /** What this rollback cannot restore. Always shown to the approver. */
  caveats: string[];
}

/** The inverse mutation, if the concept even exists for that verb. */
const INVERSE: Record<Mutation, Mutation | null> = {
  read: null, // nothing to undo
  create: "delete",
  update: "update",
  delete: "create", // only if the connector can recreate it AND we hold the data
};

/**
 * Find an operation on the twin that performs `mutation` against `resource`.
 * Returns null when the connector simply doesn't expose one — which is the
 * single most common reason a change is irreversible.
 */
export function findInverseOperation(
  twin: DigitalTwin | undefined,
  resource: string,
  mutation: Mutation
): string | null {
  const r = twin?.resources.find((x) => x.name === resource);
  return r?.operations.find((o) => o.mutation === mutation)?.id ?? null;
}

export interface RollbackInput {
  twin: DigitalTwin | undefined;
  connector: string;
  resource: string;
  mutation: Mutation;
  /** Field-level before/after captured at plan time — the undo's source data. */
  changes: FieldChange[];
  /** Does the change reach systems beyond its own connector? */
  affected_systems?: string[];
  /** Money is never silently rolled back: a reversal is its own money movement. */
  amount_cents?: number;
}

export function buildRollbackPlan(input: RollbackInput): RollbackPlan {
  const systems = Array.from(new Set([input.connector, ...(input.affected_systems ?? [])])).filter(Boolean);
  const inverse = INVERSE[input.mutation];

  if (input.mutation === "read") {
    return {
      supported: "full",
      steps: [],
      requires: "auto",
      estimated_recovery: "immediate",
      affected_systems: systems,
      caveats: ["Reads change nothing, so there is nothing to roll back."],
    };
  }

  if (!inverse) {
    return irreversible(input, systems, "This operation has no inverse in the Workspace Model.");
  }

  const operation = findInverseOperation(input.twin, input.resource, inverse);
  const resourceLabel = input.resource.replace(/_/g, " ");

  // create → delete: clean, provided the connector exposes a delete.
  if (input.mutation === "create") {
    if (!operation) {
      return irreversible(
        input,
        systems,
        `${input.connector} exposes no delete operation for ${resourceLabel}, so the created record cannot be removed by cosigno.`
      );
    }
    return {
      supported: "full",
      steps: [
        {
          title: `Delete the created ${resourceLabel}`,
          detail: `Runs ${operation} against the record this change created.`,
          operation,
          connector: input.connector,
          automatic: true,
        },
      ],
      // Deleting is destructive even when it is the correct undo.
      requires: "approve",
      estimated_recovery: "seconds",
      affected_systems: systems,
      caveats: sideEffectCaveats(input, systems),
    };
  }

  // update → replay the captured BEFORE values.
  if (input.mutation === "update") {
    if (!operation) {
      return irreversible(
        input,
        systems,
        `${input.connector} exposes no update operation to write the previous values back.`
      );
    }
    if (input.changes.length === 0) {
      return {
        supported: "partial",
        steps: [],
        requires: "approve",
        estimated_recovery: "manual",
        affected_systems: systems,
        caveats: [
          "No field-level before values were captured for this change, so cosigno cannot reconstruct the previous state. Restore it from the connector's own history.",
        ],
      };
    }
    return {
      supported: "full",
      steps: [
        {
          title: `Restore ${input.changes.length} field${input.changes.length === 1 ? "" : "s"} on the ${resourceLabel}`,
          detail: `Replays ${operation} with the values captured before the change: ${input.changes
            .map((c) => `${c.field} → ${format(c.before)}`)
            .join(", ")}.`,
          operation,
          connector: input.connector,
          automatic: true,
        },
      ],
      requires: "approve",
      estimated_recovery: "seconds",
      affected_systems: systems,
      caveats: sideEffectCaveats(input, systems),
    };
  }

  // delete → recreate, and only when we actually hold the record's contents.
  const hasPayload = input.changes.some((c) => c.before !== null && c.before !== undefined);
  if (!operation || !hasPayload) {
    return irreversible(
      input,
      systems,
      !operation
        ? `${input.connector} exposes no create operation for ${resourceLabel}, so a deleted record cannot be rebuilt.`
        : "The record's contents were not captured before deletion, so there is nothing to recreate it from."
    );
  }
  return {
    supported: "partial",
    steps: [
      {
        title: `Recreate the deleted ${resourceLabel}`,
        detail: `Runs ${operation} with the captured contents. The new record will have a NEW id — anything referencing the old id must be repointed.`,
        operation,
        connector: input.connector,
        automatic: true,
      },
    ],
    // Recreating after a delete rewrites identity; it gets the strongest gate.
    requires: "sign",
    estimated_recovery: "minutes",
    affected_systems: systems,
    caveats: [
      "A recreated record is not the original: its id, timestamps, and any connector-generated fields will differ.",
      ...sideEffectCaveats(input, systems),
    ],
  };
}

function irreversible(input: RollbackInput, systems: string[], why: string): RollbackPlan {
  return {
    supported: "none",
    steps: [],
    requires: "deny",
    estimated_recovery: "manual",
    affected_systems: systems,
    caveats: [
      why,
      "This change cannot be undone by cosigno. Approve it only if you accept that it is permanent.",
      ...sideEffectCaveats(input, systems),
    ],
  };
}

function sideEffectCaveats(input: RollbackInput, systems: string[]): string[] {
  const out: string[] = [];
  if ((input.amount_cents ?? 0) > 0) {
    out.push(
      "Money that has already moved is not un-moved by a rollback — the reversal is a second, separate transaction with its own settlement time."
    );
  }
  if (systems.length > 1) {
    out.push(
      `${systems.length} systems are involved (${systems.join(", ")}); rolling back one does not roll back the others, and they will disagree until every step completes.`
    );
  }
  out.push("Anything the change already triggered downstream — notifications, webhooks, emails — has already left and cannot be recalled.");
  return out;
}

function format(v: unknown): string {
  if (v === null || v === undefined) return "empty";
  if (typeof v === "string") return `"${v}"`;
  return String(v);
}
