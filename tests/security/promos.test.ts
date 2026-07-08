import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryStore } from "../../src/lib/store/memory";
import { resetRateLimitsForTests } from "../../src/lib/ratelimit";
import type { SubscriptionRecord } from "../../src/lib/types";

/**
 * Promotion layer — every offer is server-validated and single-use per
 * customer. The three graded cases: refund past day 14 rejected, intro coupon
 * blocked for returning subscribers, usage offer renders exactly once.
 */

const currentUser = vi.hoisted(() => ({ id: "promo-user" as string | null }));

vi.mock("@/lib/auth", () => ({
  clerkConfigured: () => true,
  DEMO_USER_ID: "demo-user",
  getUserId: vi.fn(async () => currentUser.id),
}));

const fakeStripe = vi.hoisted(() => {
  const subscriptions = {
    create: vi.fn(async (_args: Record<string, unknown>) => ({
      id: "sub_new",
      latest_invoice: { payment_intent: { client_secret: "pi_secret", id: "pi_1" } },
    })),
    retrieve: vi.fn(async () => ({
      id: "sub_1",
      latest_invoice: { payment_intent: { id: "pi_1" } },
    })),
    cancel: vi.fn(async () => ({ id: "sub_1", status: "canceled" })),
    update: vi.fn(async () => ({ id: "sub_1" })),
  };
  const customers = { create: vi.fn(async () => ({ id: "cus_new" })) };
  const refunds = { create: vi.fn(async (_a: Record<string, unknown>) => ({ id: "re_1" })) };
  return {
    instance: { subscriptions, customers, refunds } as unknown as object | null,
    subscriptions,
    customers,
    refunds,
  };
});

vi.mock("@/lib/stripe", () => ({
  getStripe: () => fakeStripe.instance,
  appUrl: () => "http://localhost",
}));

let store: MemoryStore;

function post(path: string): NextRequest {
  return new NextRequest(`http://localhost${path}`, { method: "POST" });
}

function sub(partial: Partial<SubscriptionRecord>): SubscriptionRecord {
  const now = Math.floor(Date.now() / 1000);
  return {
    user_id: "promo-user",
    stripe_customer_id: "cus_1",
    stripe_subscription_id: "sub_1",
    plan: "pro",
    interval: "monthly",
    status: "active",
    current_period_end: now + 86400 * 20,
    cancel_at_period_end: false,
    past_due_since: null,
    started_at: now,
    updated_at: new Date().toISOString(),
    ...partial,
  };
}

beforeEach(() => {
  store = new MemoryStore();
  (globalThis as Record<string, unknown>).__cosignoStore = store;
  resetRateLimitsForTests();
  currentUser.id = "promo-user";
  fakeStripe.instance = {
    subscriptions: fakeStripe.subscriptions,
    customers: fakeStripe.customers,
    refunds: fakeStripe.refunds,
  };
  Object.values(fakeStripe.subscriptions).forEach((f) => f.mockClear());
  fakeStripe.refunds.create.mockClear();
  vi.stubEnv("STRIPE_PRICE_PRO_MONTHLY", "price_pro_monthly");
  vi.stubEnv("STRIPE_PRICE_PRO_ANNUAL", "price_pro_annual");
});

afterEach(() => vi.unstubAllEnvs());

describe("14-day refund guarantee", () => {
  it("refunds within the window and cancels immediately (once)", async () => {
    await store.upsertSubscription(sub({}));
    const { POST } = await import("../../src/app/api/billing/refund/route");

    const res = await POST();
    expect(res.status).toBe(200);
    expect(fakeStripe.refunds.create).toHaveBeenCalledWith({ payment_intent: "pi_1" });
    expect(fakeStripe.subscriptions.cancel).toHaveBeenCalledWith("sub_1");
    expect(await store.hasPromo("promo-user", "refund_used")).toBe(true);

    // second attempt is rejected — one lifetime refund
    const again = await POST();
    expect(again.status).toBe(409);
  });

  it("rejects a refund past day 14", async () => {
    const started = Math.floor(Date.now() / 1000) - 15 * 86400;
    await store.upsertSubscription(sub({ started_at: started }));
    const { POST } = await import("../../src/app/api/billing/refund/route");
    const res = await POST();
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error).toBe("refund_window_closed");
    expect(fakeStripe.refunds.create).not.toHaveBeenCalled();
    // and it did NOT burn the one-time refund
    expect(await store.hasPromo("promo-user", "refund_used")).toBe(false);
  });
});

describe("intro coupon (first-time subscribers only)", () => {
  beforeEach(() => vi.stubEnv("STRIPE_COUPON_INTRO", "coupon_intro9"));

  it("applies the intro coupon for a first-time pro-monthly subscriber", async () => {
    const { POST } = await import("../../src/app/api/billing/subscription/route");
    const res = await POST(
      new NextRequest("http://localhost/api/billing/subscription", {
        method: "POST",
        body: JSON.stringify({ plan: "pro", interval: "monthly" }),
        headers: { "Content-Type": "application/json" },
      })
    );
    expect(res.status).toBe(200);
    expect((await res.json()).introApplied).toBe(true);
    const args = fakeStripe.subscriptions.create.mock.calls[0]![0] as unknown as {
      discounts?: { coupon: string }[];
    };
    expect(args.discounts?.[0]?.coupon).toBe("coupon_intro9");
  });

  it("blocks the intro coupon for a returning subscriber", async () => {
    // the webhook marks a customer who has ever subscribed
    await store.claimPromo("promo-user", "subscribed", { plan: "pro" });
    const { POST } = await import("../../src/app/api/billing/subscription/route");
    const res = await POST(
      new NextRequest("http://localhost/api/billing/subscription", {
        method: "POST",
        body: JSON.stringify({ plan: "pro", interval: "monthly" }),
        headers: { "Content-Type": "application/json" },
      })
    );
    expect((await res.json()).introApplied).toBe(false);
    const args = fakeStripe.subscriptions.create.mock.calls[0]![0] as unknown as {
      discounts?: unknown;
    };
    expect(args.discounts).toBeUndefined();
  });

  it("does not apply the intro on annual or max (scope)", async () => {
    const { POST } = await import("../../src/app/api/billing/subscription/route");
    const res = await POST(
      new NextRequest("http://localhost/api/billing/subscription", {
        method: "POST",
        body: JSON.stringify({ plan: "pro", interval: "annual" }),
        headers: { "Content-Type": "application/json" },
      })
    );
    expect((await res.json()).introApplied).toBe(false);
  });
});

describe("usage-triggered offer renders exactly once", () => {
  async function makeEligible() {
    // free user, signed up recently (a session), hit the 25 cap
    await store.createSession("promo-user", "seed");
    const usage = await store.getUsage("promo-user");
    for (let i = 0; i < usage.limit; i++) await store.incrementUsage("promo-user");
  }

  it("returns the offer once, then never again", async () => {
    await makeEligible();
    const { GET } = await import("../../src/app/api/offers/route");

    const first = await (await GET()).json();
    expect(first.usageOffer).toBe(true);

    const second = await (await GET()).json();
    expect(second.usageOffer).toBe(false);
  });

  it("does not offer to a user who hasn't hit the cap", async () => {
    await store.createSession("promo-user", "seed");
    const { GET } = await import("../../src/app/api/offers/route");
    const body = await (await GET()).json();
    expect(body.usageOffer).toBe(false);
  });
});
