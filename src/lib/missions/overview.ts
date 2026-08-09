import { getStore } from "../store";
import type { MissionRecord, MissionStepRecord } from "../types";

/**
 * The dashboard's mission overview: the mission list plus live steps for the
 * active missions it actually shows. One loader shared by GET /api/missions
 * (?include=steps) and the server-rendered /app page, so both surfaces stay
 * in lockstep and the steps always load in parallel.
 */

/** Mission states whose steps the dashboard shows live. */
export const DASHBOARD_STEP_STATES = new Set([
  "queued",
  "running",
  "awaiting_input",
  "awaiting_approval",
  "retrying",
  "verifying",
  "paused",
  "blocked",
]);

/**
 * How many active missions the dashboard details at once.
 *
 * This has to be at least as many as home actually renders, or the page shows
 * two cards side by side where one has a live line and a progress bar and the
 * other has neither — for no reason the reader can see, since both missions
 * are equally alive. Home caps its sections at three waiting plus four
 * working, so eight covers every card it can put on screen with one left
 * over.
 */
const DASHBOARD_ACTIVE_LIMIT = 8;

export interface MissionOverview {
  missions: MissionRecord[];
  steps: Record<string, MissionStepRecord[]>;
}

export async function loadMissionOverview(
  userId: string,
  limit = 25
): Promise<MissionOverview> {
  const store = getStore();
  const missions = await store.listMissions(userId, limit);
  const active = missions
    .filter((m) => DASHBOARD_STEP_STATES.has(m.state))
    .slice(0, DASHBOARD_ACTIVE_LIMIT);
  const stepLists = await Promise.all(
    active.map((m) => store.listMissionSteps(userId, m.id).catch(() => []))
  );
  return {
    missions,
    steps: Object.fromEntries(active.map((m, i) => [m.id, stepLists[i]])),
  };
}
