import { getStore } from "../store";
import type { MissionRecord, MissionStepRecord } from "../types";

/**
 * The browser-operator reference mission: compare three laptops under $1,000.
 * Eight fixed, persisted steps — the exact sequence the user can watch on the
 * browser view. Entirely read-only: the mission stops at the recommended
 * product page and never attempts a purchase.
 */

export const LAPTOP_COMPARE_GOAL =
  "Find the best laptop under $1,000 for school, coding, and light gaming.";

export async function createLaptopCompareMission(
  userId: string,
  goal: string = LAPTOP_COMPARE_GOAL
): Promise<{ mission: MissionRecord; steps: MissionStepRecord[] }> {
  const store = getStore();
  const session = await store.createSession(userId, goal);
  const mission = await store.createMission({
    user_id: userId,
    session_id: session.id,
    goal,
  });
  const base = { mission_id: mission.id, user_id: userId, max_retries: 3 };
  const steps = await store.createMissionSteps([
    { ...base, idx: 0, purpose: "Confirm requirements", operator: "chief", tool: "laptop.confirm", depends_on: [] },
    { ...base, idx: 1, purpose: "Search for suitable laptops", operator: "browser", tool: "laptop.search", depends_on: [0] },
    { ...base, idx: 2, purpose: "Review product one", operator: "browser", tool: "laptop.review", depends_on: [1], input: { product_index: 0 } },
    { ...base, idx: 3, purpose: "Review product two", operator: "browser", tool: "laptop.review", depends_on: [2], input: { product_index: 1 } },
    { ...base, idx: 4, purpose: "Review product three", operator: "browser", tool: "laptop.review", depends_on: [3], input: { product_index: 2 } },
    { ...base, idx: 5, purpose: "Compare the products", operator: "research", tool: "laptop.compare", depends_on: [2, 3, 4] },
    { ...base, idx: 6, purpose: "Create recommendation", operator: "research", tool: "laptop.recommend", depends_on: [5] },
    { ...base, idx: 7, purpose: "Save final report", operator: "files", tool: "laptop.report", depends_on: [6] },
  ]);
  return { mission, steps };
}
