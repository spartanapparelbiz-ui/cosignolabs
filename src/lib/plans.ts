/**
 * Plans — the ONLY place plan data lives. UI, server-side enforcement, and
 * Stripe metadata all read from here so nothing can drift.
 *
 * "AI operations" is the usage-meter unit shown to users: every planning
 * call and every executed action counts as one operation. The name exists
 * because "actions" hid the planning half — usage moved when nothing visibly
 * ran, which read as a billing bug. The unit users see must be the unit we
 * count. Fail closed: an unknown/missing plan is always treated as `free`.
 */

export type PlanId = "free" | "pro" | "max";
export type Interval = "monthly" | "annual";

export interface PlanPrice {
  monthly: number; // USD/mo
  annual: number; // USD/yr (2 months free)
  /** env var names holding the Stripe Price IDs (never hardcode IDs). */
  monthlyEnv?: string;
  annualEnv?: string;
}

export interface Plan {
  id: PlanId;
  name: string;
  tagline: string;
  price: PlanPrice;
  /** AI operations per cycle (planning + executions) */
  actionLimit: number;
  /** max connected integrations; Infinity = unlimited */
  integrationLimit: number;
  /** may add user-defined custom MCP servers (a power feature, pro+ only) */
  customMcp: boolean;
  /** upgrade target shown at the limit, or null */
  upgradeTo: PlanId | null;
  /** feature bullets rendered on pricing + account (drawn from here only) */
  features: string[];
  /** "what people use it for" examples on pricing — real capabilities only */
  examples?: string[];
  /** gets the stronger planning model for complex plans */
  strongerModel: boolean;
  canExportCsv: boolean;
}

export const PLANS: Record<PlanId, Plan> = {
  free: {
    id: "free",
    name: "free",
    tagline: "hand over your first jobs, free.",
    price: { monthly: 0, annual: 0 },
    actionLimit: 25,
    integrationLimit: 1,
    customMcp: false,
    upgradeTo: "pro",
    strongerModel: false,
    canExportCsv: false,
    features: ["25 AI operations / month", "1 connected app", "live preview", "activity log"],
    examples: ["plan a trip", "draft emails", "research products", "organize notes"],
  },
  pro: {
    id: "pro",
    // Display name only — the id stays "pro" everywhere it's stored (Stripe
    // metadata, subscription rows), so renaming can't orphan a subscription.
    name: "pro",
    tagline: "delegate real work, every day.",
    price: {
      monthly: 44.4,
      annual: 444,
      monthlyEnv: "STRIPE_PRICE_PRO_MONTHLY",
      annualEnv: "STRIPE_PRICE_PRO_ANNUAL",
    },
    actionLimit: 1000,
    integrationLimit: Infinity,
    customMcp: true,
    upgradeTo: "max",
    strongerModel: false,
    canExportCsv: true,
    features: [
      "1,000 AI operations / month",
      "unlimited connected apps",
      "your own APIs and MCP servers",
      "full history export",
    ],
    examples: ["run your inbox", "research competitors", "automate follow-ups", "connect every app"],
  },
  max: {
    id: "max",
    // Display name only — the id stays "max" in storage (see pro).
    name: "power",
    tagline: "for teams running cosigno hard.",
    price: {
      monthly: 111,
      annual: 1110,
      monthlyEnv: "STRIPE_PRICE_MAX_MONTHLY",
      annualEnv: "STRIPE_PRICE_MAX_ANNUAL",
    },
    actionLimit: 10000,
    integrationLimit: Infinity,
    customMcp: true,
    upgradeTo: null,
    strongerModel: true,
    canExportCsv: true,
    features: [
      "10,000 AI operations / month",
      "everything in pro",
      "a stronger model when the work demands it",
      "webhook / API access",
      "priority support",
    ],
    examples: ["run heavy volume", "premium AI routing", "webhook / API access", "priority support"],
  },
};

export const PLAN_ORDER: PlanId[] = ["free", "pro", "max"];
export const PAID_PLANS: PlanId[] = ["pro", "max"];

export function getPlan(id: PlanId | string | null | undefined): Plan {
  return (id && PLANS[id as PlanId]) || PLANS.free;
}

/** Days a past_due subscription keeps its paid access before dropping to free. */
export const PAST_DUE_GRACE_DAYS = 7;

/** Resolve the Stripe Price ID for a paid plan + interval from env. */
export function priceIdFor(plan: PlanId, interval: Interval): string | null {
  const p = PLANS[plan];
  const envName = interval === "annual" ? p.price.annualEnv : p.price.monthlyEnv;
  if (!envName) return null;
  return process.env[envName] || null;
}

/** Human price label, e.g. "$44.40/mo" or "$444/yr". */
export function priceLabel(plan: Plan, interval: Interval): string {
  if (plan.price.monthly === 0) return "$0";
  const n = interval === "annual" ? plan.price.annual : plan.price.monthly;
  // Cent prices render as cents ("$44.40"), whole prices stay whole ("$444").
  const shown = Number.isInteger(n) ? String(n) : n.toFixed(2);
  return interval === "annual" ? `$${shown}/yr` : `$${shown}/mo`;
}

/**
 * The first-month intro price for pro. The real discount is applied by a Stripe
 * coupon (see promos.introCoupon); this constant is only the number shown to the
 * customer, kept here so pricing copy has a single source.
 */
export const INTRO_FIRST_MONTH_PRICE = 9;

/** Format a dollar amount: cents shown only when they exist ("44.40", "444"). */
export function moneyLabel(n: number): string {
  return Number.isInteger(n) ? String(n) : n.toFixed(2);
}

/** The quota bullet, derived from actionLimit, e.g. "1,000 AI operations / month". */
export function actionLimitLabel(plan: Plan): string {
  return `${plan.actionLimit.toLocaleString()} AI operations / month`;
}

/**
 * The ONE canonical intro-offer sentence, used everywhere the first-month
 * promotion is mentioned so no two places can disagree:
 * "first month $9, then $29/mo".
 */
export function introOfferLabel(): string {
  return `first month $${INTRO_FIRST_MONTH_PRICE}, then ${priceLabel(PLANS.pro, "monthly")}`;
}
