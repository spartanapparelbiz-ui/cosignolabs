import { CATEGORIES, type ActionCategory, type ActionRecord } from "../types";

/**
 * The action budget: how many things cosigno may CHANGE in the world before it
 * stops and checks in with you.
 *
 * The product used to show "budget cap · $2.00", which is not a thing anyone
 * running a business has an opinion about. It wasn't even really dollars — the
 * engine divides that number by five to get a tool-call ceiling. So it asked
 * someone to reason about cosigno's hosting costs in order to answer a
 * question about their own work.
 *
 * "Cosigno may take up to 25 actions, then it stops" is a sentence a person
 * can hold in their head and check against reality afterwards. Cost stays
 * where it belongs: internal.
 */

/**
 * A category spends budget when it changes something OUTSIDE cosigno.
 *
 * Reading, searching and drafting are free, and that is the important half of
 * the design. A budget that ticked down while cosigno read your inbox would
 * push people to set it high just to avoid being interrupted mid-research —
 * which would make the number stop meaning anything at exactly the moment it
 * mattered. Free reading is what lets the limit be low enough to be real.
 */
export function isExternalChange(category: ActionCategory): boolean {
  return !FREE.has(category);
}

const FREE = new Set<ActionCategory>(["search", "summarize", "draft"]);

/** The default a workspace starts with, before anyone changes it. */
export const DEFAULT_ACTION_BUDGET = 25;

/**
 * No limit at all, stored as 0.
 *
 * A column can't hold Infinity, and a sentinel like -1 reads as a bug to
 * anyone looking at the row. Zero is the honest encoding: "zero restriction".
 * It becomes Infinity the moment it's read, so nothing downstream has to
 * remember the convention.
 */
export const UNLIMITED = 0;

/** What the workspace default may be set to. */
export const BUDGET_CHOICES = [25, 50, 100, 250, UNLIMITED] as const;

/** How much more you can grant when a mission runs out, without starting over. */
export const INCREASE_STEPS = [10, 25, 100] as const;

/**
 * The most a single mission may be allowed. Sized for the plans this is meant
 * to grow into (a several-thousand-action tier) rather than for today, so the
 * ceiling never becomes the reason a plan can't be sold.
 */
export const MAX_ACTION_BUDGET = 10_000;

/** Clamp anything arriving from outside into a budget the engine will honor. */
export function clampBudget(value: number): number {
  if (!Number.isFinite(value)) return DEFAULT_ACTION_BUDGET;
  if (value <= 0) return UNLIMITED;
  return Math.min(MAX_ACTION_BUDGET, Math.floor(value));
}

/** The in-memory limit: a real number, or Infinity when there is no limit. */
export function effectiveLimit(stored: number): number {
  return stored === UNLIMITED ? Infinity : stored;
}

/**
 * The limit a mission runs under. A mission with no budget of its own follows
 * the workspace default, so raising the default lifts every mission that never
 * chose otherwise — rather than leaving old missions pinned to a number the
 * user has since changed their mind about.
 */
export function limitFor(
  missionBudget: number | null | undefined,
  workspaceDefault: number | null | undefined
): number {
  if (typeof missionBudget === "number") return effectiveLimit(clampBudget(missionBudget));
  if (typeof workspaceDefault === "number") return effectiveLimit(clampBudget(workspaceDefault));
  return DEFAULT_ACTION_BUDGET;
}

export interface BudgetState {
  /** Changes that have actually happened. This is the number people are shown. */
  used: number;
  /**
   * Changes that have happened OR are waiting on your signature. This is the
   * number the engine gates on: a card sitting in the approvals queue is
   * already spoken for, and letting the mission carry on proposing past the
   * limit would mean approving them all took you over it.
   */
  committed: number;
  /** The ceiling. `Infinity` when there isn't one. */
  limit: number;
  remaining: number;
  /** No ceiling at all — the counter still runs, nothing ever stops. */
  unlimited: boolean;
  /** True when cosigno may not start another change without more budget. */
  exhausted: boolean;
  /** Distinct kinds of change spent so far, for the receipt. */
  kinds: string[];
  /** How many of the changes you personally approved. */
  approvals: number;
}

/** In flight: proposed or approved but not yet executed. Not yet a change. */
const PENDING = new Set(["proposed", "approved", "executing"]);

/**
 * What a mission has spent so far.
 *
 * A vetoed or failed action costs nothing — it never changed anything, and
 * charging for it would mean declining cosigno's suggestions used up the
 * allowance you were declining them to protect.
 */
export function budgetState(actions: ActionRecord[], limit: number): BudgetState {
  const external = actions.filter((a) => isExternalChange(a.category));
  const done = external.filter((a) => a.status === "executed");
  const pending = external.filter((a) => PENDING.has(a.status));
  const committed = done.length + pending.length;
  const kinds = [...new Set(done.map((a) => CATEGORIES[a.category]?.label ?? a.category))];
  const unlimited = !Number.isFinite(limit);
  return {
    used: done.length,
    committed,
    limit,
    remaining: unlimited ? Infinity : Math.max(0, limit - committed),
    unlimited,
    // An unlimited mission never runs out — the counter is a fact about what
    // happened, not a gate.
    exhausted: !unlimited && committed >= limit,
    kinds,
    approvals: done.filter((a) => a.tier > 1).length,
  };
}

/** The counter, in words. Shown live while a mission runs. */
export function budgetSentence(state: BudgetState): string {
  if (state.unlimited) {
    return state.used === 0 ? "no action limit" : `${state.used} actions used · no limit`;
  }
  if (state.used === 0) return `0 of ${state.limit} actions used`;
  return `${state.used} of ${state.limit} actions used`;
}

/** Why a mission stopped, when it stopped for this reason. */
export function pausedReason(state: BudgetState): string {
  return `this mission reached its execution limit — ${state.used} of ${state.limit} action${state.limit === 1 ? "" : "s"} used. it stopped here rather than continuing.`;
}
