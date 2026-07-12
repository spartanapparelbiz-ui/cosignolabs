import { getStore } from "./store";

/**
 * User-controlled memory → planner context. Only ENABLED memories are used,
 * only when the master switch is on, bounded (12 notes × 300 chars) so a
 * pathological memory set can't blow up the prompt. Returns "" whenever
 * memory shouldn't apply — the caller just skips the section.
 */
const MAX_MEMORIES = 12;

export async function memorySummary(userId: string): Promise<string> {
  try {
    const store = getStore();
    const prefs = await store.getPrefs(userId);
    if (!prefs.memory_enabled) return "";
    const memories = await store.listMemories(userId);
    const active = memories.filter((m) => m.enabled).slice(0, MAX_MEMORIES);
    if (active.length === 0) return "";
    return active.map((m) => `- ${m.content}`).join("\n");
  } catch {
    return ""; // memory is additive — a failure never blocks planning
  }
}
