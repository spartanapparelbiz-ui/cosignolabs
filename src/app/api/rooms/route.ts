import { NextRequest, NextResponse } from "next/server";
import { errorResponse, requireUser } from "@/lib/api";
import { getUserEmail } from "@/lib/auth";
import { ApiError } from "@/lib/api";
import { enforceLimit } from "@/lib/ratelimit";
import { parseStrict, readJsonBody, roomCreateSchema } from "@/lib/schemas";
import { createRoomForAction, roomsAwaitingUser } from "@/lib/rooms";
import { getStore } from "@/lib/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * CoSign Rooms. GET returns rooms the caller OWNS plus rooms where the caller
 * is a co-signer still owing a decision. POST opens a room over one of the
 * caller's own proposed cards, with co-signers drawn from their workspace.
 */
export async function GET() {
  try {
    const userId = await requireUser();
    const email = await getUserEmail();
    const store = getStore();
    const owned = await store.listRooms(userId, 50);
    const awaiting = email ? await roomsAwaitingUser(email) : [];
    return NextResponse.json({
      owned,
      awaiting: awaiting.map((a) => ({
        room: a.room,
        summary: a.action?.summary ?? "a prepared action",
        goal: a.action?.summary ?? null,
      })),
    });
  } catch (err) {
    return errorResponse(err);
  }
}

export async function POST(req: NextRequest) {
  try {
    const userId = await requireUser();
    const email = await getUserEmail();
    if (!email) throw new ApiError(403, "forbidden", "a verified email is required to open a room.");
    await enforceLimit("transitionMinute", userId);
    const body = parseStrict(roomCreateSchema, await readJsonBody(req), "room_create");
    const view = await createRoomForAction(userId, email, body.actionId, {
      name: body.name,
      approverEmails: body.approvers,
      requireAll: body.requireAll,
      ordered: body.ordered,
      expiresInHours: body.expiresInHours,
    });
    return NextResponse.json({ room: view.room, approvers: view.approvers });
  } catch (err) {
    return errorResponse(err);
  }
}
