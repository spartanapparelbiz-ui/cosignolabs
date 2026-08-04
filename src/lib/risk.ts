import type { ActionCategory, ActionRecord, Tier } from "./types";
import type { BlastLevel } from "./authz/blastRadius";
import { signRequired } from "./sign";
import { payloadCount, effectLine } from "./actionPresentation";
import { sourceIdentity } from "./clarity";

/**
 * Risk, in four words a non-technical operations manager already knows.
 *
 * The engine's real risk model is richer than this — five blast levels across
 * five scored dimensions, plus category floors and tiers. That richness is
 * exactly right for DECIDING and exactly wrong for READING: nobody approves
 * faster because they were shown a score of 3.4.
 *
 * So this module is presentation ONLY. It never participates in the approval
 * state machine, never lowers a floor, and never decides anything. It takes
 * what the engine already resolved and answers two questions a human actually
 * asks:
 *
 *     How risky is this?    Low · Medium · High · Critical
 *     Why is it that risky? one plain sentence
 *
 * Every level comes with its `because`. A risk badge without a reason is
 * decoration, and decoration is what makes people click approve without
 * reading.
 */

export type RiskLevel = "low" | "medium" | "high" | "critical";

export interface RiskView {
  level: RiskLevel;
  /** Plain sentence: why it is this level. Always present. */
  because: string;
}

const ORDER: RiskLevel[] = ["low", "medium", "high", "critical"];

/** The higher of two levels. Risk is never averaged down. */
export function maxRisk(a: RiskLevel, b: RiskLevel): RiskLevel {
  return ORDER.indexOf(a) >= ORDER.indexOf(b) ? a : b;
}

/**
 * Base level per category, with the sentence that explains it. These mirror
 * the category floors the server already enforces — money and destruction sit
 * at the top, reads at the bottom — so the badge can never disagree with the
 * gate the action will actually meet.
 */
const BASE: Record<ActionCategory, RiskView> = {
  search: { level: "low", because: "this only reads — nothing changes." },
  summarize: { level: "low", because: "this only reads and summarizes — nothing changes." },
  draft: { level: "low", because: "this saves a draft — nothing is sent." },
  update_record: { level: "medium", because: "this changes data in a connected tool." },
  connection_call: { level: "medium", because: "this runs an action in a connected app." },
  webhook: { level: "medium", because: "this fires an outbound call to another system." },
  send_email: { level: "high", because: "this sends mail outside your workspace and can't be recalled." },
  post_content: { level: "high", because: "this publishes something outside your workspace." },
  spend: { level: "high", because: "this commits money under your spending rules." },
  delete: { level: "critical", because: "this permanently deletes data and can't be undone." },
  refund: { level: "critical", because: "this returns money to a customer." },
  payment: { level: "critical", because: "this moves money out of your accounts." },
};

/** Money, in cents, if the payload declares an amount we can actually read. */
function amountCents(payload: Record<string, unknown> | null | undefined): number | null {
  if (!payload) return null;
  const cents = payload.amount_cents;
  if (typeof cents === "number" && Number.isFinite(cents)) return Math.round(cents);
  const amount = payload.amount;
  if (typeof amount === "number" && Number.isFinite(amount)) return Math.round(amount * 100);
  if (typeof amount === "string") {
    const parsed = Number(amount.replace(/[^0-9.]/g, ""));
    if (Number.isFinite(parsed) && parsed > 0) return Math.round(parsed * 100);
  }
  return null;
}

function money(cents: number): string {
  return (cents / 100).toLocaleString("en-US", { style: "currency", currency: "USD" });
}

/**
 * The risk of one action. Escalation only — a payload fact can raise the
 * level, never lower the category's floor, for the same reason a rule can only
 * ever tighten a boundary.
 */
export function actionRisk(
  action: Pick<ActionRecord, "category" | "tier" | "payload"> & { injection_flag?: boolean }
): RiskView {
  const base = BASE[action.category] ?? {
    level: "medium" as RiskLevel,
    because: "this changes something outside your workspace.",
  };
  let { level, because } = base;

  // A tier-3 action is, by definition, one the workspace decided needs a
  // signature. Nothing pinned there may read below High.
  if (action.tier === 3) {
    const raised = maxRisk(level, "critical");
    if (raised !== level) because = `${because} it's locked at the highest level, so it always needs your signature.`;
    level = raised;
  }

  const cents = amountCents(action.payload);
  if (cents !== null && cents >= 50_000) {
    const raised = maxRisk(level, "critical");
    if (raised !== level) because = `this moves ${money(cents)} — anything at or above $500 is treated as critical.`;
    level = raised;
  }

  const count = payloadCount(action.payload ?? {});
  if (count !== null && count > 25 && level !== "critical") {
    const raised = maxRisk(level, "high");
    if (raised !== level) because = `this affects ${count.toLocaleString()} items at once.`;
    level = raised;
  }

  if (action.injection_flag) {
    return {
      level: maxRisk(level, "high"),
      because: "outside content tried to direct this action, so it's held until you re-issue the command yourself.",
    };
  }

  return { level, because };
}

/**
 * The engine's five blast levels, shown in the same four words as everything
 * else. `moderate` and `high` both read as their nearest human word rather
 * than inventing a fifth badge nobody asked for.
 */
export function riskFromBlast(blast: BlastLevel | string): RiskLevel {
  switch (blast) {
    case "minimal":
    case "low":
      return "low";
    case "moderate":
      return "medium";
    case "high":
      return "high";
    case "severe":
      return "critical";
    default:
      // An unrecognized level is never treated as safe.
      return "high";
  }
}

/**
 * Who has to say yes. Stated as a person's job, not as a tier number —
 * "your signature" means something to everyone; "tier 3" means something to
 * the six people who built it.
 */
export function requiredApproval(action: Pick<ActionRecord, "category" | "tier">): string {
  if (action.tier === 1) return "none — this clears automatically";
  if (signRequired(action.category, action.tier as Tier)) return "your signature";
  return "your approval";
}

/**
 * "Will —" the concrete consequences, as bullets. Derived from the same
 * resolved facts the card already shows, so the list can never describe an
 * effect the action doesn't have.
 */
export function willBullets(
  action: Pick<ActionRecord, "category" | "tier" | "payload">
): string[] {
  const bullets = [effectLine(action)];

  const where = sourceIdentity(action);
  if (action.category === "connection_call") {
    bullets.push(`runs in ${where.name} using the account you connected.`);
  }

  const cents = amountCents(action.payload);
  if (cents !== null && cents > 0) bullets.push(`moves ${money(cents)}.`);

  const count = payloadCount(action.payload ?? {});
  if (count !== null && count > 1) bullets.push(`touches ${count.toLocaleString()} items.`);

  bullets.push(
    action.category === "delete" || action.category === "refund" || action.category === "payment"
      ? "cannot be undone once it runs."
      : action.tier === 1
        ? "is reversible — nothing leaves your workspace."
        : "is recorded on your activity log either way."
  );

  return bullets;
}
