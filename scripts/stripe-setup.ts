/**
 * Idempotently creates the cosigno Products and Prices in Stripe and prints
 * the Price IDs to paste into env vars. Safe to re-run: it looks up existing
 * products by a stable metadata key and reuses matching prices.
 *
 *   STRIPE_SECRET_KEY=sk_test_... npx tsx scripts/stripe-setup.ts
 *
 * (Prices are immutable in Stripe; re-running finds the existing active price
 * with the same amount/interval rather than creating duplicates.)
 */
import Stripe from "stripe";
import { PLANS, PAID_PLANS, PublicPlanId } from "../src/lib/plans";

const key = process.env.STRIPE_SECRET_KEY;
if (!key) {
  console.error("set STRIPE_SECRET_KEY to run this script.");
  process.exit(1);
}
const stripe = new Stripe(key, { apiVersion: "2026-06-24.dahlia" });

async function findOrCreateProduct(planId: PublicPlanId) {
  const metaKey = `cosigno_plan:${planId}`;
  const existing = await stripe.products.search({ query: `metadata['cosigno_plan']:'${planId}'` });
  if (existing.data[0]) return existing.data[0];
  return stripe.products.create({
    name: `cosigno ${PLANS[planId].name}`,
    description: PLANS[planId].tagline,
    metadata: { cosigno_plan: planId, key: metaKey },
  });
}

async function findOrCreatePrice(
  productId: string,
  amountCents: number,
  interval: "month" | "year",
  planId: PublicPlanId
) {
  const prices = await stripe.prices.list({ product: productId, active: true, limit: 100 });
  const match = prices.data.find(
    (p) =>
      p.unit_amount === amountCents &&
      p.recurring?.interval === interval &&
      p.currency === "usd"
  );
  if (match) return match;
  return stripe.prices.create({
    product: productId,
    unit_amount: amountCents,
    currency: "usd",
    recurring: { interval },
    metadata: { cosigno_plan: planId, cosigno_interval: interval === "year" ? "annual" : "monthly" },
  });
}

async function main() {
  const out: Record<string, string> = {};
  for (const planId of PAID_PLANS) {
    const plan = PLANS[planId];
    const product = await findOrCreateProduct(planId);
    const monthly = await findOrCreatePrice(product.id, Math.round(plan.price.monthly * 100), "month", planId);
    const annual = await findOrCreatePrice(product.id, Math.round(plan.price.annual * 100), "year", planId);
    out[plan.price.monthlyEnv!] = monthly.id;
    out[plan.price.annualEnv!] = annual.id;
  }

  console.log("\n# Add these to your environment:\n");
  for (const [k, v] of Object.entries(out)) console.log(`${k}=${v}`);
  console.log("\nDone. Configure the Billing Portal at https://dashboard.stripe.com/test/settings/billing/portal");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
