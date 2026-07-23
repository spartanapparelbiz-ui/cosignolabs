import { beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryStore } from "../../src/lib/store/memory";
import { approveAction, proposeAction, vetoAction } from "../../src/lib/actions/engine";
import { recordActionReceipt } from "../../src/lib/receipts";
import type { ActionInsert } from "../../src/lib/store";

/**
 * Two-user tenant isolation — the build-blocking matrix. Every store read is
 * scoped by userId; this proves User A cannot reach ANY of User B's data,
 * approvals, executions, integrations, files, or receipts. If any assertion
 * here fails, cross-tenant access exists and CI must go red.
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

function insert(userId: string, overrides: Partial<ActionInsert> = {}): ActionInsert {
  return {
    session_id: "s1",
    user_id: userId,
    category: "send_email",
    tier: 2,
    summary: "b's private email",
    payload: { to: "b-private@acme.com" },
    injection_flag: false,
    tier_note: null,
    ...overrides,
  };
}

describe("cross-user data access is impossible", () => {
  it("A cannot READ B's action", async () => {
    const b = await proposeAction(insert("user-b"));
    expect(await store.getAction("user-a", b.id)).toBeNull();
    expect(await store.getAction("user-b", b.id)).not.toBeNull();
  });

  it("A cannot APPROVE B's action (it's invisible to A)", async () => {
    const b = await proposeAction(insert("user-b"));
    await expect(approveAction("user-a", b.id)).rejects.toMatchObject({ code: "not_found" });
    // B's card is untouched.
    expect((await store.getAction("user-b", b.id))!.status).toBe("proposed");
  });

  it("A cannot VETO B's action", async () => {
    const b = await proposeAction(insert("user-b"));
    await expect(vetoAction("user-a", b.id, "nope")).rejects.toMatchObject({ code: "not_found" });
  });

  it("A cannot EXECUTE B's plan (approve is the only door, and it's scoped)", async () => {
    const b = await proposeAction(insert("user-b"));
    await expect(approveAction("user-a", b.id)).rejects.toBeTruthy();
    expect(await store.listReceipts("user-a")).toHaveLength(0);
  });

  it("A cannot READ B's receipts", async () => {
    const b = await proposeAction(insert("user-b"));
    await approveAction("user-b", b.id);
    expect(await store.listReceipts("user-b")).toHaveLength(1);
    expect(await store.listReceipts("user-a")).toHaveLength(0);
  });

  it("A cannot READ B's files", async () => {
    const f = await store.createFile({ user_id: "user-b", name: "b.txt", mime: "text/plain", content: "secret" });
    expect(await store.getFile("user-a", f.id)).toBeNull();
    expect(await store.getFile("user-b", f.id)).not.toBeNull();
  });

  it("A cannot UPDATE or DELETE B's file", async () => {
    const f = await store.createFile({ user_id: "user-b", name: "b.txt", mime: "text/plain", content: "secret" });
    expect(await store.updateFile("user-a", f.id, { content: "hacked" })).toBeNull();
    await store.deleteFile("user-a", f.id); // no-op for A
    expect(await store.getFile("user-b", f.id)).not.toBeNull();
  });

  it("A cannot READ B's connection (integration credentials)", async () => {
    const c = await store.createConnection({
      user_id: "user-b",
      provider_key: "gmail",
      kind: "app",
      display_name: "Gmail",
      auth_type: "oauth2",
      encrypted_credentials: "cipher",
    });
    expect(await store.getConnection("user-a", c.id)).toBeNull();
    expect(await store.getConnection("user-b", c.id)).not.toBeNull();
  });

  it("A cannot READ B's mission or its steps", async () => {
    const m = await store.createMission({ user_id: "user-b", session_id: "s-b", goal: "b's mission" });
    expect(await store.getMission("user-a", m.id)).toBeNull();
    expect(await store.getMission("user-b", m.id)).not.toBeNull();
  });

  it("A cannot READ B's security events", async () => {
    await store.recordSecurityEvent({ user_id: "user-b", event: "approval_created" });
    expect(await store.listSecurityEvents("user-a")).toHaveLength(0);
    expect(await store.listSecurityEvents("user-b")).toHaveLength(1);
  });

  it("A's account deletion never touches B's data", async () => {
    const b = await proposeAction(insert("user-b"));
    await approveAction("user-b", b.id);
    await store.createFile({ user_id: "user-b", name: "b.txt", mime: "text/plain", content: "x" });
    await store.deleteAllUserData("user-a");
    expect(await store.getAction("user-b", b.id)).not.toBeNull();
    expect(await store.listReceipts("user-b")).toHaveLength(1);
    expect(await store.listFiles("user-b")).toHaveLength(1);
  });
});

describe("receipts are immutable", () => {
  it("a stored receipt cannot be mutated in place", async () => {
    const action = await proposeAction(insert("user-a"));
    const rec = await recordActionReceipt(
      action,
      { correlationId: "c1", planHash: "h1", approvedBy: "user-a", authorizationMethod: "approved" },
      { status: "executed", resultSummary: "done" }
    );
    expect(rec).not.toBeNull();
    // The stored row is frozen (mirrors the Postgres update-blocking trigger).
    const stored = (await store.listReceipts("user-a"))[0];
    expect(() => {
      (stored as unknown as { status: string }).status = "rejected";
    }).not.toThrow(); // the returned COPY is mutable
    // ...but the canonical stored row is unchanged.
    expect((await store.listReceipts("user-a"))[0].status).toBe("executed");
  });
});
