import { isOwner } from "../owner";
import { getStore } from "../store";
import type { MissionRecord } from "../types";
import { budgetState, effectiveLimit, limitFor, UNLIMITED, type BudgetState } from "./budget";

/**
 * A mission's live position against its limit — the server half of the action
 * budget.
 *
 * It lives apart from the pure model in budget.ts so the browser can import
 * the numbers, the labels and the sentences without dragging the whole
 * storage layer into the client bundle.
 *
 * Every mission gets its own session, so the session's actions ARE the
 * mission's actions — the count is derived rather than kept in a counter that
 * could drift from what actually happened.
 */
export async function missionBudget(
  userId: string,
  mission: MissionRecord
): Promise<BudgetState> {
  const store = getStore();
  const [prefs, actions] = await Promise.all([
    store.getPrefs(userId).catch(() => null),
    store.listActions(userId, { session_id: mission.session_id }),
  ]);
  // ─── OWNER OVERRIDE ──────────────────────────────────────────────────────
  // The action budget is the one mission limit that can stop work in flight,
  // so "unlimited missions" is enforced here: an owner's mission runs with no
  // ceiling regardless of what the mission or the workspace default asked for.
  //
  // The counter still runs. budgetState() keeps reporting what was spent — it
  // simply never reaches a limit — so an owner's receipt stays as honest and
  // as auditable as everybody else's. An override that also stopped counting
  // would be the kind that hides its own cost.
  const limit = isOwner(userId)
    ? effectiveLimit(UNLIMITED)
    : limitFor(mission.action_budget, prefs?.action_budget);
  return budgetState(actions, limit);
}
