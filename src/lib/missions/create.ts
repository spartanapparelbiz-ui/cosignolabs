import { getStore } from "../store";
import type { MissionRecord, MissionSourceRef, MissionStepRecord } from "../types";
import type { CompiledPlan } from "./validate";
import { sourceIsUsable, type SourceContext } from "./compiler";

/** Steps that actually reason over provided context (vs. connector fetch/receipt steps). */
function stepUsesContext(tool: string): boolean {
  return (
    tool.startsWith("analyze.") ||
    tool.startsWith("deliverable.") ||
    tool === "browser.research"
  );
}

/**
 * Instantiate a VALIDATED compiled plan as a real durable mission. The engine
 * takes it from here — same ticks, leases, approval gates, and verification as
 * a template mission. Only ever called with a plan that passed validation.
 *
 * Staged sources (uploaded files / read links) are ATTACHED to the mission and
 * their extracted text is seeded — as untrusted data — into the steps that
 * reason over context, so the work genuinely uses what the user provided. Each
 * such step also records which sources it used, so the mission page can show
 * every source as a real, first-class input.
 */
export async function instantiateCompiledMission(
  userId: string,
  plan: CompiledPlan,
  opts: { sourceIds?: string[]; sources?: SourceContext[] } = {}
): Promise<{ mission: MissionRecord; steps: MissionStepRecord[] }> {
  const store = getStore();
  const session = await store.createSession(userId, plan.normalizedGoal);
  const mission = await store.createMission({
    user_id: userId,
    session_id: session.id,
    goal: plan.normalizedGoal,
  });

  const usable = (opts.sources ?? []).filter(sourceIsUsable);
  // Untrusted, bounded context the reasoning steps read (never instructions).
  const providedContext = usable.map((s) => ({
    kind: s.kind,
    name: s.name,
    origin: s.subtype,
    content: s.summary,
  }));
  const stepSourceRefs: MissionSourceRef[] = usable.map((s) => ({
    name: s.name,
    detail: s.kind === "file" ? `file · ${s.subtype}` : `link · ${s.subtype}`,
  }));

  const steps = await store.createMissionSteps(
    plan.steps.map((s) => {
      const usesContext = usable.length > 0 && stepUsesContext(s.tool);
      return {
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
        input: usesContext ? { provided_sources: providedContext } : {},
        sources: usesContext ? stepSourceRefs : undefined,
      };
    })
  );

  // Attach the staged sources to this mission (only the caller's own staged ones).
  if (opts.sourceIds && opts.sourceIds.length > 0) {
    await store.attachSourcesToMission(userId, opts.sourceIds, mission.id);
  }

  return { mission, steps };
}
