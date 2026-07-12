import { getStore } from "../store";
import type { MissionRecord, MissionStepRecord } from "../types";
import type { CompiledPlan } from "./validate";

/**
 * Instantiate a VALIDATED compiled plan as a real durable mission. The engine
 * takes it from here — same ticks, leases, approval gates, and verification as
 * a template mission. Only ever called with a plan that passed validation.
 */
export async function instantiateCompiledMission(
  userId: string,
  plan: CompiledPlan
): Promise<{ mission: MissionRecord; steps: MissionStepRecord[] }> {
  const store = getStore();
  const session = await store.createSession(userId, plan.normalizedGoal);
  const mission = await store.createMission({
    user_id: userId,
    session_id: session.id,
    goal: plan.normalizedGoal,
  });
  const steps = await store.createMissionSteps(
    plan.steps.map((s) => ({
      mission_id: mission.id,
      user_id: userId,
      idx: s.idx,
      purpose: s.purpose,
      operator: s.operator,
      tool: s.tool,
      depends_on: s.dependsOn,
      // Non-blocking compiler questions seed the first affected step's input
      // with the recommended default so independent work never stalls waiting
      // for an answer the user can still change on the mission page.
      input: {},
    }))
  );
  return { mission, steps };
}
