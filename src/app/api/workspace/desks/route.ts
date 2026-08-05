import { NextResponse } from "next/server";
import { errorResponse, requireUser } from "@/lib/api";
import { getStore } from "@/lib/store";
import { buildDesks, roomSummary } from "@/lib/workspaceDesks";
import type { MissionStepRecord } from "@/lib/types";

/**
 * GET /api/workspace/desks — the glass wall.
 *
 * One desk per connected app: who's working there, what they're doing right
 * now, what's waiting on a human, and what finished recently. Assembled from
 * things that actually happened — live mission steps, proposed actions, the
 * activity ledger, and each connection's own health.
 *
 * Read-only. A desk never claims work that isn't running.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const userId = await requireUser();
    const store = getStore();

    const [connections, missions, proposed, recent] = await Promise.all([
      store.listConnections(userId).catch(() => []),
      store.listMissions(userId, 10).catch(() => []),
      store.listActions(userId, { status: "proposed", limit: 50 }).catch(() => []),
      store.listActions(userId, { status: "executed", limit: 40 }).catch(() => []),
    ]);

    const steps: MissionStepRecord[] = (
      await Promise.all(missions.map((m) => store.listMissionSteps(userId, m.id).catch(() => [])))
    ).flat();

    const desks = buildDesks({
      connections: connections.map((c) => ({
        id: c.id,
        provider_key: c.provider_key,
        display_name: c.display_name,
        status: c.status,
        kind: c.kind,
      })),
      steps,
      proposed,
      recent,
    });

    return NextResponse.json(
      { desks, summary: roomSummary(desks) },
      { headers: { "cache-control": "no-store" } }
    );
  } catch (err) {
    return errorResponse(err);
  }
}
