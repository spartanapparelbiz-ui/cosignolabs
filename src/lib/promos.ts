import { PLANS, type PlanId, type PublicPlanId } from "./plans";

/**
 * Promotional offer rules. All eligibility is server-validated against the
 * `promotions` table (single-use per customer) plus the subscription/usage
 * facts below. Coupon IDs are read from env — never hardcoded — and only
 * attached server-side, so a client can never grant itself a discount.
 */

export const REFUND_WINDOW_DAYS = 14;
export const USAGE_OFFER_WINDOW_DAYS = 7;
export const RETENTION_MONTHS = 2;

/** Stripe coupon for the $9 first month on pro monthly (amount_off, once). */
export function introCoupon(): string | null {
  return process.env.STRIPE_COUPON_INTRO || null;
}

/** Stripe coupon for 50% off the next 2 months (percent_off 50, duration 2mo). */
export function retentionCoupon(): string | null {
  return process.env.STRIPE_COUPON_RETENTION || null;
}

/** A subscription is refundable only within the window from when it started. */
export function withinRefundWindow(startedAt: number | null, nowMs = Date.now()): boolean {
  if (!startedAt) return false;
  return nowMs / 1000 - startedAt <= REFUND_WINDOW_DAYS * 86_400;
}

/** The usage offer only fires if the limit was hit close to signup. */
export function withinUsageWindow(firstSeen: number | null, nowMs = Date.now()): boolean {
  if (!firstSeen) return false;
  return nowMs / 1000 - firstSeen <= USAGE_OFFER_WINDOW_DAYS * 86_400;
}

/** The intro coupon is scoped to pro-monthly for a first-time subscriber. */
export function introEligible(plan: PlanId, interval: string): boolean {
  return plan === "pro" && interval === "monthly";
}

/** Yearly savings vs paying monthly, for the annual nudge copy. */
export function annualSavings(planId: PublicPlanId): number {
  const p = PLANS[planId];
  if (!p || p.price.monthly === 0) return 0;
  return p.price.monthly * 12 - p.price.annual;
}
