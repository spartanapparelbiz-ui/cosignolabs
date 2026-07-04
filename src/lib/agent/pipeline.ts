import { autoExecute, proposeAction } from "../actions/engine";
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
 *   1. persist the user's message,
 *   2. plan (Anthropic or offline mock) with external content wrapped as
 *      untrusted data,
 *   3. resolve each proposal's tier SERVER-SIDE — the model's requested
 *      tier is advisory; a mismatch is recorded on the card (tier_note),
 *   4. create proposals; injection-suspected turns are flagged, never
 *      executed automatically,
 *   5. auto-execute tier-1 proposals (logged like everything else).
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

  const plan = await planCommand(command, opts.externalContent ?? []);
  const settings = await store.getTierSettings(userId);

  const actions: ActionRecord[] = [];
  for (const proposal of plan.proposals) {
    const tier = resolveTier(proposal.category, settings);
    let tierNote: string | null = null;
    if (proposal.requested_tier && proposal.requested_tier !== tier) {
      tierNote =
        proposal.requested_tier < tier
          ? `The agent requested tier ${proposal.requested_tier}; the server enforced tier ${tier}. Agents cannot self-escalate or lower permissions.`
          : `The agent suggested tier ${proposal.requested_tier}; the server assigned tier ${tier} from your settings.`;
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
