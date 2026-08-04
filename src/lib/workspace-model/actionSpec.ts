import type { DeclaredInput, DigitalTwin, TwinOperation } from "@/lib/twin/model";
import { businessAction } from "@/lib/actionLibrary";
import { actionRisk, requiredApproval, type RiskLevel } from "@/lib/risk";
import { canonicalize, permissionFor } from "./canonical";
import { buildRollbackPlan } from "./rollback";

/**
 * The Universal Action Model.
 *
 * A user should never have to ask "can cosigno do this?" — only "can the
 * connected system do this?". For that to be true, every action from every
 * kind of connection has to describe itself in the SAME shape, whether it came
 * from a first-party provider, an MCP server, or an API somebody imported ten
 * minutes ago:
 *
 *   name · description · inputs · expected result · permissions · risk ·
 *   approval · validation · success criteria · verification · rollback
 *
 * Every field is DERIVED from what the connector actually declares. Where it
 * declared nothing, the spec says so — `inputs_declared: false` is a real
 * answer, and it is very different from "this action takes no inputs".
 *
 * The field that earns its place most is `verification`: the read operation
 * that would confirm the write actually happened. Completion means the outcome
 * was achieved, not that a request was sent, and the model is what makes that
 * checkable rather than aspirational.
 */

export interface ActionInputSpec extends DeclaredInput {
  /** Human label — "Customer id", not "customer_id". */
  label: string;
}

export interface ActionSpec {
  id: string;
  /** The business name, from the Action Library. One name everywhere. */
  name: string;
  description: string;
  connection: string;
  connection_key: string;
  resource: string;
  mutation: TwinOperation["mutation"];

  inputs: ActionInputSpec[];
  /** False when the connector never declared its parameters. */
  inputs_declared: boolean;

  expected_result: string;
  permissions: string[];
  risk: RiskLevel;
  risk_because: string;
  approval: string;
  /** Rules that must hold before this runs, in words. */
  validation: string[];
  /** What "done" means for this action. */
  success_criteria: string;
  verification: {
    /** Can cosigno confirm the outcome by reading it back? */
    possible: boolean;
    /** The read operation that would confirm it. */
    operation: string | null;
    how: string;
  };
  rollback: {
    supported: "full" | "partial" | "none";
    how: string;
  };
}

function label(name: string): string {
  const words = name.replace(/([a-z0-9])([A-Z])/g, "$1 $2").replace(/[_-]+/g, " ").toLowerCase();
  return words.charAt(0).toUpperCase() + words.slice(1);
}

/** What the action produces, in one sentence. */
function expectedResult(mutation: TwinOperation["mutation"], resourceLabel: string): string {
  switch (mutation) {
    case "read":
      return `The ${resourceLabel} you asked for, read back. Nothing changes.`;
    case "create":
      return `A new ${resourceLabel} exists in the connected system.`;
    case "update":
      return `The ${resourceLabel} carries its new values.`;
    case "delete":
      return `The ${resourceLabel} is gone from the connected system.`;
  }
}

/** What "done" means — deliberately about the OUTCOME, not the request. */
function successCriteria(mutation: TwinOperation["mutation"], resourceLabel: string): string {
  switch (mutation) {
    case "read":
      return `cosigno received the ${resourceLabel} without an error.`;
    case "create":
      return `The ${resourceLabel} can be found afterwards — not merely that the request was accepted.`;
    case "update":
      return `Reading the ${resourceLabel} back shows the new values — not merely that the request was accepted.`;
    case "delete":
      return `The ${resourceLabel} can no longer be found — not merely that the request was accepted.`;
  }
}

/**
 * The read operation on the same resource that would confirm the outcome.
 * Verification is only claimed when the connector genuinely exposes one; a
 * write to a connector with no read is honestly reported as unverifiable.
 */
function verificationFor(
  twin: DigitalTwin,
  op: TwinOperation,
  resourceName: string,
  resourceLabel: string
): ActionSpec["verification"] {
  if (op.mutation === "read") {
    return { possible: true, operation: op.id, how: "This is a read; its own result is the confirmation." };
  }
  const resource = twin.resources.find((r) => r.name === resourceName);
  const reader = resource?.operations.find((o) => o.mutation === "read");
  if (!reader) {
    return {
      possible: false,
      operation: null,
      how: `${twin.name} exposes no way to read ${resourceLabel} back, so cosigno cannot confirm this worked — it can only report that the request was accepted, and it will say exactly that.`,
    };
  }
  return {
    possible: true,
    operation: reader.id,
    how:
      op.mutation === "delete"
        ? `cosigno runs ${reader.id} afterwards and confirms the ${resourceLabel} is gone.`
        : `cosigno runs ${reader.id} afterwards and confirms the ${resourceLabel} carries the new values.`,
  };
}

function validationRules(op: TwinOperation, inputs: ActionInputSpec[], approval: string): string[] {
  const rules: string[] = [];
  const required = inputs.filter((i) => i.required);
  if (required.length > 0) {
    rules.push(`${required.map((i) => i.label.toLowerCase()).join(", ")} must be provided.`);
  }
  if (inputs.length === 0) {
    rules.push("This connector didn't declare its inputs, so cosigno validates only what it can see on the request.");
  }
  if (op.tier === 3) rules.push("A typed confirmation is required before it can run.");
  if (!approval.startsWith("none")) rules.push(`It cannot run until it has ${approval}.`);
  if (!op.reversible) rules.push("It cannot be undone once it runs, so it is never auto-approved.");
  rules.push("Your standing policies are re-checked at execution time, not just at approval.");
  return rules;
}

/** Describe ONE operation in the universal shape. */
export function describeAction(twin: DigitalTwin, operationId: string): ActionSpec | null {
  const resource = twin.resources.find((r) => r.operations.some((o) => o.id === operationId));
  const op = resource?.operations.find((o) => o.id === operationId);
  if (!resource || !op) return null;

  const canonical = canonicalize(resource.name);
  const named = businessAction(op.id, op.summary);
  const resourceLabel = canonical.label.toLowerCase();

  const inputs: ActionInputSpec[] = (op.inputs ?? []).map((i) => ({ ...i, label: label(i.name) }));
  const risk = actionRisk({ category: op.category, tier: op.tier, payload: {} });
  const approval = requiredApproval({ category: op.category, tier: op.tier });

  // No captured before-state exists at description time, so the rollback plan
  // is asked the same honest question the approval card asks.
  const rollback = buildRollbackPlan({
    twin,
    connector: twin.connection_key,
    resource: resource.name,
    mutation: op.mutation,
    changes: [],
  });

  return {
    id: op.id,
    name: named.name,
    description: named.detail || op.summary || named.name,
    connection: twin.name,
    connection_key: twin.connection_key,
    resource: resource.name,
    mutation: op.mutation,
    inputs,
    inputs_declared: op.inputs !== undefined,
    expected_result: expectedResult(op.mutation, resourceLabel),
    permissions: [permissionFor(canonical, op.mutation)],
    risk: risk.level,
    risk_because: risk.because,
    approval,
    validation: validationRules(op, inputs, approval),
    success_criteria: successCriteria(op.mutation, resourceLabel),
    verification: verificationFor(twin, op, resource.name, resourceLabel),
    rollback: {
      supported: rollback.supported,
      how:
        rollback.supported === "none"
          ? rollback.caveats[0] ?? "This cannot be undone by cosigno."
          : rollback.steps[0]?.detail ?? "Nothing to undo — this only reads.",
    },
  };
}

/** Every action a connection exposes, in the universal shape. */
export function describeConnection(twin: DigitalTwin): ActionSpec[] {
  return twin.resources
    .flatMap((r) => r.operations.map((o) => describeAction(twin, o.id)))
    .filter((s): s is ActionSpec => s !== null);
}

/**
 * How much of a connection cosigno can actually stand behind. Surfaced so a
 * user can see, per connection, where the guarantees thin out — rather than
 * discovering it when an action silently can't be verified.
 */
export interface CoverageReport {
  connection: string;
  actions: number;
  verifiable: number;
  reversible: number;
  inputs_declared: number;
  summary: string;
}

export function coverageOf(twin: DigitalTwin): CoverageReport {
  const specs = describeConnection(twin);
  const verifiable = specs.filter((s) => s.verification.possible).length;
  const reversible = specs.filter((s) => s.rollback.supported !== "none").length;
  const declared = specs.filter((s) => s.inputs_declared).length;

  return {
    connection: twin.name,
    actions: specs.length,
    verifiable,
    reversible,
    inputs_declared: declared,
    summary:
      specs.length === 0
        ? `${twin.name} hasn't advertised any actions yet.`
        : `${specs.length} action${specs.length === 1 ? "" : "s"} · ${verifiable} cosigno can verify afterwards · ${reversible} it can undo.`,
  };
}
