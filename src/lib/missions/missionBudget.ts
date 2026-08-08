import { getStore } from "../store";
import type { MissionRecord } from "../types";
import { budgetState, limitFor, type BudgetState } from "./budget";

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
  return budgetState(actions, limitFor(mission.action_budget, prefs?.action_budget));
}
