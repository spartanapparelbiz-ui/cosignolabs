import { beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryStore } from "../../src/lib/store/memory";
import { approveAction, proposeAction, editAction } from "../../src/lib/actions/engine";
import {
  createRoomForAction,
  decideRoom,
  revokeRoomApproval,
} from "../../src/lib/rooms";
import type { ActionInsert } from "../../src/lib/store";

/**
 * CoSign Rooms — multi-approver gates. Proves: the owner's approval is blocked
 * until the room is satisfied; approvals bind to the exact plan hash; a
 * material plan change voids all approvals; a revoked approval re-locks the
 * gate; and a co-signer must be a real workspace member.
 */

vi.mock("@/lib/auth", () => ({
  clerkConfigured: () => true,
  DEMO_USER_ID: "demo-user",
  getUserId: vi.fn(async () => "owner"),
  getUserEmail: vi.fn(async () => "owner@acme.com"),
}));

let store: MemoryStore;

beforeEach(() => {
  store = new MemoryStore();
  (globalThis as Record<string, unknown>).__cosignoStore = store;
});

async function setupWorkspace() {
  // Owner + one approver, both active members.
  const ws = await store.createWorkspace("owner", "owner@acme.com", "Home");
  await store.inviteWorkspaceMember(ws.id, "partner@acme.com", "approver");
  await store.acceptWorkspaceInvites("partner", "partner@acme.com");
  return ws;
}

function insert(overrides: Partial<ActionInsert> = {}): ActionInsert {
  return {
    session_id: "s1",
    user_id: "owner",
    category: "spend",
    tier: 2,
    summary: "book the trip",
    payload: { amount: "1200", destination: "lisbon" },
    injection_flag: false,
    tier_note: null,
    ...overrides,
  };
}

describe("room gate", () => {
  it("blocks the owner's approval until co-signers approve", async () => {
    await setupWorkspace();
    const action = await proposeAction(insert());
    await createRoomForAction("owner", "owner@acme.com", action.id, {
      approverEmails: ["partner@acme.com"],
      requireAll: true,
    });

    // Owner tries to approve immediately → room isn't satisfied.
    await expect(approveAction("owner", action.id)).rejects.toMatchObject({ code: "room_pending" });

    // Partner co-signs → room satisfied → owner can approve.
    await decideRoom("partner", "partner@acme.com", (await store.getRoomByAction("owner", action.id))!.id, "approve");
    const executed = await approveAction("owner", action.id);
    expect(executed.status).toBe("executed");
  });

  it("a material plan change voids co-signer approvals", async () => {
    await setupWorkspace();
    const action = await proposeAction(insert());
    const room = await createRoomForAction("owner", "owner@acme.com", action.id, {
      approverEmails: ["partner@acme.com"],
    });
    await decideRoom("partner", "partner@acme.com", room.room.id, "approve");
    expect((await store.getRoom("owner", room.room.id))!.status).toBe("satisfied");

    // Owner edits the amount — the approval no longer covers this plan.
    await editAction("owner", action.id, { payload: { amount: "5000", destination: "lisbon" } });
    const after = await store.getRoom("owner", room.room.id);
    expect(after!.status).toBe("open"); // reset
    const approvers = await store.listRoomApprovers(room.room.id);
    expect(approvers[0].decision).toBe("pending"); // approval voided

    // And the owner still can't execute the changed plan without re-approval.
    await expect(approveAction("owner", action.id)).rejects.toMatchObject({ code: "room_pending" });
  });

  it("a revoked co-sign re-locks the gate", async () => {
    await setupWorkspace();
    const action = await proposeAction(insert());
    const room = await createRoomForAction("owner", "owner@acme.com", action.id, {
      approverEmails: ["partner@acme.com"],
    });
    await decideRoom("partner", "partner@acme.com", room.room.id, "approve");
    await revokeRoomApproval("partner", "partner@acme.com", room.room.id);
    expect((await store.getRoom("owner", room.room.id))!.status).toBe("open");
    await expect(approveAction("owner", action.id)).rejects.toMatchObject({ code: "room_pending" });
  });

  it("edit-then-reapprove works and never deadlocks the room", async () => {
    await setupWorkspace();
    const action = await proposeAction(insert());
    const room = await createRoomForAction("owner", "owner@acme.com", action.id, {
      approverEmails: ["partner@acme.com"],
    });
    await decideRoom("partner", "partner@acme.com", room.room.id, "approve");

    // Owner must NOT edit inline at approval (that would strand co-signers).
    await expect(
      approveAction("owner", action.id, { payload: { amount: "5000", destination: "porto" } })
    ).rejects.toMatchObject({ code: "forbidden" });

    // The correct flow: edit (persists + re-binds room), co-signer re-approves
    // the plan they can actually see, owner approves with no inline edit.
    await editAction("owner", action.id, { payload: { amount: "5000", destination: "porto" } });
    const reboundHash = (await store.getRoom("owner", room.room.id))!.plan_hash;
    // The co-signer sees the persisted new plan; its hash matches the room.
    const fresh = await store.getAction("owner", action.id);
    const { planHash } = await import("../../src/lib/planHash");
    expect(planHash(fresh!.payload)).toBe(reboundHash);

    await decideRoom("partner", "partner@acme.com", room.room.id, "approve");
    const executed = await approveAction("owner", action.id);
    expect(executed.status).toBe("executed");
  });

  it("rejects co-signers who are not workspace members", async () => {
    await setupWorkspace();
    const action = await proposeAction(insert());
    await expect(
      createRoomForAction("owner", "owner@acme.com", action.id, {
        approverEmails: ["stranger@evil.com"],
      })
    ).rejects.toMatchObject({ code: "forbidden" });
  });

  it("a non-member cannot decide in a room they're not part of", async () => {
    await setupWorkspace();
    const action = await proposeAction(insert());
    const room = await createRoomForAction("owner", "owner@acme.com", action.id, {
      approverEmails: ["partner@acme.com"],
    });
    await expect(
      decideRoom("stranger", "stranger@evil.com", room.room.id, "approve")
    ).rejects.toMatchObject({ code: "not_found" });
  });
});
