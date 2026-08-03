/**
 * Blast radius — the deterministic risk computation behind every decision.
 *
 * This is intentionally NOT a model call. An authorization gate must be
 * replayable and explainable: given the same action, it must always produce
 * the same required authority, and it must be able to say exactly why. Models
 * may classify or draft upstream; they never decide here.
 *
 * Each dimension scores 0..4. The action's level is the MAX across dimensions
 * (risk does not average out — a $50,000 transfer is not "medium" because it
 * touches one record), and the level maps to a required authority.
 */

export type BlastLevel = "minimal" | "low" | "moderate" | "high" | "severe";

/** The authority ladder. Ordered — higher index is strictly more restrictive. */
export const AUTHORITY_LADDER = ["auto", "approve", "sign", "deny"] as const;
export type Authority = (typeof AUTHORITY_LADDER)[number];

/** Returns the more restrictive of two authorities. Never lowers. */
export function maxAuthority(a: Authority, b: Authority): Authority {
  return AUTHORITY_LADDER.indexOf(a) >= AUTHORITY_LADDER.indexOf(b) ? a : b;
}

/**
 * Facts about the action. Everything is optional: an unknown fact is treated
 * as its RISKIEST plausible value, never its safest — an agent must not gain
 * autonomy by omitting context.
 */
export interface BlastContext {
  /** Money moved, in cents. */
  amount_cents?: number;
  /** How many records the action creates, changes, or destroys. */
  records_affected?: number;
  /** Distinct external parties who will see the result. */
  external_recipients?: number;
  /** Can this be undone, and is it cheap to undo? Unknown ⇒ treated as false. */
  reversible?: boolean;
  /** Does the payload carry personal data? */
  pii?: boolean;
  /** Does this touch a production system? */
  production?: boolean;
  /** Does this create, widen, or expose credentials/permissions? */
  credential_change?: boolean;
}

export interface BlastDimension {
  dimension: string;
  score: number;
  reason: string;
}

export interface BlastAssessment {
  level: BlastLevel;
  score: number;
  dimensions: BlastDimension[];
  /** The authority this blast radius alone demands. */
  required_authority: Authority;
}

const LEVELS: BlastLevel[] = ["minimal", "low", "moderate", "high", "severe"];

/** Blast level → the authority it demands on its own. */
const LEVEL_AUTHORITY: Record<BlastLevel, Authority> = {
  minimal: "auto",
  low: "auto",
  moderate: "approve",
  high: "approve",
  severe: "sign",
};

/** Money. Thresholds are cents; unknown amount scores 0 (other dims cover it). */
function scoreFinancial(c: BlastContext): BlastDimension {
  const cents = c.amount_cents ?? 0;
  if (cents <= 0) return { dimension: "financial", score: 0, reason: "no money moves" };
  if (cents < 2_500) return { dimension: "financial", score: 1, reason: `$${fmt(cents)} — under $25` };
  if (cents < 25_000) return { dimension: "financial", score: 2, reason: `$${fmt(cents)} — under $250` };
  if (cents < 500_000) return { dimension: "financial", score: 3, reason: `$${fmt(cents)} — under $5,000` };
  return { dimension: "financial", score: 4, reason: `$${fmt(cents)} — $5,000 or more` };
}

/** Data footprint, weighted up when the payload carries personal data. */
function scoreData(c: BlastContext): BlastDimension {
  const n = c.records_affected ?? 0;
  let score = n <= 0 ? 0 : n === 1 ? 1 : n <= 25 ? 2 : n <= 500 ? 3 : 4;
  let reason =
    n <= 0 ? "no records changed" : `${n.toLocaleString()} record${n === 1 ? "" : "s"} affected`;
  if (c.pii && score > 0) {
    score = Math.min(4, score + 1);
    reason += " · contains personal data";
  }
  return { dimension: "data", score, reason };
}

/** Anything a customer or outside party can see is expensive to retract. */
function scoreCustomer(c: BlastContext): BlastDimension {
  const n = c.external_recipients ?? 0;
  if (n <= 0) return { dimension: "customer", score: 0, reason: "stays internal" };
  if (n === 1) return { dimension: "customer", score: 2, reason: "reaches 1 external party" };
  if (n <= 50) return { dimension: "customer", score: 3, reason: `reaches ${n} external parties` };
  return { dimension: "customer", score: 4, reason: `reaches ${n.toLocaleString()} external parties` };
}

/** Credentials and production surface. */
function scoreSecurity(c: BlastContext): BlastDimension {
  if (c.credential_change) {
    return { dimension: "security", score: 4, reason: "changes credentials or permissions" };
  }
  if (c.production) {
    return { dimension: "security", score: 3, reason: "touches a production system" };
  }
  return { dimension: "security", score: 0, reason: "no credential or production surface" };
}

/**
 * Reversibility is a MULTIPLIER on consequence, not a dimension of its own:
 * an irreversible action with any consequence at all is escalated one step.
 */
function scoreReversibility(c: BlastContext, consequence: number): BlastDimension {
  if (c.reversible === true) {
    return { dimension: "reversibility", score: 0, reason: "reversible — can be undone" };
  }
  const known = c.reversible === false;
  return {
    dimension: "reversibility",
    score: consequence > 0 ? Math.min(4, consequence + 1) : 0,
    reason: known
      ? "irreversible — cannot be undone"
      : "reversibility unknown — treated as irreversible",
  };
}

export function assessBlastRadius(ctx: BlastContext): BlastAssessment {
  const financial = scoreFinancial(ctx);
  const data = scoreData(ctx);
  const customer = scoreCustomer(ctx);
  const security = scoreSecurity(ctx);

  const consequence = Math.max(financial.score, data.score, customer.score, security.score);
  const reversibility = scoreReversibility(ctx, consequence);

  const dimensions = [financial, data, customer, security, reversibility];
  const score = Math.max(...dimensions.map((d) => d.score));
  const level = LEVELS[Math.min(score, LEVELS.length - 1)];

  return { level, score, dimensions, required_authority: LEVEL_AUTHORITY[level] };
}

function fmt(cents: number): string {
  return (cents / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
