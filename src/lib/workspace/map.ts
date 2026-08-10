import type { ActionRecord, AutomationRecord, MissionRecord } from "../types";
import { RUNNING_STATES, WAITING_STATES, isToday } from "../home/model";
import { ageOf } from "../home/briefing";

/**
 * The execution map — every piece of work in the workspace, in one of four
 * lanes, with the bottleneck named.
 *
 * The lanes are the four states work can genuinely be in from the owner's
 * chair: moving on its own, stopped on you, standing (scheduled to recur),
 * and landed today. Everything else — leases, workers, queue depths — is
 * machinery, and machinery on this screen turns an owner into an SRE.
 *
 * The bottleneck is the map's whole reason to exist. Any list can show four
 * lanes; what an air-traffic picture adds is the ONE thing to do next: the
 * oldest decision, with how much work is stacked behind decisions in total.
 * That is computed, not judged — the oldest proposed action is a fact, and
 * "N missions are stopped" is a count of states.
 *
 * Pure and total; the caller supplies `now`.
 */

export interface MapMission {
  id: string;
  goal: string;
  state: string;
  /** "2 hours" — how long it has been in flight or stopped. */
  age: string;
}

export interface MapStanding {
  id: string;
  name: string;
  nextRunAt: string;
}

export interface Bottleneck {
  /** The oldest waiting decision. */
  actionId: string;
  summary: string;
  /** "2 days" */
  waitingFor: string;
  /** How many missions are stopped waiting on people (not just this card). */
  missionsStopped: number;
  /** Total decisions waiting. */
  decisionsWaiting: number;
}

export interface ExecutionMap {
  moving: MapMission[];
  stopped: MapMission[];
  standing: MapStanding[];
  landedToday: MapMission[];
  bottleneck: Bottleneck | null;
}

function toMapMission(m: MissionRecord, now: Date): MapMission {
  return {
    id: m.id,
    goal: m.goal,
    state: m.state,
    age: ageOf(m.updated_at, now),
  };
}

export function buildExecutionMap(
  missions: MissionRecord[],
  approvals: ActionRecord[],
  automations: AutomationRecord[],
  now = new Date()
): ExecutionMap {
  const moving = missions
    .filter((m) => RUNNING_STATES.has(m.state))
    .map((m) => toMapMission(m, now));

  const stopped = missions
    .filter((m) => WAITING_STATES.has(m.state))
    .map((m) => toMapMission(m, now));

  const landedToday = missions
    .filter(
      (m) =>
        (m.state === "completed" || m.state === "partial") &&
        isToday(m.completed_at ?? m.updated_at, now)
    )
    .map((m) => toMapMission(m, now));

  const standing = automations
    .filter((a) => a.enabled)
    .sort((a, b) => Date.parse(a.next_run_at) - Date.parse(b.next_run_at))
    .map((a) => ({ id: a.id, name: a.name, nextRunAt: a.next_run_at }));

  // The bottleneck: the oldest thing waiting on a person. Oldest, not
  // riskiest or biggest — age is the one dimension that only ever gets worse
  // by itself, and it needs no judgment call to rank.
  const waiting = approvals
    .filter((a) => a.status === "proposed")
    .sort((a, b) => Date.parse(a.created_at) - Date.parse(b.created_at));

  const bottleneck: Bottleneck | null = waiting.length
    ? {
        actionId: waiting[0].id,
        summary: waiting[0].summary,
        waitingFor: ageOf(waiting[0].created_at, now),
        missionsStopped: stopped.length,
        decisionsWaiting: waiting.length,
      }
    : null;

  return { moving, stopped, standing, landedToday, bottleneck };
}

/**
 * The map's headline. One sentence, and it is about the reader's next move,
 * not about the system: a map that opens with "3 running, 2 stopped, 4
 * scheduled" describes; this one directs.
 */
export function mapHeadline(map: ExecutionMap): string {
  if (map.bottleneck) {
    const { decisionsWaiting, missionsStopped } = map.bottleneck;
    const decisions = `${decisionsWaiting} decision${decisionsWaiting === 1 ? "" : "s"}`;
    if (missionsStopped > 0) {
      return `${decisions} waiting — ${missionsStopped} mission${missionsStopped === 1 ? " is" : "s are"} stopped behind ${decisionsWaiting === 1 ? "it" : "them"}.`;
    }
    return `${decisions} waiting on you.`;
  }
  if (map.moving.length > 0) {
    return `${map.moving.length} mission${map.moving.length === 1 ? "" : "s"} moving — nothing needs you.`;
  }
  if (map.standing.length > 0) {
    return "nothing in flight — your standing work runs on schedule.";
  }
  return "nothing in flight.";
}
