import type { ActionRecord, PermissionRuleRecord, Tier } from "../types";
import type { HoldScope } from "../types";
import { applyRequirementToTier, applyRules, describeRule } from "../rules";
import { holdBlocks } from "../hold";
import { affectedApps, durationOf, riskOf, rollbackOf } from "./brief";

/**
 * "Simulate first" — what would happen if you approved this, without
 * approving it.
 *
 * The important property is structural: this does not MODEL the boundary, it
 * RUNS the same functions the boundary runs. `applyRules` →
 * `applyRequirementToTier` → `holdBlocks` is the exact path an approval takes
 * on its way to execution, so what a person is shown here is what will
 * actually happen rather than a second implementation free to drift from the
 * first.
 *
 * What it deliberately does NOT do: call the provider, decrypt a credential,
 * create or mutate a record, or increment usage. There is no code path from a
 * simulation to a side effect, which is what makes it safe to offer on the
 * card next to Approve.
 */

export interface SimulationStep {
  /** What this stage of execution would do. */
  text: string;
  /** True when this is the moment the action becomes irreversible. */
  irreversible?: boolean;
}

export interface ActionSimulation {
  /** Always present, always first: nothing happened. */
  note: string;
  /** Tier the server would enforce after rules are applied. */
  tier: Tier;
  /** Plain-English gate: what approving would actually require. */
  requires: "runs immediately" | "your approval" | "your signature" | "blocked";
  /** Rules that would fire, in the words the rules page uses. */
  rules: string[];
  /** Blocked outright — by a rule, by a hold, or by flagged content. */
  blocked: boolean;
  /** Why it's blocked, when it is. */
  blockedReason: string | null;
  /** The stages execution would go through, in order. */
  steps: SimulationStep[];
  /** What it would touch. */
  apps: string[];
  /** Whether it could be undone afterwards. */
  rollback: string;
  /** Coarse duration band. */
  duration: string;
}

const NOTE =
  "this is a simulation — nothing was sent, no app was called, and nothing was approved.";

const REQUIRES: Record<Tier, ActionSimulation["requires"]> = {
  1: "runs immediately",
  2: "your approval",
  3: "your signature",
};

/** Amount recovery, mirroring what the boundary passes as RuleContext.amount. */
function amountOf(action: ActionRecord): number | undefined {
  const p = action.payload ?? {};
  for (const key of ["amount", "amount_cents", "total", "value", "price"]) {
    const raw = p[key];
    if (typeof raw === "number" && Number.isFinite(raw)) {
      return key === "amount_cents" ? raw / 100 : raw;
    }
    if (typeof raw === "string") {
      const n = parseFloat(raw.replace(/[$,]/g, ""));
      if (Number.isFinite(n)) return key === "amount_cents" ? n / 100 : n;
    }
  }
  const m = /\$\s?([\d,]+(?:\.\d{1,2})?)/.exec(action.summary);
  return m ? parseFloat(m[1].replace(/,/g, "")) : undefined;
}

function channelOf(action: ActionRecord): string | undefined {
  const c = (action.payload ?? {}).channel;
  return typeof c === "string" && c.trim() ? c : undefined;
}

/**
 * The stages execution would move through.
 *
 * Written as the operator would narrate them, and marked at the exact step
 * where the action stops being recoverable — which is the single most useful
 * thing a simulation can point at, and the thing a payload dump never says.
 */
function stagesFor(action: ActionRecord): SimulationStep[] {
  const apps = affectedApps(action).map((a) => a.name);
  const where = apps[0] ?? "the connected app";
  const rollback = rollbackOf(action);

  const open: SimulationStep[] = [
    { text: `open your connection to ${where}` },
    { text: "check the request against your rules one more time" },
  ];

  switch (action.category) {
    case "search":
    case "summarize":
      return [...open, { text: "read what's there and write the result into this mission" }];
    case "draft":
      return [...open, { text: "save the draft where you can edit it before anything is sent" }];
    case "send_email":
      return [
        ...open,
        { text: "hand the message to your mail provider", irreversible: true },
        { text: "record the receipt, with the exact message that went out" },
      ];
    case "post_content":
      return [
        ...open,
        { text: "publish the content", irreversible: true },
        { text: "record the receipt with a link to what was posted" },
      ];
    case "update_record":
      return [
        ...open,
        {
          text: rollback.possible
            ? "capture the current values, then write the new ones"
            : "write the new values over the current ones",
          irreversible: !rollback.possible,
        },
        { text: "record the receipt" },
      ];
    case "delete":
      return [
        ...open,
        { text: "delete the items — this is the point of no return", irreversible: true },
        { text: "record what was deleted, so there's a record even though the data is gone" },
      ];
    case "payment":
    case "refund":
    case "spend":
      return [
        ...open,
        { text: "check the amount against your spending cap" },
        { text: "submit the transaction to your payment provider", irreversible: true },
        { text: "record the receipt with the provider's confirmation" },
      ];
    case "webhook":
      return [
        ...open,
        { text: "deliver the call to your endpoint", irreversible: true },
        { text: "record the response" },
      ];
    default:
      return [...open, { text: "carry out the action and record the receipt" }];
  }
}

/**
 * Run the simulation.
 *
 * Pure: the caller supplies the rules and the hold, so this whole function is
 * testable without a store and cannot reach one by accident.
 */
export function simulateAction(
  action: ActionRecord,
  rules: PermissionRuleRecord[],
  holdScope: HoldScope
): ActionSimulation {
  const decision = applyRules(rules, {
    category: action.category,
    tier: action.tier as Tier,
    summary: action.summary,
    amount: amountOf(action),
    channel: channelOf(action),
  });

  const { tier, blocked } = applyRequirementToTier(action.tier as Tier, decision.requirement);
  const heldBack = holdBlocks(holdScope, { tier });

  // Flagged content outranks everything: the server refuses these regardless
  // of tier, so a simulation that showed them sailing through would be
  // teaching the wrong lesson about the most dangerous case on the card.
  const blockedReason = action.injection_flag
    ? "outside content tried to direct this action, so cosigno will not run it. re-issue the command yourself."
    : blocked
      ? `a rule blocks this outright${decision.rule ? `: ${describeRule(decision.rule)}` : "."}`
      : heldBack
        ? "cosigno is on hold, so this would wait at the boundary rather than execute."
        : null;

  const isBlocked = Boolean(blockedReason);

  return {
    note: NOTE,
    tier,
    requires: isBlocked ? "blocked" : REQUIRES[tier],
    rules: decision.rule ? [describeRule(decision.rule)] : [],
    blocked: isBlocked,
    blockedReason,
    steps: isBlocked ? [] : stagesFor(action),
    apps: affectedApps(action).map((a) => a.name),
    rollback: rollbackOf(action).detail,
    duration: durationOf(action),
  };
}

/** Re-exported so the card can label the risk beside the simulation. */
export { riskOf };
