import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryStore } from "../../src/lib/store/memory";
import { resetRateLimitsForTests } from "../../src/lib/ratelimit";

/**
 * Account center: the delete-account flow must require a typed "delete"
 * confirmation (tier-3 pattern) and cascade-delete every row the user owns.
 * Audit rows are written for tier + integration changes and surfaced to the
 * security panel; deletion sweeps those too.
 */

const currentUser = vi.hoisted(() => ({ id: "user-a" }));

vi.mock("@/lib/auth", () => ({
  authConfigured: () => true,
  DEMO_USER_ID: "demo-user",
  getUserId: vi.fn(async () => currentUser.id),
}));

// Account deletion now also deletes the auth user (so the email frees up
// for re-signup) — stub the admin helper; its behavior is pinned in
// account-delete.test.ts.
vi.mock("@/lib/supabaseAuth/admin", () => ({
  deleteAuthUser: vi.fn(async () => undefined),
}));

let store: MemoryStore;

function jsonReq(url: string, method: string, body: unknown): NextRequest {
  return new NextRequest(url, {
    method,
    body: JSON.stringify(body),
    headers: { "Content-Type": "application/json" },
  });
}

async function seedUser(userId: string) {
  const session = await store.createSession(userId, "seed");
  await store.addMessage(userId, session.id, "user", "hi");
  await store.createAction({
    session_id: session.id,
    user_id: userId,
    category: "search",
    tier: 1,
    summary: "seed action",
    payload: {},
    injection_flag: false,
    tier_note: null,
  });
  await store.setTierSetting(userId, "search", 2);
  await store.setIntegration(userId, "gmail", true);
  await store.incrementUsage(userId);
  await store.logAudit(userId, "tier_changed", { category: "search", tier: 2 });
}

beforeEach(() => {
  store = new MemoryStore();
  (globalThis as Record<string, unknown>).__cosignoStore = store;
  resetRateLimitsForTests();
  currentUser.id = "user-a";
});

describe("DELETE /api/account", () => {
  it("rejects without the typed 'delete' confirmation → 400, nothing deleted", async () => {
    await seedUser("user-a");
    const { DELETE } = await import("../../src/app/api/account/route");
    const res = await DELETE(
      jsonReq("http://localhost/api/account", "DELETE", { confirmation: "yes" })
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("confirmation_mismatch");

    // Data survives a failed confirmation.
    expect(await store.listSessions("user-a")).toHaveLength(1);
    expect(await store.listActions("user-a")).toHaveLength(1);
  });

  it("cascade-deletes every row the user owns when confirmed", async () => {
    await seedUser("user-a");
    await seedUser("user-b"); // a bystander whose data must be untouched

    const { DELETE } = await import("../../src/app/api/account/route");
    const res = await DELETE(
      jsonReq("http://localhost/api/account", "DELETE", { confirmation: "delete" })
    );
    expect(res.status).toBe(200);
    expect((await res.json()).ok).toBe(true);

    // user-a is fully swept.
    expect(await store.listSessions("user-a")).toHaveLength(0);
    expect(await store.listActions("user-a")).toHaveLength(0);
    expect(await store.getTierSettings("user-a")).toHaveLength(0);
    expect(await store.listIntegrations("user-a")).toHaveLength(0);
    expect(await store.listAudit("user-a")).toHaveLength(0);
    expect(await store.getSubscription("user-a")).toBeNull();

    // user-b is untouched.
    expect(await store.listSessions("user-b")).toHaveLength(1);
    expect(await store.listActions("user-b")).toHaveLength(1);
  });

  it("accepts confirmation case-insensitively and trimmed", async () => {
    await seedUser("user-a");
    const { DELETE } = await import("../../src/app/api/account/route");
    const res = await DELETE(
      jsonReq("http://localhost/api/account", "DELETE", { confirmation: "  DELETE  " })
    );
    expect(res.status).toBe(200);
    expect(await store.listSessions("user-a")).toHaveLength(0);
  });
});

describe("account audit trail", () => {
  it("tier changes write an audit row surfaced by /api/account/audit", async () => {
    const { PUT } = await import("../../src/app/api/settings/tiers/route");
    await PUT(jsonReq("http://localhost/api/settings/tiers", "PUT", { category: "search", tier: 2 }));

    const { GET } = await import("../../src/app/api/account/audit/route");
    const res = await GET();
    const body = await res.json();
    expect(body.audit.some((a: { type: string }) => a.type === "tier_changed")).toBe(true);
  });

  it("integration connect/disconnect writes audit rows", async () => {
    const { POST } = await import("../../src/app/api/integrations/route");
    await POST(jsonReq("http://localhost/api/integrations", "POST", { key: "gmail", connected: true }));
    await POST(jsonReq("http://localhost/api/integrations", "POST", { key: "gmail", connected: false }));

    const audit = await store.listAudit("user-a");
    const types = audit.map((a) => a.type);
    expect(types).toContain("integration_connected");
    expect(types).toContain("integration_disconnected");
  });
});
