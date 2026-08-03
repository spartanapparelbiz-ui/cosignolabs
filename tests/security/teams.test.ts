import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryStore } from "../../src/lib/store/memory";
import { resetRateLimitsForTests } from "../../src/lib/ratelimit";
import { proposeAction } from "../../src/lib/actions/engine";
import { decideDelegated, listDelegatedProposals } from "../../src/lib/workspace";

/**
 * Workspaces grant exactly one cross-user power — delegated tier-2 decisions
 * by owners/approvers — and nothing else. Proven here: invite/role policy is
 * owner-only, delegation respects role + tier + injection guards, strangers
 * see and touch nothing, and account deletion dissolves what a user owned.
 */

const current = vi.hoisted(() => ({ id: "user-a", email: "a@x.com" }));
vi.mock("@/lib/auth", () => ({
  authConfigured: () => true,
  DEMO_USER_ID: "demo-user",
  getUserId: vi.fn(async () => current.id),
  getUserEmail: vi.fn(async () => current.email),
}));

let store: MemoryStore;

function jsonReq(url: string, method: string, body?: unknown) {
  return new NextRequest(url, {
    method,
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    headers: { "Content-Type": "application/json" },
  });
}

function actAs(id: string, email: string) {
  current.id = id;
  current.email = email;
}

async function proposeFor(userId: string, tier: 1 | 2 | 3, injection = false) {
  const session = await store.createSession(userId, "mission");
  return proposeAction({
    session_id: session.id,
    user_id: userId,
    category: "send_email",
    tier,
    summary: `tier-${tier} thing`,
    payload: { note: "x" },
    injection_flag: injection,
    tier_note: null,
  });
}

beforeEach(() => {
  store = new MemoryStore();
  (globalThis as Record<string, unknown>).__cosignoStore = store;
  resetRateLimitsForTests();
  actAs("user-a", "a@x.com");
});

describe("workspace lifecycle: create → invite → sign-in joins", () => {
  it("an invite binds by email when that person signs in", async () => {
    const { POST, GET } = await import("../../src/app/api/workspace/route");
    const created = await POST(jsonReq("http://x/api/workspace", "POST", { name: "household" }));
    expect(created.status).toBe(200);

    const { POST: INVITE } = await import("../../src/app/api/workspace/members/route");
    const invited = await INVITE(
      jsonReq("http://x/api/workspace/members", "POST", { email: "B@X.com", role: "approver" })
    );
    expect(invited.status).toBe(200);

    // B signs in → GET auto-accepts the invite (email match is lowercased).
    actAs("user-b", "b@x.com");
    const mine = await (await GET()).json();
    expect(mine.workspace.name).toBe("household");
    expect(mine.my_role).toBe("approver");
    expect(mine.members).toHaveLength(2);
  });

  it("only the owner can invite or change roles", async () => {
    await store.createWorkspace("user-a", "a@x.com", "ws");
    await store.inviteWorkspaceMember(await wsId(), "b@x.com", "member");
    await store.acceptWorkspaceInvites("user-b", "b@x.com");

    actAs("user-b", "b@x.com");
    const { POST: INVITE } = await import("../../src/app/api/workspace/members/route");
    const res = await INVITE(jsonReq("http://x/api/workspace/members", "POST", { email: "c@x.com" }));
    expect(res.status).toBe(403);
  });

  it("a stranger sees no workspace and no decisions", async () => {
    await store.createWorkspace("user-a", "a@x.com", "ws");
    actAs("stranger", "s@elsewhere.com");
    const { GET } = await import("../../src/app/api/workspace/route");
    expect((await (await GET()).json()).workspace).toBeNull();
    expect(await listDelegatedProposals("stranger", "s@elsewhere.com")).toEqual([]);
  });
});

async function wsId(): Promise<string> {
  return (await store.getWorkspaceForUser("user-a"))!.id;
}

describe("delegated decisions: role + tier + injection guards", () => {
  async function household() {
    await store.createWorkspace("user-a", "a@x.com", "ws"); // a = owner
    await store.inviteWorkspaceMember(await wsId(), "b@x.com", "approver");
    await store.acceptWorkspaceInvites("user-b", "b@x.com");
    await store.inviteWorkspaceMember(await wsId(), "c@x.com", "member");
    await store.acceptWorkspaceInvites("user-c", "c@x.com");
  }

  it("an approver sees a mate's tier-2 proposal and can approve it — audited", async () => {
    await household();
    const action = await proposeFor("user-a", 2);

    const listed = await listDelegatedProposals("user-b", "b@x.com");
    expect(listed.map((p) => p.action.id)).toContain(action.id);

    const decided = await decideDelegated("user-b", "b@x.com", action.id, "approve");
    expect(["executed", "failed"]).toContain(decided.status); // sandbox executes
    const events = await store.listEvents("user-a", action.id);
    const approval = events.find((e) => e.type === "approved")!;
    expect(approval.detail.delegated).toBe(true);
    expect(approval.detail.approved_by).toBe("b@x.com");
  });

  it("a plain member can SEE nothing and DECIDE nothing", async () => {
    await household();
    const action = await proposeFor("user-a", 2);
    expect(await listDelegatedProposals("user-c", "c@x.com")).toEqual([]);
    await expect(
      decideDelegated("user-c", "c@x.com", action.id, "approve")
    ).rejects.toThrow(/approval rights/i);
  });

  it("tier-3 never appears and can't be delegated even by the owner", async () => {
    await household();
    const t3 = await proposeFor("user-b", 3);
    const listed = await listDelegatedProposals("user-a", "a@x.com");
    expect(listed.map((p) => p.action.id)).not.toContain(t3.id);
    await expect(
      decideDelegated("user-a", "a@x.com", t3.id, "approve")
    ).rejects.toThrow(/couldn't find/i);
    expect((await store.getAction("user-b", t3.id))!.status).toBe("proposed");
  });

  it("an injection-flagged tier-2 card is visible but its approval is refused", async () => {
    await household();
    const flagged = await proposeFor("user-a", 2, true);
    const listed = await listDelegatedProposals("user-b", "b@x.com");
    expect(listed.find((p) => p.action.id === flagged.id)?.action.injection_flag).toBe(true);
    await expect(
      decideDelegated("user-b", "b@x.com", flagged.id, "approve")
    ).rejects.toThrow(/held|can't be executed/i);
  });

  it("a veto by an approver records the actor and resolves the card", async () => {
    await household();
    const action = await proposeFor("user-a", 2);
    const decided = await decideDelegated("user-b", "b@x.com", action.id, "veto", "not now");
    expect(decided.status).toBe("vetoed");
    const veto = (await store.listEvents("user-a", action.id)).find((e) => e.type === "vetoed")!;
    expect(veto.detail.vetoed_by).toBe("b@x.com");
  });

  it("a stranger outside the workspace can't decide a member's action", async () => {
    await household();
    const action = await proposeFor("user-a", 2);
    await expect(
      decideDelegated("stranger", "s@elsewhere.com", action.id, "approve")
    ).rejects.toThrow(/approval rights/i);
    expect((await store.getAction("user-a", action.id))!.status).toBe("proposed");
  });
});

describe("account deletion dissolves what the user owned", () => {
  it("owner deletion removes the workspace; member deletion only their membership", async () => {
    await store.createWorkspace("user-a", "a@x.com", "ws");
    const ws = await wsId();
    await store.inviteWorkspaceMember(ws, "b@x.com", "member");
    await store.acceptWorkspaceInvites("user-b", "b@x.com");

    // Member B deletes their account → workspace remains, B is gone.
    await store.deleteAllUserData("user-b");
    expect(await store.getWorkspace(ws)).not.toBeNull();
    expect((await store.listWorkspaceMembers(ws)).map((m) => m.email)).toEqual(["a@x.com"]);

    // Owner A deletes → the whole workspace dissolves.
    await store.deleteAllUserData("user-a");
    expect(await store.getWorkspace(ws)).toBeNull();
    expect(await store.listWorkspaceMembers(ws)).toEqual([]);
  });
});
