import type { ActionPreview, ActionRecord } from "@/lib/types";
import { previewChange, type DigitalTwin } from "@/lib/twin/model";
import { collectTwins } from "@/lib/twin/collect";
import { buildRollbackPlan } from "./rollback";

/**
 * The Workspace Model, on the approval card.
 *
 * This is where the model stops being a diagram and starts doing work. Before
 * a human approves a connector action, the model answers the question the
 * engine's tier cannot: *if this turns out to be wrong, can we take it back?*
 *
 * The answer is derived from operations the connection ACTUALLY declares — the
 * undo for a create is that connector's own delete, and if it doesn't expose
 * one, the card says the action is permanent instead of implying a rescue that
 * doesn't exist.
 *
 * WHAT THIS DELIBERATELY DOES NOT DO:
 *   · It does not decide anything. Tier, authority, and every gate stay
 *     exactly where they are; this only explains.
 *   · It does not claim a restore it cannot perform. A connector call carries
 *     the values going IN, never the values already there, so an update
 *     reports that the previous state was never captured rather than offering
 *     to "restore" fields it has no values for.
 */

/** The payload shape `proposeConnectorAction` writes for every connector call. */
interface ConnectorPayload {
  kind?: unknown;
  connection_id?: unknown;
  action?: unknown;
  tool?: unknown;
  args?: unknown;
}

function connectorTarget(action: ActionRecord): { connectionId: string; operation: string } | null {
  if (action.category !== "connection_call") return null;
  const p = (action.payload ?? {}) as ConnectorPayload;
  const connectionId = typeof p.connection_id === "string" ? p.connection_id : null;
  const operation =
    typeof p.action === "string" ? p.action : typeof p.tool === "string" ? p.tool : null;
  if (!connectionId || !operation) return null;
  return { connectionId, operation };
}

/** Build the preview for one action against an already-derived twin. */
export function previewAgainstTwin(
  twin: DigitalTwin | undefined,
  operation: string,
  args: Record<string, unknown>
): ActionPreview {
  if (!twin) {
    return {
      operation,
      resource: "unknown",
      mutation: "read",
      undo_support: "none",
      undo: "This connection no longer exists, so cosigno cannot say what this would do — or undo it.",
      unknown_operation: true,
      unknown_connection: true,
    };
  }

  const preview = previewChange(twin, operation, {}, args);
  if (preview.unknown_operation) {
    return {
      operation,
      resource: "unknown",
      mutation: "read",
      undo_support: "none",
      undo: `${twin.name} no longer offers "${operation}". This card was proposed against a capability that has since disappeared — reject it and ask again.`,
      unknown_operation: true,
      unknown_connection: false,
    };
  }

  // `changes: []` is the honest input here: a connector call carries the values
  // going in, never a captured before-state. Passing the incoming args as if
  // they were "before" values would make the rollback engine offer to restore
  // data it has never seen.
  const rollback = buildRollbackPlan({
    twin,
    connector: twin.connection_key,
    resource: preview.resource,
    mutation: preview.mutation,
    changes: [],
  });

  return {
    operation,
    resource: preview.resource,
    mutation: preview.mutation,
    undo_support: rollback.supported,
    undo: undoSentence(twin, preview.mutation, rollback.supported, rollback.steps[0]?.operation ?? null, rollback.caveats),
    unknown_operation: false,
    unknown_connection: false,
  };
}

function undoSentence(
  twin: DigitalTwin,
  mutation: ActionPreview["mutation"],
  support: ActionPreview["undo_support"],
  inverseOperation: string | null,
  caveats: string[]
): string {
  if (mutation === "read") return "Nothing to undo — this only reads.";
  if (support === "full" && inverseOperation) {
    return `cosigno can undo this by running ${inverseOperation} on ${twin.name}.`;
  }
  if (support === "partial") {
    return `Only partly reversible: ${caveats[0] ?? "some of this cannot be restored."}`;
  }
  return caveats[0] ?? "This cannot be undone by cosigno.";
}

/**
 * Preview every connector action in a list. Twins are derived ONCE for the
 * user and shared across the batch, so listing an inbox of fifty cards costs
 * one derivation rather than fifty.
 *
 * Never throws: a preview is an explanation, and a failure to explain must not
 * take down the approval queue. An action with no preview simply renders as it
 * always did.
 */
export async function previewForActions(
  userId: string,
  actions: readonly ActionRecord[]
): Promise<Record<string, ActionPreview>> {
  const targets = actions
    .map((a) => ({ action: a, target: connectorTarget(a) }))
    .filter((x): x is { action: ActionRecord; target: { connectionId: string; operation: string } } =>
      x.target !== null
    );
  if (targets.length === 0) return {};

  try {
    const collected = await collectTwins(userId);
    const byConnection = new Map(collected.map((c) => [c.twin.connection_key, c.twin]));

    const out: Record<string, ActionPreview> = {};
    for (const { action, target } of targets) {
      const args = ((action.payload ?? {}) as ConnectorPayload).args;
      out[action.id] = previewAgainstTwin(
        byConnection.get(target.connectionId),
        target.operation,
        (args && typeof args === "object" && !Array.isArray(args) ? args : {}) as Record<string, unknown>
      );
    }
    return out;
  } catch {
    return {};
  }
}
