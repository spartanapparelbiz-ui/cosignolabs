import { beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryStore } from "../../src/lib/store/memory";
import {
  approveAction,
  autoExecute,
  editAction,
  proposalExpired,
  proposeAction,
  PROPOSAL_TTL_MS,
} from "../../src/lib/actions/engine";
import { planHash } from "../../src/lib/planHash";
import type { ActionInsert } from "../../src/lib/store";

/**
 * The server-enforced approval gate: plan-hash binding, expiry, single-use
 * consumption, no double-execution, and immutable receipts for every attempt.
 * Proven against the store contract (the same the production Supabase backend
 * implements). No route, no client — the guarantees are in the engine.
 */

vi.mock("@/lib/auth", () => ({
  clerkConfigured: () => true,
  DEMO_USER_ID: "demo-user",
  getUserId: vi.fn(async () => "user-a"),
}));

let store: MemoryStore;

beforeEach(() => {
  store = new MemoryStore();
  (globalThis as Record<string, unknown>).__cosignoStore = store;
});

function insert(overrides: Partial<ActionInsert> = {}): ActionInsert {
  return {
    session_id: "s1",
    user_id: "user-a",
    category: "send_email",
    tier: 2,
    summary: "email finance the report",
    payload: { to: "finance@acme.com", amount: "100" },
    injection_flag: false,
    tier_note: null,
    ...overrides,
  };
}

describe("plan-hash binding", () => {
  it("executes when the approved payload is unchanged", async () => {
    const action = await proposeAction(insert());
    const executed = await approveAction("user-a", action.id);
    expect(executed.status).toBe("executed");
    const receipts = await store.listReceipts("user-a");
    expect(receipts).toHaveLength(1);
    expect(receipts[0].status).toBe("executed");
    expect(receipts[0].plan_hash).toBe(planHash(action.payload));
    expect(receipts[0].correlation_id).toBeTruthy();
  });

  it("an approval carries a hashed authorization record + single-use nonce", async () => {
    const action = await proposeAction(insert());
    await approveAction("user-a", action.id, { signature: { name: "Sam" } });
    const events = await store.listEvents("user-a", action.id);
    const approved = events.find((e) => e.type === "approved")!;
    const auth = approved.detail.authorization as Record<string, unknown>;
    expect(auth.method).toBe("signed");
    expect(auth.plan_hash).toBe(planHash(action.payload));
    expect(typeof auth.nonce).toBe("string");
    expect(typeof auth.record_hash).toBe("string");
  });

  it("receipts never contain raw tokens or full payloads", async () => {
    const action = await proposeAction(
      insert({ payload: { to: "x@y.com", secret_token: "sk-should-not-appear", body: "z".repeat(9999) } })
    );
    await approveAction("user-a", action.id);
    const receipt = (await store.listReceipts("user-a"))[0];
    const serialized = JSON.stringify(receipt);
    expect(serialized).not.toContain("sk-should-not-appear");
    expect(serialized.length).toBeLessThan(2000);
  });
});

describe("expiry", () => {
  it("proposalExpired is true past the TTL", () => {
    const old = new Date(Date.now() - PROPOSAL_TTL_MS - 1000).toISOString();
    expect(proposalExpired({ created_at: old })).toBe(true);
    expect(proposalExpired({ created_at: new Date().toISOString() })).toBe(false);
  });

  it("an expired proposal cannot be approved and is recorded", async () => {
    const action = await proposeAction(insert());
    // Backdate the stored row beyond the TTL.
    (store as unknown as { actions: { id: string; created_at: string }[] }).actions.find(
      (a) => a.id === action.id
    )!.created_at = new Date(Date.now() - PROPOSAL_TTL_MS - 5000).toISOString();

    await expect(approveAction("user-a", action.id)).rejects.toMatchObject({
      code: "approval_expired",
    });
    const fresh = await store.getAction("user-a", action.id);
    expect(fresh!.status).toBe("proposed"); // never advanced
    const events = await store.listEvents("user-a", action.id);
    expect(events.some((e) => e.detail.reason === "approval_expired")).toBe(true);
  });
});

describe("single-use + no double execution", () => {
  it("a second approval of a consumed card is refused", async () => {
    const action = await proposeAction(insert());
    await approveAction("user-a", action.id);
    await expect(approveAction("user-a", action.id)).rejects.toMatchObject({
      code: "invalid_state",
    });
    // Exactly one execution + one receipt.
    const events = await store.listEvents("user-a", action.id);
    expect(events.filter((e) => e.type === "executed")).toHaveLength(1);
    expect(await store.listReceipts("user-a")).toHaveLength(1);
  });

  it("concurrent approvals execute exactly once", async () => {
    const action = await proposeAction(insert());
    const results = await Promise.allSettled([
      approveAction("user-a", action.id),
      approveAction("user-a", action.id),
    ]);
    const ok = results.filter((r) => r.status === "fulfilled");
    expect(ok).toHaveLength(1);
    expect(await store.listReceipts("user-a")).toHaveLength(1);
  });
});

describe("injection containment", () => {
  it("a flagged card can never be approved, and writes no receipt", async () => {
    const action = await proposeAction(insert({ injection_flag: true }));
    await expect(approveAction("user-a", action.id)).rejects.toMatchObject({
      code: "injection_blocked",
    });
    expect(await store.listReceipts("user-a")).toHaveLength(0);
  });

  it("a flagged tier-1 card never auto-executes", async () => {
    const action = await proposeAction(insert({ tier: 1, category: "search", injection_flag: true }));
    const result = await autoExecute("user-a", action);
    expect(result.status).toBe("proposed");
  });
});

describe("edit invalidates prior binding surface", () => {
  it("editing the payload changes the plan hash", async () => {
    const action = await proposeAction(insert());
    const before = planHash(action.payload);
    const edited = await editAction("user-a", action.id, {
      payload: { to: "attacker@evil.com", amount: "100" },
    });
    expect(planHash(edited.payload)).not.toBe(before);
  });
});
