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
 *   1. usage gate FIRST — planning calls (planner invocations) count
 *      against the meter, so over-limit users get a 402 before any model
 *      call spends a cent,
 *   2. persist the user's message,
 *   3. plan (hosted planner or offline dev mock) with external content wrapped
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
  // plan (fail-closed to free). Planning calls count against it. The two
  // reads are independent, so they run together.
  const [{ plan: userPlan, planId }, usage] = await Promise.all([
    getUserPlan(userId),
    store.getUsage(userId),
  ]);
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

  const sessionId = session.id;
  const userMessage = await store.addMessage(userId, sessionId, "user", command);

  const model = chooseModel(planId, command, userId);
  // Tier settings and live temporary-authority grants (scoped, expiring —
  // resolveTier enforces the eligibility rules: never pinned, never SIGN
  // categories) don't depend on the plan, so their latency hides entirely
  // behind the multi-second planner call.
  const [plan, settings, grants] = await Promise.all([
    planCommand(command, opts.externalContent ?? [], userId, { model, planId, sessionId }),
    store.getTierSettings(userId),
    store.listTemporaryAuthority(userId),
  ]);
  // The planning call itself is metered — planner invocations count. The
  // cycle resolved above skips a redundant usage re-read.
  await store.incrementUsage(userId, usage.cycle_start);

  const prepared = plan.proposals.map((proposal) => {
    const tier = resolveTier(proposal.category, settings, grants);
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
    return { proposal, tier, tierNote, payload };
  });

  // Proposal rows are independent inserts — create them together (order is
  // preserved by Promise.all). Auto-execution stays sequential below: those
  // are real actions with usage metering.
  const proposedActions = await Promise.all(
    prepared.map(({ proposal, tier, tierNote, payload }) =>
      proposeAction({
        session_id: sessionId,
        user_id: userId,
        category: proposal.category,
        tier,
        summary: proposal.summary,
        payload,
        injection_flag: plan.injectionSuspected,
        tier_note: tierNote,
      })
    )
  );

  const actions: ActionRecord[] = [];
  for (const proposed of proposedActions) {
    actions.push(proposed.tier === 1 ? await autoExecute(userId, proposed) : proposed);
  }

  // What the person reads. A direct answer wins over the plan summary: when
  // they asked a question, the answer IS the reply, and showing them a
  // rationale for an empty plan instead was the old, useless behavior.
  const agentMessage = await store.addMessage(
    userId,
    session.id,
    "agent",
    plan.answer || plan.reasoning || "Plan prepared."
  );

  return { session, userMessage, agentMessage, actions };
}
