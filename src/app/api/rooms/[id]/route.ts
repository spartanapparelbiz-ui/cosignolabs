import { NextRequest, NextResponse } from "next/server";
import { ApiError, errorResponse, requireUser } from "@/lib/api";
import { getUserEmail } from "@/lib/auth";
import { enforceLimit } from "@/lib/ratelimit";
import { idParamSchema, parseStrict, readJsonBody, roomDecisionSchema } from "@/lib/schemas";
import { cancelRoom, decideRoom, getRoomView, revokeRoomApproval } from "@/lib/rooms";
import { getStore } from "@/lib/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Full view of a room the caller can see (owner path). */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const userId = await requireUser();
    const { id } = await params;
    if (!idParamSchema.safeParse(id).success) {
      throw new ApiError(400, "bad_id", "that room id isn't valid.");
    }
    // Owner view first; if not the owner, surface the approver's slice.
    const owned = await getStore().getRoom(userId, id);
    if (owned) {
      const view = await getRoomView(userId, id);
      return NextResponse.json({ room: view.room, approvers: view.approvers, events: view.events });
    }
    throw new ApiError(404, "not_found", "we couldn't find that room.");
  } catch (err) {
    return errorResponse(err);
  }
}

/**
 * A co-signer decides (approve / reject / request changes), or revokes their
 * standing approval. The actor is identified by their VERIFIED session email —
 * never by a body field — so nobody can decide as someone else.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const userId = await requireUser();
    const email = await getUserEmail();
    if (!email) throw new ApiError(403, "forbidden", "a verified email is required to co-sign.");
    await enforceLimit("transitionMinute", userId);
    const { id } = await params;
    if (!idParamSchema.safeParse(id).success) {
      throw new ApiError(400, "bad_id", "that room id isn't valid.");
    }
    const body = parseStrict(roomDecisionSchema, await readJsonBody(req), "room_decision");
    const view =
      body.decision === "approve"
        ? await decideRoom(userId, email, id, "approve", body.comment)
        : body.decision === "reject"
          ? await decideRoom(userId, email, id, "reject", body.comment)
          : await decideRoom(userId, email, id, "request_changes", body.comment);
    return NextResponse.json({ room: view.room, approvers: view.approvers, satisfied: view.satisfied });
  } catch (err) {
    return errorResponse(err);
  }
}

/** Owner cancels the room, or a co-signer revokes their approval (?revoke=1). */
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const userId = await requireUser();
    const email = await getUserEmail();
    if (!email) throw new ApiError(403, "forbidden", "a verified email is required.");
    await enforceLimit("transitionMinute", userId);
    const { id } = await params;
    if (!idParamSchema.safeParse(id).success) {
      throw new ApiError(400, "bad_id", "that room id isn't valid.");
    }
    const revoke = new URL(req.url).searchParams.get("revoke") === "1";
    const view = revoke
      ? await revokeRoomApproval(userId, email, id)
      : await cancelRoom(userId, email, id);
    return NextResponse.json({ room: view.room });
  } catch (err) {
    return errorResponse(err);
  }
}
