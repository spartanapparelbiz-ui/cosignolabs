import { getStore } from "./store";
import { planHash } from "./planHash";
import { EngineError, voidRoomApprovals } from "./actions/engine";
import { recordSecurityEvent } from "./securityEvents";
import { myWorkspace } from "./workspace";
import type {
  ActionRecord,
  CosignRoomRecord,
  RoomApproverRecord,
  RoomEventRecord,
} from "./types";

/**
 * CoSign Rooms — multi-approver gates over an action card.
 *
 * Server-enforced invariants (none of these live in the UI):
 *  - Only the action's OWNER can open a room, only on their own PROPOSED,
 *    un-flagged card, and only with approvers who are active members of
 *    their workspace (the existing human trust boundary) — plus themselves.
 *  - Every decision binds to the plan hash it was made against. Any material
 *    payload change voids all decisions (handled in the engine, which owns
 *    payload edits) and requires reapproval.
 *  - Optional strict order (position) and unanimity (require_all).
 *  - Rooms expire; expired rooms refuse decisions and refuse the gate.
 *  - Rejection closes the room; requested changes send it back to the owner.
 *  - Approvals are revocable while the action hasn't executed.
 *  - Everything lands in an append-only room event history.
 *
 * The room never executes anything: satisfaction only unlocks the normal
 * approval door (engine.enforceRoomGate) — the owner still approves/signs,
 * tier-3 still requires its typed confirmation.
 */

export const MAX_ROOM_APPROVERS = 6;
export const ROOM_DEFAULT_TTL_HOURS = 72;
export const ROOM_MAX_TTL_HOURS = 24 * 14;

export interface RoomView {
  room: CosignRoomRecord;
  approvers: RoomApproverRecord[];
  events: RoomEventRecord[];
  /** True when every required decision is in and the gate is open. */
  satisfied: boolean;
}

async function loadOwnedProposedAction(
  ownerId: string,
  actionId: string
): Promise<ActionRecord> {
  const action = await getStore().getAction(ownerId, actionId);
  if (!action) throw new EngineError("not_found", "we couldn't find that action.");
  if (action.status !== "proposed") {
    throw new EngineError(
      "invalid_state",
      "a room can only be opened on a card that's still waiting for approval."
    );
  }
  if (action.injection_flag) {
    throw new EngineError(
      "injection_blocked",
      "this card was flagged and can never execute — a room can't change that."
    );
  }
  return action;
}

export async function createRoomForAction(
  ownerId: string,
  ownerEmail: string,
  actionId: string,
  opts: {
    name?: string;
    approverEmails: string[];
    requireAll?: boolean;
    ordered?: boolean;
    expiresInHours?: number;
  }
): Promise<RoomView> {
  const store = getStore();
  const action = await loadOwnedProposedAction(ownerId, actionId);

  const existing = await store.getRoomByAction(ownerId, actionId);
  if (existing && existing.status !== "cancelled") {
    throw new EngineError("invalid_state", "this card already has an approval room.");
  }

  const emails = Array.from(
    new Set(opts.approverEmails.map((e) => e.trim().toLowerCase()).filter(Boolean))
  );
  if (emails.length === 0) {
    throw new EngineError("forbidden", "a room needs at least one co-signer.");
  }
  if (emails.length > MAX_ROOM_APPROVERS) {
    throw new EngineError("forbidden", `a room can have at most ${MAX_ROOM_APPROVERS} co-signers.`);
  }

  // Approvers must be humans the owner already trusts: active workspace
  // members (or the owner themselves). No arbitrary outside emails — that
  // would turn "who may co-sign" into unauthenticated input.
  const ws = await myWorkspace(ownerId, ownerEmail);
  const allowed = new Set<string>([ownerEmail.toLowerCase()]);
  if (ws) {
    for (const m of ws.members) {
      if (m.status === "active") allowed.add(m.email.toLowerCase());
    }
  }
  const outsiders = emails.filter((e) => !allowed.has(e));
  if (outsiders.length > 0) {
    throw new EngineError(
      "forbidden",
      "co-signers must be active members of your workspace. invite them to the workspace first."
    );
  }

  const ttl = Math.min(
    Math.max(opts.expiresInHours ?? ROOM_DEFAULT_TTL_HOURS, 1),
    ROOM_MAX_TTL_HOURS
  );
  const room = await store.createRoom({
    user_id: ownerId,
    action_id: actionId,
    mission_id: null,
    name: (opts.name ?? "Approval room").slice(0, 120),
    require_all: opts.requireAll ?? true,
    ordered: opts.ordered ?? false,
    plan_hash: planHash(action.payload),
    expires_at: new Date(Date.now() + ttl * 3600_000).toISOString(),
  });
  await store.addRoomApprovers(
    room.id,
    ownerId,
    emails.map((email, i) => ({ email, position: i }))
  );
  await store.logRoomEvent(room.id, ownerId, ownerEmail, "created", {
    approvers: emails,
    require_all: room.require_all,
    ordered: room.ordered,
    expires_at: room.expires_at,
  });
  await recordSecurityEvent(ownerId, "room_created", {
    detail: { room_id: room.id, action_id: actionId, approvers: emails.length },
  });
  return getRoomView(ownerId, room.id);
}

export async function getRoomView(ownerId: string, roomId: string): Promise<RoomView> {
  const store = getStore();
  const room = await store.getRoom(ownerId, roomId);
  if (!room) throw new EngineError("not_found", "we couldn't find that room.");
  const approvers = await store.listRoomApprovers(room.id);
  const events = await store.listRoomEvents(ownerId, room.id);
  return { room, approvers, events, satisfied: room.status === "satisfied" };
}

/** Rooms (across all owners) where this verified email still owes a decision. */
export async function roomsAwaitingUser(email: string): Promise<
  { room: CosignRoomRecord; me: RoomApproverRecord; action: ActionRecord | null }[]
> {
  const store = getStore();
  const rooms = await store.listRoomsForApprover(email);
  const out: { room: CosignRoomRecord; me: RoomApproverRecord; action: ActionRecord | null }[] = [];
  for (const room of rooms) {
    if (room.status !== "open") continue;
    if (new Date(room.expires_at).getTime() < Date.now()) continue;
    const approvers = await store.listRoomApprovers(room.id);
    const me = approvers.find((a) => a.approver_email === email.toLowerCase());
    if (!me || me.decision !== "pending") continue;
    const action = await store.getAction(room.user_id, room.action_id);
    out.push({ room, me, action });
  }
  return out;
}

function assertNotExpired(room: CosignRoomRecord): void {
  if (new Date(room.expires_at).getTime() < Date.now()) {
    throw new EngineError("room_pending", "this room has expired — decisions are closed.");
  }
}

/**
 * Resolve a room the ACTOR may act in (as an approver), across owners — and
 * re-validate the trust boundary AT DECISION TIME. Membership is checked at
 * room creation, but a co-signer can be removed from the workspace while a
 * room is open; without this re-check they'd retain gate authority. The actor
 * must be the room owner (co-signing their own action) or still an ACTIVE
 * member of the owner's workspace.
 */
async function roomForApprover(
  actorUserId: string,
  actorEmail: string,
  roomId: string
): Promise<{ room: CosignRoomRecord; me: RoomApproverRecord; approvers: RoomApproverRecord[] }> {
  const store = getStore();
  const rooms = await store.listRoomsForApprover(actorEmail);
  const room = rooms.find((r) => r.id === roomId);
  if (!room) throw new EngineError("not_found", "we couldn't find that room.");
  const approvers = await store.listRoomApprovers(room.id);
  const me = approvers.find((a) => a.approver_email === actorEmail.toLowerCase());
  if (!me) throw new EngineError("forbidden", "you're not a co-signer in this room.");

  // Re-check active membership unless the actor IS the owner acting on their
  // own room (owners can always co-sign their own action).
  if (actorUserId !== room.user_id) {
    const ws = await store.getWorkspaceForUser(room.user_id);
    const members = ws ? await store.listWorkspaceMembers(ws.id) : [];
    const active = new Set(
      members.filter((m) => m.status === "active").map((m) => m.email.toLowerCase())
    );
    if (!active.has(actorEmail.toLowerCase())) {
      throw new EngineError(
        "forbidden",
        "you're no longer an active member of this workspace, so you can't co-sign here."
      );
    }
  }
  return { room, me, approvers };
}

export type RoomDecisionInput = "approve" | "reject" | "request_changes";

export async function decideRoom(
  actorUserId: string,
  actorEmail: string,
  roomId: string,
  decision: RoomDecisionInput,
  comment?: string
): Promise<RoomView> {
  const store = getStore();
  const { room, me, approvers } = await roomForApprover(actorUserId, actorEmail, roomId);

  if (room.status !== "open") {
    throw new EngineError(
      "invalid_state",
      `this room is ${room.status} — no further decisions are possible.`
    );
  }
  assertNotExpired(room);
  if (me.decision !== "pending") {
    throw new EngineError("invalid_state", "you already decided — revoke first to change it.");
  }

  // The plan the approver is deciding on must be EXACTLY the room's plan.
  const action = await store.getAction(room.user_id, room.action_id);
  if (!action || action.status !== "proposed") {
    throw new EngineError("invalid_state", "the underlying card is no longer approvable.");
  }
  const currentHash = planHash(action.payload);
  if (currentHash !== room.plan_hash) {
    await voidRoomApprovals(room.user_id, room, currentHash, "hash-drift-at-decision");
    throw new EngineError(
      "room_pending",
      "the plan changed since this room was opened — approvals were reset against the updated plan. review it again."
    );
  }

  // Strict order: everyone before me must already be approved.
  if (room.ordered) {
    const before = approvers.filter((a) => a.position < me.position);
    if (before.some((a) => a.decision !== "approved")) {
      throw new EngineError("room_pending", "it's not your turn yet — earlier co-signers decide first.");
    }
  }

  const now = new Date().toISOString();
  const mapped =
    decision === "approve" ? "approved" : decision === "reject" ? "rejected" : "changes_requested";
  await store.updateRoomApprover(room.id, me.id, {
    decision: mapped,
    decided_plan_hash: room.plan_hash,
    comment: comment ? comment.slice(0, 500) : null,
    decided_at: now,
    approver_user_id: actorUserId,
  });
  await store.logRoomEvent(room.id, room.user_id, actorEmail, mapped, {
    plan_hash: room.plan_hash,
    ...(comment ? { comment: comment.slice(0, 500) } : {}),
  });

  if (decision === "reject") {
    await store.updateRoom(room.user_id, room.id, { status: "revoked" });
    await recordSecurityEvent(room.user_id, "room_rejection", {
      detail: { room_id: room.id, action_id: room.action_id, by: actorEmail },
    });
  } else if (decision === "request_changes") {
    await store.updateRoom(room.user_id, room.id, { status: "changes_requested" });
    await recordSecurityEvent(room.user_id, "room_changes_requested", {
      detail: { room_id: room.id, action_id: room.action_id, by: actorEmail },
    });
  } else {
    await recordSecurityEvent(room.user_id, "room_approval", {
      detail: { room_id: room.id, action_id: room.action_id, by: actorEmail },
    });
    const fresh = await store.listRoomApprovers(room.id);
    const satisfied = room.require_all
      ? fresh.every((a) => a.decision === "approved")
      : fresh.some((a) => a.decision === "approved");
    if (satisfied) {
      await store.updateRoom(room.user_id, room.id, { status: "satisfied" });
      await store.logRoomEvent(room.id, room.user_id, "system", "satisfied", {
        plan_hash: room.plan_hash,
      });
    }
  }
  return getRoomView(room.user_id, room.id);
}

/**
 * An approver takes their approval back. Allowed while the underlying card
 * hasn't executed — a satisfied room drops back to open, and the engine's
 * gate will refuse execution from that moment.
 */
export async function revokeRoomApproval(
  actorUserId: string,
  actorEmail: string,
  roomId: string
): Promise<RoomView> {
  const store = getStore();
  const { room, me } = await roomForApprover(actorUserId, actorEmail, roomId);
  if (!["open", "satisfied", "changes_requested"].includes(room.status)) {
    throw new EngineError("invalid_state", `this room is ${room.status} — nothing to revoke.`);
  }
  if (me.decision !== "approved") {
    throw new EngineError("invalid_state", "you have no standing approval to revoke.");
  }
  const action = await store.getAction(room.user_id, room.action_id);
  if (action && action.status !== "proposed") {
    throw new EngineError(
      "invalid_state",
      "the card already left the approval stage — revocation is no longer possible."
    );
  }
  await store.updateRoomApprover(room.id, me.id, {
    decision: "pending",
    decided_plan_hash: null,
    decided_at: null,
    revoked_at: new Date().toISOString(),
    approver_user_id: actorUserId,
  });
  if (room.status === "satisfied") {
    await store.updateRoom(room.user_id, room.id, { status: "open" });
  }
  await store.logRoomEvent(room.id, room.user_id, actorEmail, "approval_revoked", {});
  await recordSecurityEvent(room.user_id, "room_approval_revoked", {
    detail: { room_id: room.id, action_id: room.action_id, by: actorEmail },
  });
  return getRoomView(room.user_id, room.id);
}

/** The owner closes the room (the plain approval door applies again). */
export async function cancelRoom(
  ownerId: string,
  ownerEmail: string,
  roomId: string
): Promise<RoomView> {
  const store = getStore();
  const room = await store.getRoom(ownerId, roomId);
  if (!room) throw new EngineError("not_found", "we couldn't find that room.");
  // The owner may close any non-cancelled room — including one a co-signer
  // rejected or one that expired — so they aren't locked out of their own
  // card. The rejection stays in the append-only event history; cancelling
  // just lets the owner start over (a fresh room, or plain solo approval).
  if (room.status === "cancelled") {
    throw new EngineError("invalid_state", "this room is already cancelled.");
  }
  await store.updateRoom(ownerId, room.id, { status: "cancelled" });
  await store.logRoomEvent(room.id, ownerId, ownerEmail, "cancelled", {});
  return getRoomView(ownerId, roomId);
}
