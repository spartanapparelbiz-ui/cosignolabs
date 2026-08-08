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

/** Vetoes read in full (for their reasons). Vetoes are a small slice of the window. */
const VETO_WINDOW = 40;

/** Statuses that mean the user said yes at the approval door. */
const APPROVED_STATUSES = new Set(["approved", "executing", "executed", "failed"]);

/**
 * The user's resolved decisions, newest first. Three narrow reads rather than
 * one wide one: action payloads and results are never transferred, and the
 * reason text is fetched only for the vetoes that actually have one.
 */
export async function observeDecisions(userId: string): Promise<Decision[]> {
  const store = getStore();
  const [heads, vetoed] = await Promise.all([
    store.listActionHeads(userId, DECISION_WINDOW),
    store.listActions(userId, { status: "vetoed", limit: VETO_WINDOW }),
  ]);

  const resolved = heads.filter(
    (h) => h.status === "vetoed" || APPROVED_STATUSES.has(h.status)
  );
  if (resolved.length === 0) return [];

  // Edits are only meaningful on cards the user went on to approve: an edited
  // card that was vetoed anyway is a veto, not a correction.
  const approvedIds = resolved
    .filter((h) => APPROVED_STATUSES.has(h.status))
    .map((h) => h.id);
  const corrected = new Set(await store.listUserEditedActionIds(userId, approvedIds));

  const reasons = new Map(vetoed.map((a) => [a.id, a.veto_reason]));

  return resolved.map((h) => ({
    id: h.id,
    category: h.category as ActionCategory,
    outcome:
      h.status === "vetoed" ? "vetoed" : corrected.has(h.id) ? "edited" : "approved",
    reason: h.status === "vetoed" ? (reasons.get(h.id) ?? null) : null,
    at: h.created_at,
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
