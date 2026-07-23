import { NextRequest, NextResponse } from "next/server";
import { ApiError, errorResponse, requireUser } from "@/lib/api";
import { idParamSchema } from "@/lib/schemas";
import { getStore } from "@/lib/store";
import { buildCosignCard } from "@/lib/cosignCard";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * The structured CoSign Card for one action the caller owns, plus any CoSign
 * Room gating it. Read-only projection — approval still flows through
 * /api/actions/[id]/approve. Ownership is enforced by the userId-scoped read.
 */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const userId = await requireUser();
    const { id } = await params;
    if (!idParamSchema.safeParse(id).success) {
      throw new ApiError(400, "bad_id", "that action id isn't valid.");
    }
    const store = getStore();
    const action = await store.getAction(userId, id);
    if (!action) throw new ApiError(404, "not_found", "we couldn't find that card.");

    // Attach the mission goal when the card belongs to a mission step.
    let missionGoal: string | undefined;
    const room = await store.getRoomByAction(userId, id);

    const card = buildCosignCard(action, missionGoal);

    let roomView = null;
    if (room) {
      const approvers = await store.listRoomApprovers(room.id);
      roomView = {
        id: room.id,
        name: room.name,
        status: room.status,
        require_all: room.require_all,
        ordered: room.ordered,
        expires_at: room.expires_at,
        plan_hash: room.plan_hash,
        plan_current: room.plan_hash === card.plan_hash,
        approvers: approvers.map((a) => ({
          email: a.approver_email,
          position: a.position,
          decision: a.decision,
          decided_at: a.decided_at,
          comment: a.comment,
        })),
      };
    }

    return NextResponse.json({ card, room: roomView });
  } catch (err) {
    return errorResponse(err);
  }
}
