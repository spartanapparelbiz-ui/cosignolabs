import Stripe from "stripe";
import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getUserPlan } from "../../src/lib/billing";
import { chooseModel, defaultModel, strongModel } from "../../src/lib/enforcement";
import { PAST_DUE_GRACE_DAYS } from "../../src/lib/plans";
import { MemoryStore } from "../../src/lib/store/memory";
import { resetRateLimitsForTests } from "../../src/lib/ratelimit";
import type { SubscriptionRecord } from "../../src/lib/types";

/**
 * §2 enforcement — plan resolution is fail-closed and server-only; limits,
 * integrations, CSV, and the webhook writer are all enforced server-side.
 */

const currentUser = vi.hoisted(() => ({ id: "biller" }));

vi.mock("@/lib/auth", () => ({
  clerkConfigured: () => true,
  DEMO_USER_ID: "demo-user",
  getUserId: vi.fn(async () => currentUser.id),
}));

let store: MemoryStore;

function sub(partial: Partial<SubscriptionRecord>): SubscriptionRecord {
  return {
    user_id: "biller",
    stripe_customer_id: "cus_1",
    stripe_subscription_id: "sub_1",
    plan: "pro",
    interval: "monthly",
    status: "active",
    current_period_end: Math.floor(Date.now() / 1000) + 86400 * 20,
    cancel_at_period_end: false,
    past_due_since: null,
    updated_at: new Date().toISOString(),
    ...partial,
  };
}

beforeEach(() => {
  store = new MemoryStore();
  (globalThis as Record<string, unknown>).__cosignoStore = store;
  resetRateLimitsForTests();
  currentUser.id = "biller";
});

afterEach(() => vi.unstubAllEnvs());

describe("plan resolution — fail closed, server only", () => {
  it("no subscription → free", async () => {
    const p = await getUserPlan("biller");
    expect(p.planId).toBe("free");
    expect(p.plan.actionLimit).toBe(25);
  });

  it("a forged client 'max' is irrelevant — plan comes from the store row only", async () => {
    // There is no code path for a client to set this; even the stored row must
    // be active. An incomplete 'max' row resolves to free.
    await store.upsertSubscription(sub({ plan: "max", status: "incomplete" }));
    expect((await getUserPlan("biller")).planId).toBe("free");
  });

  it("active pro → pro; active max → max", async () => {
    await store.upsertSubscription(sub({ plan: "pro" }));
    expect((await getUserPlan("biller")).planId).toBe("pro");
    await store.upsertSubscription(sub({ plan: "max" }));
    expect((await getUserPlan("biller")).planId).toBe("max");
  });

  it("past_due keeps access during grace, drops to free after", async () => {
    const now = Math.floor(Date.now() / 1000);
    await store.upsertSubscription(sub({ status: "past_due", past_due_since: now - 86400 }));
    const inGrace = await getUserPlan("biller");
    expect(inGrace.planId).toBe("pro");
    expect(inGrace.inGrace).toBe(true);

    await store.upsertSubscription(
      sub({ status: "past_due", past_due_since: now - (PAST_DUE_GRACE_DAYS + 1) * 86400 })
    );
    const expired = await getUserPlan("biller");
    expect(expired.planId).toBe("free");
    expect(expired.pastDue).toBe(true);
  });

  it("canceled keeps access until period end, then free", async () => {
    const now = Math.floor(Date.now() / 1000);
    await store.upsertSubscription(sub({ status: "canceled", current_period_end: now + 86400 }));
    expect((await getUserPlan("biller")).planId).toBe("pro");
    await store.upsertSubscription(sub({ status: "canceled", current_period_end: now - 10 }));
    expect((await getUserPlan("biller")).planId).toBe("free");
  });
});

describe("usage limit is plan-aware (free = 25)", () => {
  it("the 26th action is blocked with 402 and the free upgrade copy", async () => {
    for (let i = 0; i < 25; i++) await store.incrementUsage("biller");
    const { POST } = await import("../../src/app/api/command/route");
    const res = await POST(
      new NextRequest("http://localhost/api/command", {
        method: "POST",
        body: JSON.stringify({ command: "reprice these products" }),
        headers: { "Content-Type": "application/json" },
      })
    );
    expect(res.status).toBe(402);
    const body = await res.json();
    expect(body.message).toMatch(/25 actions/i);
    expect(body.message).toMatch(/\$29/);
  });
});

describe("integration limit (free = 1)", () => {
  it("the 2nd integration for a free user → 402; the 1st is fine", async () => {
    const { POST } = await import("../../src/app/api/integrations/route");
    const req = (key: string) =>
      new NextRequest("http://localhost/api/integrations", {
        method: "POST",
        body: JSON.stringify({ key, connected: true }),
        headers: { "Content-Type": "application/json" },
      });

    expect((await POST(req("gmail"))).status).toBe(200);
    const second = await POST(req("webhook"));
    expect(second.status).toBe(402);
    const body = await second.json();
    expect(body.message).toMatch(/pro/i);

    // reconnecting an already-connected one is not a new slot
    expect((await POST(req("gmail"))).status).toBe(200);
  });

  it("pro users connect unlimited integrations", async () => {
    await store.upsertSubscription(sub({ plan: "pro" }));
    const { POST } = await import("../../src/app/api/integrations/route");
    const mk = (key: string) =>
      new NextRequest("http://localhost/api/integrations", {
        method: "POST",
        body: JSON.stringify({ key, connected: true }),
        headers: { "Content-Type": "application/json" },
      });
    expect((await POST(mk("gmail"))).status).toBe(200);
    expect((await POST(mk("webhook"))).status).toBe(200);
  });
});

describe("CSV export gated to pro+", () => {
  it("free → 402, pro → 200", async () => {
    const { GET } = await import("../../src/app/api/activity/route");
    const csvReq = new NextRequest("http://localhost/api/activity?format=csv");
    expect((await GET(csvReq)).status).toBe(402);

    await store.upsertSubscription(sub({ plan: "pro" }));
    const res = await GET(new NextRequest("http://localhost/api/activity?format=csv"));
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toMatch(/csv/);
  });
});

describe("model routing (server-side, logged)", () => {
  it("free/pro always default; max gets stronger only for complex commands", () => {
    expect(chooseModel("free", "delete everything and pay the invoice", "u")).toBe(defaultModel());
    expect(chooseModel("pro", "delete everything and pay the invoice", "u")).toBe(defaultModel());
    expect(chooseModel("max", "summarize", "u")).toBe(defaultModel());
    expect(chooseModel("max", "delete these records and refund the order", "u")).toBe(strongModel());
  });
});

describe("stripe webhook — signature verified, sole writer", () => {
  it("a bad signature is rejected 400 and writes nothing", async () => {
    vi.stubEnv("STRIPE_SECRET_KEY", "sk_test_dummy");
    vi.stubEnv("STRIPE_WEBHOOK_SECRET", "whsec_dummy");
    vi.resetModules();
    const { POST } = await import("../../src/app/api/stripe/webhook/route");
    const res = await POST(
      new NextRequest("http://localhost/api/stripe/webhook", {
        method: "POST",
        body: JSON.stringify({ type: "invoice.payment_failed", data: { object: {} } }),
        headers: { "stripe-signature": "t=1,v1=forged" },
      })
    );
    expect(res.status).toBe(400);
    expect(await store.getSubscription("biller")).toBeNull();
  });

  it("a validly-signed payment_failed flips the customer to past_due", async () => {
    vi.stubEnv("STRIPE_SECRET_KEY", "sk_test_dummy");
    vi.stubEnv("STRIPE_WEBHOOK_SECRET", "whsec_dummy");
    vi.resetModules();
    // seed an active pro sub for customer cus_9
    await store.upsertSubscription(sub({ stripe_customer_id: "cus_9", status: "active" }));

    const payload = JSON.stringify({
      id: "evt_1",
      type: "invoice.payment_failed",
      data: { object: { customer: "cus_9" } },
    });
    const stripe = new Stripe("sk_test_dummy", { apiVersion: "2026-06-24.dahlia" });
    const header = stripe.webhooks.generateTestHeaderString({ payload, secret: "whsec_dummy" });

    const { POST } = await import("../../src/app/api/stripe/webhook/route");
    const res = await POST(
      new NextRequest("http://localhost/api/stripe/webhook", {
        method: "POST",
        body: payload,
        headers: { "stripe-signature": header },
      })
    );
    expect(res.status).toBe(200);
    const updated = await store.getSubscription("biller");
    expect(updated?.status).toBe("past_due");
    expect(updated?.past_due_since).toBeTruthy();
  });
});
