import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getUserPlan } from "../../src/lib/billing";
import { MemoryStore } from "../../src/lib/store/memory";
import { resetRateLimitsForTests } from "../../src/lib/ratelimit";
import type { SubscriptionRecord } from "../../src/lib/types";

/**
 * Embedded checkout. The new /api/billing/subscription route creates the
 * incomplete subscription and returns a client secret — it must NEVER grant
 * plan access itself. Access is granted only when the webhook (sole writer)
 * observes the subscription go active. This pins that boundary.
 */

const currentUser = vi.hoisted(() => ({ id: "buyer" as string | null }));

vi.mock("@/lib/auth", () => ({
  clerkConfigured: () => true,
  DEMO_USER_ID: "demo-user",
  getUserId: vi.fn(async () => currentUser.id),
}));

// Controllable fake Stripe so the route can run without network/keys.
const fakeStripe = vi.hoisted(() => {
  const subscriptions = {
    create: vi.fn(async (_args: Record<string, unknown>) => ({
      id: "sub_new",
      latest_invoice: { payment_intent: { client_secret: "pi_secret_test_123" } },
    })),
  };
  const customers = { create: vi.fn(async () => ({ id: "cus_new" })) };
  return { instance: { subscriptions, customers } as unknown as object | null, subscriptions, customers };
});

vi.mock("@/lib/stripe", () => ({
  getStripe: () => fakeStripe.instance,
  appUrl: () => "http://localhost",
}));

let store: MemoryStore;

function jsonReq(body: unknown): NextRequest {
  return new NextRequest("http://localhost/api/billing/subscription", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "Content-Type": "application/json" },
  });
}

function sub(partial: Partial<SubscriptionRecord>): SubscriptionRecord {
  return {
    user_id: "buyer",
    stripe_customer_id: "cus_new",
    stripe_subscription_id: "sub_new",
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
  currentUser.id = "buyer";
  fakeStripe.instance = { subscriptions: fakeStripe.subscriptions, customers: fakeStripe.customers };
  fakeStripe.subscriptions.create.mockClear();
  vi.stubEnv("STRIPE_PRICE_PRO_MONTHLY", "price_pro_monthly");
});

afterEach(() => vi.unstubAllEnvs());

describe("POST /api/billing/subscription", () => {
  it("returns a client secret and creates a default_incomplete subscription", async () => {
    const { POST } = await import("../../src/app/api/billing/subscription/route");
    const res = await POST(jsonReq({ plan: "pro", interval: "monthly" }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.clientSecret).toBe("pi_secret_test_123");
    expect(body.plan).toBe("pro");

    // it created the subscription as incomplete — payment isn't captured yet
    const args = fakeStripe.subscriptions.create.mock.calls[0]![0] as unknown as {
      payment_behavior: string;
    };
    expect(args.payment_behavior).toBe("default_incomplete");

    // and it WROTE NOTHING to our store — the webhook is the only writer
    expect(await store.getSubscription("buyer")).toBeNull();
    // so the user still has no paid access from this call alone
    expect((await getUserPlan("buyer")).planId).toBe("free");
  });

  it("401 without a session", async () => {
    currentUser.id = null;
    const { POST } = await import("../../src/app/api/billing/subscription/route");
    const res = await POST(jsonReq({ plan: "pro", interval: "monthly" }));
    expect(res.status).toBe(401);
  });

  it("503 when billing is not configured", async () => {
    fakeStripe.instance = null;
    const { POST } = await import("../../src/app/api/billing/subscription/route");
    const res = await POST(jsonReq({ plan: "pro", interval: "monthly" }));
    expect(res.status).toBe(503);
  });

  it("rejects the free plan (only pro/max check out)", async () => {
    const { POST } = await import("../../src/app/api/billing/subscription/route");
    const res = await POST(jsonReq({ plan: "free", interval: "monthly" }));
    expect(res.status).toBe(400);
  });
});

describe("the success screen alone never grants plan access", () => {
  it("an incomplete subscription (post-confirm, pre-webhook) resolves to free", async () => {
    // This is exactly what the embedded flow produces before the webhook sees
    // the payment succeed: the client confirmed, but our store row is still
    // incomplete. getUserPlan must fail closed.
    await store.upsertSubscription(sub({ status: "incomplete" }));
    expect((await getUserPlan("buyer")).planId).toBe("free");
  });

  it("only the webhook flipping it to active grants access", async () => {
    await store.upsertSubscription(sub({ status: "incomplete" }));
    expect((await getUserPlan("buyer")).planId).toBe("free");
    // simulate the webhook (sole writer) observing it go active
    await store.upsertSubscription(sub({ status: "active" }));
    expect((await getUserPlan("buyer")).planId).toBe("pro");
  });
});
