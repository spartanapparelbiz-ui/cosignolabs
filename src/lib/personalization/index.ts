import { getStore } from "../store";
import {
  derivePreferences,
  preferencesPrompt,
  type LearnedPreference,
} from "./preferences";

/**
 * The server side of personalization: gather what the user has actually done,
 * derive what that implies, and hand it to the planner.
 *
 * The master switch is the SAME one that governs memory (`memory_enabled`).
 * Two separate controls — one for "remember things" and one for "learn from
 * my decisions" — would be a distinction only the people who built it can
 * explain, and the honest reading of "don't remember me" covers both.
 *
 * Bounded on purpose: recent history only. A veto from eight months ago is
 * not a preference, it is a fossil, and letting old evidence accumulate makes
 * the profile impossible to change by behaving differently — the single most
 * frustrating property a personalized system can have.
 */

const RECENT_ACTIONS = 200;
const RECENT_MISSIONS = 40;
const RECENT_COMMANDS = 60;

/** Everything cosigno has learned about this user. Empty when learning is off. */
export async function learnedPreferences(userId: string): Promise<LearnedPreference[]> {
  try {
    const store = getStore();
    const prefs = await store.getPrefs(userId);
    if (!prefs.memory_enabled) return [];

    const [actions, missions, sessions] = await Promise.all([
      store.listActions(userId, { limit: RECENT_ACTIONS }),
      store.listMissions(userId, RECENT_MISSIONS),
      // A session's title IS the command that opened it — the closest thing
      // to "what this person types" without reading every thread.
      store.listSessions(userId),
    ]);

    return derivePreferences({
      actions,
      missions,
      commands: sessions.slice(0, RECENT_COMMANDS).map((s) => s.title),
    });
  } catch {
    // Personalization is additive. A failure here must never block planning
    // or break a page — it just means cosigno behaves like it's day one.
    return [];
  }
}

/**
 * The learned preferences as planner context, or "" when there is nothing to
 * say. The planner prompt skips the whole section on an empty string rather
 * than describing an empty profile.
 */
export async function personalizationSummary(userId: string): Promise<string> {
  return preferencesPrompt(await learnedPreferences(userId));
}

export type { LearnedPreference };
