import { NextRequest, NextResponse } from "next/server";
import { ApiError, errorResponse, requireUser } from "@/lib/api";
import { enforceLimit } from "@/lib/ratelimit";
import { idParamSchema, objectivePatchSchema, parseStrict, readJsonBody } from "@/lib/schemas";
import { delegationMomentum, objectiveProgress } from "@/lib/objectives";
import { getStore, type ActionStatusRow } from "@/lib/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

/** One objective + its linked delegations (with each one's momentum) + progress. */
export async function GET(_req: NextRequest, { params }: Params) {
  try {
    const userId = await requireUser();
    const id = parseStrict(idParamSchema, (await params).id, "objective_id");
    const store = getStore();
    const objective = await store.getObjective(userId, id);
    if (!objective) throw new ApiError(404, "not_found", "we couldn't find that objective.");

    const [sessions, links] = await Promise.all([
      store.listSessions(userId),
      store.listObjectiveLinks(userId, id),
    ]);
    // Statuses for the linked sessions only — never a whole-account scan.
    const actions = await store.listActionStatusesForSessions(
      userId,
      [...new Set(links.map((l) => l.session_id))]
    );
    const sessionById = new Map(sessions.map((s) => [s.id, s]));
    const actionsBySession = new Map<string, ActionStatusRow[]>();
    for (const a of actions) {
      const list = actionsBySession.get(a.session_id) ?? [];
      list.push(a);
      actionsBySession.set(a.session_id, list);
    }

    const delegations = links
      .map((l) => sessionById.get(l.session_id))
      .filter((s): s is NonNullable<typeof s> => Boolean(s))
      .map((session) => ({
        session,
        momentum: delegationMomentum(actionsBySession.get(session.id) ?? []),
      }));

    return NextResponse.json({
      objective,
      delegations,
      progress: objectiveProgress(delegations),
    });
  } catch (err) {
    return errorResponse(err);
  }
}

/** Edit title / target / status (e.g. mark achieved or archived). */
export async function PATCH(req: NextRequest, { params }: Params) {
  try {
    const userId = await requireUser();
    await enforceLimit("transitionMinute", userId);
    const id = parseStrict(idParamSchema, (await params).id, "objective_id");
    const body = parseStrict(objectivePatchSchema, await readJsonBody(req), "objective_patch");
    const objective = await getStore().updateObjective(userId, id, body);
    if (!objective) throw new ApiError(404, "not_found", "we couldn't find that objective.");
    return NextResponse.json({ objective });
  } catch (err) {
    return errorResponse(err);
  }
}

export async function DELETE(_req: NextRequest, { params }: Params) {
  try {
    const userId = await requireUser();
    await enforceLimit("transitionMinute", userId);
    const id = parseStrict(idParamSchema, (await params).id, "objective_id");
    await getStore().deleteObjective(userId, id);
    await getStore().logAudit(userId, "objective_deleted", { id });
    return NextResponse.json({ ok: true });
  } catch (err) {
    return errorResponse(err);
  }
}
