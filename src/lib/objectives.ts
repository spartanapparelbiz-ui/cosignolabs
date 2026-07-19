import { momentumOf, MOMENTUM_LABEL, type Momentum } from "./state";
import type { ActionRecord, MissionRecord, ObjectiveRecord, SessionRecord } from "./types";

/**
 * Objectives — outcomes owned over time. All progress is DERIVED from the
 * real state of linked delegations (sessions + their actions), never stored
 * or invented. Pure functions so the API is a thin loader and the logic is
 * fully testable.
 */

/**
 * A delegation's momentum, from what its actions actually did — the same
 * reading the delegations list uses. A mission record (durable engine) wins
 * when present; otherwise it's inferred from action statuses.
 */
export function delegationMomentum(
  actions: Pick<ActionRecord, "status">[],
  mission?: Pick<MissionRecord, "state"> | null
): Momentum {
  if (mission) return momentumOf(mission);
  if (actions.some((a) => a.status === "proposed")) return "needs_you";
  if (actions.length === 0) return "moving";
  if (actions.some((a) => a.status === "failed")) return "blocked";
  return "complete";
}

export interface ObjectiveDelegation {
  session: SessionRecord;
  momentum: Momentum;
}

export interface ObjectiveProgress {
  total: number;
  complete: number;
  moving: number;
  needs_you: number;
  blocked: number;
  /** 0..1 — share of linked delegations that are complete. */
  fraction: number;
  /** The objective's overall momentum, rolled up from its delegations. */
  momentum: Momentum;
  /** One plain sentence: what can happen next toward this outcome. */
  next: string;
}

export function objectiveProgress(delegations: ObjectiveDelegation[]): ObjectiveProgress {
  const total = delegations.length;
  const count = (m: Momentum) => delegations.filter((d) => d.momentum === m).length;
  const complete = count("complete");
  const needs_you = count("needs_you");
  const blocked = count("blocked");
  const moving = count("moving") + count("waiting");

  // Roll-up momentum: your attention first, then blockers, then motion.
  let momentum: Momentum;
  if (total === 0) momentum = "moving";
  else if (needs_you > 0) momentum = "needs_you";
  else if (blocked > 0) momentum = "blocked";
  else if (complete === total) momentum = "complete";
  else momentum = "moving";

  let next: string;
  if (total === 0) next = "Link delegations to this objective, or delegate the first piece.";
  else if (needs_you > 0)
    next = `${needs_you} delegation${needs_you === 1 ? "" : "s"} ${needs_you === 1 ? "is" : "are"} at your boundary — clear ${needs_you === 1 ? "it" : "them"} to keep moving.`;
  else if (blocked > 0)
    next = `${blocked} delegation${blocked === 1 ? "" : "s"} ${blocked === 1 ? "is" : "are"} blocked — cosigno will resume when unblocked.`;
  else if (complete === total) next = "Every linked delegation is complete. This outcome is achieved.";
  else next = "Cosigno is moving the remaining delegations forward. Nothing needs you.";

  return {
    total,
    complete,
    moving,
    needs_you,
    blocked,
    fraction: total === 0 ? 0 : complete / total,
    momentum,
    next,
  };
}

export function objectiveMomentumLabel(m: Momentum): string {
  return MOMENTUM_LABEL[m];
}

/** Days until a target date (negative = past). Null when no target. */
export function daysUntil(target: string | null, now = new Date()): number | null {
  if (!target) return null;
  const day = new Date(`${target}T00:00:00Z`).getTime();
  const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  return Math.round((day - today) / 86_400_000);
}

/** A short, honest due-line for an objective's target date. */
export function targetLine(objective: Pick<ObjectiveRecord, "target_date">, now = new Date()): string | null {
  const d = daysUntil(objective.target_date, now);
  if (d === null) return null;
  if (d < 0) return `${Math.abs(d)} day${Math.abs(d) === 1 ? "" : "s"} past target`;
  if (d === 0) return "target is today";
  if (d === 1) return "target is tomorrow";
  return `${d} days to target`;
}
