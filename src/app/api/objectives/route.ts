import { NextRequest, NextResponse } from "next/server";
import { errorResponse, requireUser } from "@/lib/api";
import { enforceLimit } from "@/lib/ratelimit";
import { objectiveSchema, parseStrict, readJsonBody } from "@/lib/schemas";
import { delegationMomentum, objectiveProgress } from "@/lib/objectives";
import { getStore, type ActionStatusRow } from "@/lib/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Objectives — outcomes the user owns over time, the layer above
 * Delegations. Progress is DERIVED from the real state of linked
 * delegations, never stored. GET lists objectives with their rolled-up
 * progress; POST creates one.
 */
export async function GET() {
  try {
    const userId = await requireUser();
    const store = getStore();
    const [objectives, sessions, links] = await Promise.all([
      store.listObjectives(userId),
      store.listSessions(userId),
      store.listObjectiveLinks(userId),
    ]);

    // Momentum only needs action STATUSES, and only for LINKED sessions —
    // a targeted projection instead of the newest 2000 full action rows.
    const linkedIds = [...new Set(links.map((l) => l.session_id))];
    const actions = await store.listActionStatusesForSessions(userId, linkedIds);

    const sessionById = new Map(sessions.map((s) => [s.id, s]));
    const actionsBySession = new Map<string, ActionStatusRow[]>();
    for (const a of actions) {
      const list = actionsBySession.get(a.session_id) ?? [];
      list.push(a);
      actionsBySession.set(a.session_id, list);
    }

    const withProgress = objectives.map((objective) => {
      const linked = links
        .filter((l) => l.objective_id === objective.id)
        .map((l) => sessionById.get(l.session_id))
        .filter((s): s is NonNullable<typeof s> => Boolean(s))
        .map((session) => ({
          session,
          momentum: delegationMomentum(actionsBySession.get(session.id) ?? []),
        }));
      return { objective, progress: objectiveProgress(linked) };
    });

    return NextResponse.json({ objectives: withProgress });
  } catch (err) {
    return errorResponse(err);
  }
}

export async function POST(req: NextRequest) {
  try {
    const userId = await requireUser();
    await enforceLimit("transitionMinute", userId);
    const body = parseStrict(objectiveSchema, await readJsonBody(req), "objective");
    const objective = await getStore().createObjective(userId, body.title, body.target_date ?? null);
    await getStore().logAudit(userId, "objective_created", { title: body.title });
    return NextResponse.json({ objective });
  } catch (err) {
    return errorResponse(err);
  }
}
