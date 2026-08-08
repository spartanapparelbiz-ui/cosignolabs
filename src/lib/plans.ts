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
  /**
   * INTERNAL — no quota of any kind, present or future. Only OWNER_PLAN sets
   * it, and only server-side code reads it.
   *
   * It exists so a paid feature added later is unlimited for owners without
   * anyone having to remember this file: a new gate that has no dedicated
   * Plan field of its own checks `plan.unlimited` first and is done.
   */
  unlimited?: boolean;
}

/** No ceiling. `Infinity` throughout — a limit comparison against it is never true. */
export const UNLIMITED = Infinity;

export const PLANS: Record<PlanId, Plan> = {
  free: {
    id: "free",
    name: "free",
    tagline: "try the operator on your own terms.",
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
    name: "operator",
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
      "give cosigno your entire workflow — unlimited connected apps",
      "connect AI to anything — your own APIs and MCP servers",
      "never lose what AI accomplished — full history export",
    ],
    examples: ["run your inbox", "research competitors", "automate follow-ups", "connect every app"],
  },
  max: {
    id: "max",
    // Display name only — the id stays "max" in storage (see pro).
    name: "command",
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
      "everything in operator",
      "premium AI routing — a stronger model when work demands it",
      "webhook / API access",
      "priority support",
    ],
    examples: ["run heavy volume", "premium AI routing", "webhook & API access", "priority support"],
  },
};

export const PLAN_ORDER: PlanId[] = ["free", "pro", "max"];
export const PAID_PLANS: PlanId[] = ["pro", "max"];

/**
 * THE OWNER PLAN — internal. Granted by getUserPlan() to the addresses in
 * OWNER_EMAILS and to nobody else (see src/lib/owner.ts for the check).
 *
 * Unlimited actions, missions, automations, connections, AI usage, storage,
 * uploads, templates, monitoring and preview — and, via `unlimited`, whatever
 * gets sold next. Billing and subscription state are not consulted at all:
 * an owner has no Stripe row to be active, past due, or canceled.
 *
 * WHY IT IS NOT IN `PLANS`
 * ------------------------
 * `PLANS` and `PLAN_ORDER` are what pricing, the account panel, the upgrade
 * prompts and the Stripe setup script iterate. Anything listed there is, by
 * construction, something a user can see and buy. Keeping the Owner plan out
 * of them is what makes "never show Owner in the UI" a property of the data
 * rather than a rule someone has to remember at each render site.
 *
 * WHY IT WEARS THE TOP PLAN'S NAME AND ID
 * ---------------------------------------
 * Its public identity is deliberately `max`/"command": the account page, the
 * usage meter and every API response an owner's browser receives look exactly
 * like a normal top-tier subscriber's. There is no "owner" string to leak,
 * and nothing an owner could screenshot that a paying customer couldn't.
 * Only the LIMITS differ, and limits are enforced server-side.
 */
export const OWNER_PLAN: Plan = {
  // Public identity: a normal, purchasable plan. Storage/metadata never sees
  // this object — owners have no subscription row — so nothing can orphan.
  id: "max",
  name: PLANS.max.name,
  tagline: PLANS.max.tagline,
  price: PLANS.max.price,
  features: PLANS.max.features,
  examples: PLANS.max.examples,
  upgradeTo: null,
  // The actual grant.
  actionLimit: UNLIMITED,
  integrationLimit: UNLIMITED,
  customMcp: true,
  strongerModel: true,
  canExportCsv: true,
  unlimited: true,
};

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
