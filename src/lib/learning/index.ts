import { getStore } from "../store";
import type { ActionCategory } from "../types";
import {
  derivePreferences,
  renderPreferences,
  type Decision,
  type LearnedPreference,
} from "./preferences";

export {
  derivePreferences,
  renderPreferences,
  sanitizeReason,
  MAX_PREFERENCES,
  THRESHOLDS,
  type Decision,
  type LearnedKind,
  type LearnedPreference,
} from "./preferences";

/**
 * Reading the user's decision history and turning it into preferences the
 * planner can use.
 *
 * Deliberately stateless: there is no learned-preferences table and nothing is
 * written when a card resolves. The verdict is recomputed from the recent
 * decision window every time it is needed, which buys three things that a
 * stored verdict cannot:
 *
 *  - it cannot go stale, and it cannot survive the behaviour that created it;
 *  - deleting the underlying actions deletes what was learned from them, with
 *    no second copy to hunt down;
 *  - the number the user is shown ("4 of the last 6") is recounted at read
 *    time, so it is true when they read it rather than true when it was cached.
 *
 * The only thing persisted is the user's own mute list.
 */

/**
 * Decisions considered. Long enough to see a habit (the thresholds need three
 * or four), short enough to forget one — and short enough that the edit lookup
 * below stays a single database round trip on the planner's path.
 */
const DECISION_WINDOW = 100;

/**
 * The user's decided cards, newest first. Two narrow reads: the decision
 * projection (no payloads, no results, pending cards excluded by the query so
 * they can't shrink the window), then ids-only for which of those the user
 * edited.
 */
export async function observeDecisions(userId: string): Promise<Decision[]> {
  const store = getStore();
  const decided = await store.listDecisionHeads(userId, DECISION_WINDOW);
  if (decided.length === 0) return [];

  // Edits only count on cards the user went on to approve: a card they edited
  // and then vetoed anyway is a veto, not a correction.
  const approvedIds = decided.filter((d) => d.status !== "vetoed").map((d) => d.id);
  const corrected = new Set(await store.listUserEditedActionIds(userId, approvedIds));

  return decided.map((d) => ({
    id: d.id,
    category: d.category as ActionCategory,
    outcome:
      d.status === "vetoed" ? "vetoed" : corrected.has(d.id) ? "edited" : "approved",
    reason: d.status === "vetoed" ? d.veto_reason : null,
    // When the user decided. `resolved_at` is only stamped on terminal states,
    // so an approved-but-not-yet-executed card falls back to when it was put
    // in front of them — the closest true thing available.
    at: d.resolved_at ?? d.created_at,
  }));
}

/**
 * The preferences in force for this user right now.
 *
 * Gated by the same master switch that governs saved notes. That switch is
 * the user's statement that cosigno should not carry context between sessions,
 * and a preference inferred from their behaviour is exactly the kind of
 * context they were turning off — honouring the switch for hand-written notes
 * while quietly keeping the inferred ones would make the control a lie.
 */
export async function learnedPreferences(userId: string): Promise<LearnedPreference[]> {
  const store = getStore();
  const prefs = await store.getPrefs(userId);
  if (!prefs.memory_enabled) return [];

  const muted = new Set(prefs.muted_preferences ?? []);
  const decisions = await observeDecisions(userId);
  return derivePreferences(decisions).filter((p) => !muted.has(p.key));
}

/**
 * The planner-facing section. Returns "" whenever nothing has been learned —
 * the caller drops the section entirely rather than telling the operator that
 * it knows nothing, which reads as an instruction to guess.
 *
 * Additive by contract: a failure here degrades cosigno to the operator it was
 * before this module existed, and never blocks a command.
 */
export async function learnedSummary(userId: string): Promise<string> {
  try {
    const preferences = await learnedPreferences(userId);
    return preferences.length === 0 ? "" : renderPreferences(preferences);
  } catch {
    return "";
  }
}
