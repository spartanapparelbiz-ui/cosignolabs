import { beforeEach, describe, expect, it } from "vitest";
import { MemoryStore } from "../../src/lib/store/memory";

/**
 * Stripe webhook replay + out-of-order guards at the store layer:
 * claimWebhookEvent returns true exactly once per event id, and the
 * subscription row carries last_event_at so the route can drop stale events.
 */

let store: MemoryStore;

beforeEach(() => {
  store = new MemoryStore();
  (globalThis as Record<string, unknown>).__cosignoStore = store;
});

describe("webhook replay guard", () => {
  it("claims an event id exactly once", async () => {
    expect(await store.claimWebhookEvent("evt_1", "customer.subscription.updated", 100)).toBe(true);
    expect(await store.claimWebhookEvent("evt_1", "customer.subscription.updated", 100)).toBe(false);
    expect(await store.claimWebhookEvent("evt_2", "customer.subscription.updated", 101)).toBe(true);
  });

  it("subscription rows carry last_event_at for the out-of-order guard", async () => {
    await store.upsertSubscription({
      user_id: "user-a",
      stripe_customer_id: "cus_1",
      stripe_subscription_id: "sub_1",
      plan: "pro",
      interval: "monthly",
      status: "active",
      current_period_end: null,
      cancel_at_period_end: false,
      past_due_since: null,
      started_at: null,
      last_event_at: 200,
      updated_at: new Date().toISOString(),
    });
    const sub = await store.getSubscription("user-a");
    expect(sub!.last_event_at).toBe(200);
  });
});
