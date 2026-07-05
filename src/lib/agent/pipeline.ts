import { EngineError } from "../actions/engine";
import { autoExecute, proposeAction } from "../actions/engine";
import { getUserPlan } from "../billing";
import { chooseModel, usageLimitMessage } from "../enforcement";
import { logSecurity } from "../log";
import { getStore } from "../store";
import { resolveTier } from "../tiers";
import { ActionRecord, MessageRecord, SessionRecord } from "../types";
import { planCommand, type ExternalContentInput } from "./operator";

export interface CommandResult {
  session: SessionRecord;
  userMessage: MessageRecord;
  agentMessage: MessageRecord;
  actions: ActionRecord[];
}

/**
 * The full loop for one command:
 *   1. usage gate FIRST — planning calls (Anthropic invocations) count
 *      against the meter, so over-limit users get a 402 before any model
 *      call spends a cent,
 *   2. persist the user's message,
 *   3. plan (Anthropic or offline dev mock) with external content wrapped
 *      as untrusted data; the planning call is metered,
 *   4. resolve each proposal's tier SERVER-SIDE — the model's requested
 *      tier is advisory; a mismatch is clamped, recorded on the card
 *      (tier_note) and logged as a security signal,
 *   5. create proposals; injection-suspected turns are flagged, never
 *      executed automatically,
 *   6. auto-execute tier-1 proposals (logged like everything else).
 */
export async function runCommand(
  userId: string,
  command: string,
  opts: {
    sessionId?: string;
    externalContent?: ExternalContentInput[];
  } = {}
): Promise<CommandResult> {
  const store = getStore();

  // Usage gate before the model is invoked — the limit comes from the user's
  // plan (fail-closed to free). Planning calls count against it.
  const { plan: userPlan, planId } = await getUserPlan(userId);
  const usage = await store.getUsage(userId);
  if (usage.actions_executed >= userPlan.actionLimit) {
    logSecurity("usage_limit_hit", { userId, at: "planning", plan: planId });
    throw new EngineError("usage_limit", usageLimitMessage(planId));
  }

  let session = opts.sessionId
    ? await store.getSession(userId, opts.sessionId)
    : null;
  if (!session) {
    session = await store.createSession(
      userId,
      command.slice(0, 80) || "New session"
    );
  }

  const userMessage = await store.addMessage(userId, session.id, "user", command);

  const model = chooseModel(planId, command, userId);
  const plan = await planCommand(command, opts.externalContent ?? [], userId, model);
  // The planning call itself is metered — Anthropic invocations count.
  await store.incrementUsage(userId);

  const settings = await store.getTierSettings(userId);

  const actions: ActionRecord[] = [];
  for (const proposal of plan.proposals) {
    const tier = resolveTier(proposal.category, settings);
    let tierNote: string | null = null;
    if (proposal.requested_tier && proposal.requested_tier !== tier) {
      if (proposal.requested_tier < tier) {
        logSecurity("tier_clamped", {
          userId,
          category: proposal.category,
          requested: proposal.requested_tier,
          enforced: tier,
        });
        tierNote = `the agent requested tier ${proposal.requested_tier}; the server enforced tier ${tier}. agents cannot self-escalate or lower their permissions.`;
      } else {
        tierNote = `the agent suggested tier ${proposal.requested_tier}; the server assigned tier ${tier} from your settings.`;
      }
    }

    const payload: Record<string, unknown> = { ...proposal.payload };
    if (plan.suspectedSources.length > 0) {
      payload._external_sources = plan.suspectedSources;
    }

    let action = await proposeAction({
      session_id: session.id,
      user_id: userId,
      category: proposal.category,
      tier,
      summary: proposal.summary,
      payload,
      injection_flag: plan.injectionSuspected,
      tier_note: tierNote,
    });

    if (tier === 1) {
      action = await autoExecute(userId, action);
    }
    actions.push(action);
  }

  const agentMessage = await store.addMessage(
    userId,
    session.id,
    "agent",
    plan.reasoning || "Plan prepared."
  );

  return { session, userMessage, agentMessage, actions };
}
