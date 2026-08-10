import { getStore } from "../store";
import { toView } from "../integrations/runtime/connections";
import { loadMissionOverview, type MissionOverview } from "../missions/overview";
import { getUserPlan } from "../billing";
import {
  feedLines,
  homeApps,
  homeMission,
  operatorStatus,
  suggestionsFor,
  todayTiles,
  RUNNING_STATES,
  WAITING_STATES,
  type HomeModel,
} from "./model";

/**
 * Everything home needs, in one wave.
 *
 * Home used to open five requests from the browser after hydration — missions,
 * approvals, automations, connections, usage — which meant the most-read
 * screen in the product spent its first second showing skeletons of data the
 * server already had. This loader runs them in parallel on the server, so the
 * page's FIRST PAINT is real work rather than a loading state, and the same
 * function backs GET /api/home for the background revalidate.
 *
 * Every leg is independently fault-tolerant. A connector listing that fails
 * must not blank the missions someone came here to read, so each promise
 * falls back to its empty value and the page renders whatever is true.
 */
export async function loadHome(userId: string): Promise<HomeModel> {
  const store = getStore();

  const [overview, approvals, connections, automations, files, hold, plan, recent] =
    await Promise.all([
      loadMissionOverview(userId).catch(
        (): MissionOverview => ({ missions: [], steps: {} })
      ),
      store.listActions(userId, { status: "proposed", limit: 20 }).catch(() => []),
      store.listConnections(userId).catch(() => []),
      store.listAutomations(userId).catch(() => []),
      store.listFiles(userId).catch(() => []),
      store.getHold(userId).catch(() => null),
      getUserPlan(userId).catch(() => null),
      store.listActions(userId, { limit: 30 }).catch(() => []),
    ]);

  const { missions, steps } = overview;
  const held = Boolean(hold && hold.scope !== "none");
  const usage = plan ? await store.getUsage(userId).catch(() => null) : null;

  // Only the missions actually in flight get the detailed treatment; the rest
  // are one line each on their own page. Waiting missions lead — a mission
  // stopped on a person is the one costing something by sitting there.
  const live = missions
    .filter((m) => RUNNING_STATES.has(m.state) || WAITING_STATES.has(m.state))
    .sort((a, b) => Number(WAITING_STATES.has(b.state)) - Number(WAITING_STATES.has(a.state)))
    .slice(0, 4);

  const views = connections.map(toView);

  return {
    status: operatorStatus(missions, approvals.length, held),
    tiles: todayTiles({
      missions,
      approvals: approvals.length,
      connections: views,
      automations,
      files: files.length,
    }),
    missions: live.map((m) => homeMission(m, steps[m.id] ?? [])),
    apps: homeApps(views),
    suggestions: suggestionsFor(views),
    feed: feedLines(recent, missions),
    approvalsCount: approvals.length,
    opsThisCycle: Number(usage?.actions_executed) || 0,
  };
}
