import { NextRequest, NextResponse } from "next/server";
import { ApiError, errorResponse, requireUser } from "@/lib/api";
import { delegationBrief } from "@/lib/continue";
import { idParamSchema, parseStrict } from "@/lib/schemas";
import { getStore } from "@/lib/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

/**
 * Brief Me / Why Is This Waiting — a deterministic read of one delegation's
 * real state (its actions + any objective it's linked to). No model call, no
 * invented progress: every line maps to an actual action status.
 */
export async function GET(_req: NextRequest, { params }: Params) {
  try {
    const userId = await requireUser();
    const id = parseStrict(idParamSchema, (await params).id, "session_id");
    const store = getStore();
    const session = await store.getSession(userId, id);
    if (!session) throw new ApiError(404, "not_found", "we couldn't find that delegation.");

    const [actions, links] = await Promise.all([
      store.listActions(userId, { session_id: id, limit: 500 }),
      store.listObjectiveLinks(userId),
    ]);

    // If this delegation contributes to an objective, name it in the brief.
    let objectiveTitle: string | null = null;
    const link = links.find((l) => l.session_id === id);
    if (link) {
      const objective = await store.getObjective(userId, link.objective_id);
      objectiveTitle = objective?.title ?? null;
    }

    return NextResponse.json({ brief: delegationBrief(session, actions, objectiveTitle) });
  } catch (err) {
    return errorResponse(err);
  }
}
