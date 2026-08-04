/**
 * The Planning Engine.
 *
 * An AI given a task does not execute it. It builds an Execution Plan against
 * the Workspace Model and shows its work:
 *
 *   locate → verify → policy → simulate → estimate → approve → execute → confirm
 *
 * Every step is inspectable before anything is approved, and every step that
 * touches the outside world names the exact modelled operation it would call.
 * A step whose operation does not exist in the model is BLOCKED, and a plan
 * containing a blocked step is not executable — the planner cannot route around
 * the model by inventing an endpoint.
 *
 * The plan is deterministic. Given the same model and the same request it is
 * byte-for-byte identical, which is what makes it reviewable, diffable, and
 * replayable in an audit six months later.
 */

import type { Authority } from "@/lib/authz/blastRadius";
import type { DigitalTwin } from "@/lib/twin/model";
import { buildChangeset, type Changeset } from "./changeset";
import type { WorkspaceGraph } from "./graph";

export type StepKind =
  | "locate"
  | "verify"
  | "policy"
  | "simulate"
  | "estimate"
  | "approve"
  | "execute"
  | "confirm";

export type StepStatus = "ready" | "blocked";

export interface PlanStep {
  index: number;
  kind: StepKind;
  title: string;
  detail: string;
  /** The modelled operation this step runs, when it runs one. */
  operation: string | null;
  connector: string | null;
  /** Does this step change the outside world? Only `execute` ever does. */
  mutates: boolean;
  status: StepStatus;
  blocked_reason?: string;
}

export interface ExecutionPlan {
  id: string;
  goal: string;
  steps: PlanStep[];
  changeset: Changeset;
  /** Authority required before the execute step may run. */
  requires: Authority;
  /** False when any step is blocked — the plan cannot proceed as written. */
  executable: boolean;
  /** Everything the model refuses to do, stated plainly. */
  refusals: string[];
  created_at: string;
}

export interface PlanRequest {
  goal: string;
  /** Connector key the goal targets. */
  connector: string;
  /** Operation id as declared by that connector's twin. */
  operation: string;
  before?: Record<string, unknown>;
  after?: Record<string, unknown>;
  records_affected?: number;
  external_recipients?: number;
  pii?: boolean;
  production?: boolean;
}

export function buildPlan(
  req: PlanRequest,
  twins: DigitalTwin[],
  graph?: WorkspaceGraph,
  now = new Date().toISOString()
): ExecutionPlan {
  const twin = twins.find((t) => t.connection_key === req.connector);
  const changeset = buildChangeset({
    twin,
    graph,
    operation: req.operation,
    before: req.before,
    after: req.after,
    records_affected: req.records_affected,
    external_recipients: req.external_recipients,
    pii: req.pii,
    production: req.production,
  });

  const refusals: string[] = [];
  if (changeset.refused && changeset.refusal_reason) refusals.push(changeset.refusal_reason);
  if (changeset.rollback.supported === "none") {
    refusals.push(
      "This change cannot be rolled back by cosigno. It will still run if you approve it, but the undo step is a human one."
    );
  }

  const blocked = changeset.refused;
  const resourceLabel = changeset.resource.replace(/_/g, " ");
  const connected = twin?.status === "connected";

  const steps: PlanStep[] = [];
  const push = (s: Omit<PlanStep, "index">) => steps.push({ ...s, index: steps.length + 1 });

  push({
    kind: "locate",
    title: `Locate the ${resourceLabel} in the Workspace Model`,
    detail: twin
      ? `Resolves the target against ${twin.name}'s model (${twin.resources.length} resource types, ${twin.operation_count} operations). No production call is made to do this.`
      : `No model exists for "${req.connector}", so the target cannot be resolved.`,
    operation: null,
    connector: req.connector,
    mutates: false,
    status: twin ? "ready" : "blocked",
    blocked_reason: twin ? undefined : `"${req.connector}" is not a modelled connection.`,
  });

  push({
    kind: "verify",
    title: `Verify ${req.operation} exists and is permitted`,
    detail: changeset.refused
      ? changeset.refusal_reason ?? "The operation is not declared by this connection."
      : `${req.operation} is declared by the model and requires ${changeset.required_permissions.join(", ")}.`,
    operation: changeset.refused ? null : req.operation,
    connector: req.connector,
    mutates: false,
    status: changeset.refused ? "blocked" : "ready",
    blocked_reason: changeset.refused ? changeset.refusal_reason ?? undefined : undefined,
  });

  push({
    kind: "policy",
    title: "Evaluate workspace policy",
    detail: `Blast radius is ${changeset.risk.level} (${changeset.risk.dimensions
      .filter((d) => d.score > 0)
      .map((d) => `${d.dimension}: ${d.reason}`)
      .join("; ") || "no dimension scored above zero"}). Policy therefore requires ${changeset.requires}.`,
    operation: null,
    connector: null,
    mutates: false,
    status: "ready",
  });

  push({
    kind: "simulate",
    title: "Simulate the outcome against the model",
    detail: changeset.entries.length
      ? `${changeset.added} added, ${changeset.modified} modified, ${changeset.deleted} deleted across ${changeset.affected_systems.length} system${changeset.affected_systems.length === 1 ? "" : "s"}. Simulation runs entirely against the Workspace Model — production is untouched.`
      : "This operation reads only; the simulation confirms nothing would change.",
    operation: null,
    connector: req.connector,
    mutates: false,
    status: "ready",
  });

  push({
    kind: "estimate",
    title: "Estimate cost and impact",
    detail: `${changeset.cost.basis} ${changeset.impact ? changeset.impact.summary : "No workspace graph was supplied, so cross-system impact was not computed."}`,
    operation: null,
    connector: null,
    mutates: false,
    status: "ready",
  });

  push({
    kind: "approve",
    title:
      changeset.requires === "auto"
        ? "No approval required at this authority"
        : changeset.requires === "deny"
          ? "Blocked by policy — cannot be approved"
          : `Request ${changeset.requires === "sign" ? "a signature" : "approval"}`,
    detail:
      changeset.requires === "auto"
        ? "This clears automatically under the current policy, and is still recorded on the ledger."
        : `A human must ${changeset.requires === "sign" ? "sign" : "approve"} changeset ${changeset.id} before the execute step runs.`,
    operation: null,
    connector: null,
    mutates: false,
    status: changeset.requires === "deny" ? "blocked" : "ready",
    blocked_reason: changeset.requires === "deny" ? "Policy denies this action outright." : undefined,
  });

  push({
    kind: "execute",
    title: `Execute ${req.operation}`,
    detail: connected
      ? `Runs the approved changeset against ${twin?.name}. This is the FIRST step that touches production.`
      : `${twin?.name ?? req.connector} is not connected (${twin?.status ?? "unknown"}), so execution would fail at this step.`,
    operation: changeset.refused ? null : req.operation,
    connector: req.connector,
    mutates: changeset.entries.length > 0,
    status: blocked || !connected ? "blocked" : "ready",
    blocked_reason: blocked
      ? "The verify step failed; nothing will be executed."
      : connected
        ? undefined
        : `Connection status is "${twin?.status ?? "unknown"}".`,
  });

  push({
    kind: "confirm",
    title: "Verify the result and record the diff",
    detail:
      changeset.rollback.supported === "none"
        ? "Re-reads the object, records the execution diff, and notes that no automatic rollback is available."
        : `Re-reads the object, records the execution diff, and arms the rollback plan (${changeset.rollback.steps.length} step${changeset.rollback.steps.length === 1 ? "" : "s"}, recovery ${changeset.rollback.estimated_recovery}).`,
    operation: null,
    connector: req.connector,
    mutates: false,
    status: "ready",
  });

  return {
    id: `plan_${changeset.id.slice(3)}`,
    goal: req.goal,
    steps,
    changeset,
    requires: changeset.requires,
    executable: steps.every((s) => s.status === "ready"),
    refusals,
    created_at: now,
  };
}
