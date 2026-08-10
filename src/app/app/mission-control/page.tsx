import { ExecutionMap } from "@/components/app/ExecutionMap";
import { MissionControl } from "@/components/app/MissionControl";
import { getUserId } from "@/lib/auth";
import { servingAllowed } from "@/lib/env";
import { getStore } from "@/lib/store";
import { buildExecutionMap, type ExecutionMap as MapData } from "@/lib/workspace/map";

export const dynamic = "force-dynamic";

export const metadata = { title: "live work" };

/**
 * Live work, in two altitudes.
 *
 * The map (server-rendered, above) answers the wide question: where is
 * everything, and what is the one thing to do next — the oldest waiting
 * decision leads, with the work stacked behind it counted. Mission Control
 * (below, live-polling) answers the close one: what is cosigno doing this
 * second. The split keeps each view honest — the map ranks, the control
 * room streams, and neither pretends to do the other's job.
 */
export default async function MissionControlPage() {
  let map: MapData | null = null;
  let now = new Date();
  try {
    if (servingAllowed()) {
      const userId = await getUserId();
      if (userId) {
        const store = getStore();
        const [missions, approvals, automations] = await Promise.all([
          store.listMissions(userId, 50).catch(() => []),
          store.listActions(userId, { status: "proposed", limit: 100 }).catch(() => []),
          store.listAutomations(userId).catch(() => []),
        ]);
        now = new Date();
        map = buildExecutionMap(missions, approvals, automations, now);
      }
    }
  } catch {
    // The map is additive; Mission Control below works without it.
  }

  return (
    <>
      {map && (
        <div className="mx-auto w-full max-w-5xl px-6 pt-10 lg:px-10">
          <ExecutionMap map={map} now={now} />
        </div>
      )}
      <MissionControl />
    </>
  );
}
