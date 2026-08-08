import { logInfo } from "../log";
import { planWithMock } from "./mockPlanner";
import { callPlanner, plannerConfigured, PlannerError } from "./provider";
import { escalationFor, modelFor } from "../ai/routing";
import { PLANS, type PlanId } from "../plans";
import { ActionCategory, CATEGORIES, Tier } from "../types";
import { buildSystemPrompt, SYSTEM_PROMPT_VERSION } from "./systemPrompt";
import { scanUntrusted, wrapUntrusted, type UntrustedBlock } from "./untrusted";
import { connectedCapabilitiesSummary } from "../integrations/runtime/summary";
import { memorySummary } from "../memory";

// Re-export so callers keep a single import surface for planner readiness.
export { plannerConfigured } from "./provider";

export interface ExternalContentInput {
  source: string;
  content: string;
}

export interface ProposedAction {
  category: ActionCategory;
  summary: string;
  payload: Record<string, unknown>;
  /** Tier the model asked for — advisory only, server decides the real tier. */
  requested_tier?: Tier;
}

export interface PlanResult {
  reasoning: string;
  /**
   * A direct answer, when the command was a question rather than work. The
   * planner used to have no way to return one — it was forced to emit action
   * proposals for every input, so "what does this mean?" came back as a card
   * to approve instead of an answer.
   */
  answer: string;
  proposals: ProposedAction[];
  /** True if any external content the agent read looked like it was trying to direct it. */
  injectionSuspected: boolean;
  suspectedSources: string[];
  promptVersion: string;
}

/** Hard cap on planner output per call — cost containment. */
const MAX_TOKENS = 1024;

/**
 * command → plan → proposals. External content is scanned + wrapped before
 * it reaches planner context. The planner's tier requests are recorded but
 * the caller resolves the real tier server-side — the agent cannot
 * self-escalate. The offline mock planner is development-only: production
 * without a planner key fails closed (and is already blocked upstream by the
 * production-readiness gate).
 */
export interface PlanCommandOpts {
  model?: string;
  /** Plan id, for evidence-based escalation + the internal cost ledger. */
  planId?: string;
  sessionId?: string | null;
}

export async function planCommand(
  command: string,
  externalContent: ExternalContentInput[] = [],
  userId?: string,
  opts: PlanCommandOpts = {}
): Promise<PlanResult> {
  const blocks = externalContent.map((c) => scanUntrusted(c.source, c.content));
  const suspectedSources = blocks
    .filter((b) => b.injectionSuspected)
    .map((b) => b.source);

  if (
    !plannerConfigured() &&
    process.env.NODE_ENV === "production" &&
    process.env.COSIGNO_PUBLIC_MODE !== "1"
  ) {
    // Operator cause is logged in callPlanner/provider; the user sees generic
    // copy only — never env var names or infra hints. In the public sandbox
    // (COSIGNO_PUBLIC_MODE=1) the deterministic offline planner is used
    // instead — it invents nothing and reaches no real provider.
    throw new PlannerError(
      null,
      "the AI operator is temporarily unavailable. we've been notified — please try again shortly."
    );
  }

  // Tell the planner what the user has actually connected, so it proposes
  // within reach and suggests connecting a tool instead of inventing an action.
  // Independent reads — gathered together.
  const [connected, memory] = userId
    ? await Promise.all([connectedCapabilitiesSummary(userId), memorySummary(userId)])
    : ["", ""];

  const plan = plannerConfigured()
    ? await planWithLLM(command, blocks, connected, memory, userId, opts)
    : planWithMock(command, blocks);

  return {
    ...plan,
    injectionSuspected: suspectedSources.length > 0,
    suspectedSources,
    promptVersion: SYSTEM_PROMPT_VERSION,
  };
}

type RawPlan = { reasoning: string; answer: string; proposals: ProposedAction[] };

const PROPOSE_ACTIONS_TOOL = {
  name: "propose_actions",
  description:
    "Submit the action proposals for this command. Called exactly once.",
  input_schema: {
    type: "object",
    properties: {
      reasoning: {
        type: "string",
        description: "2-3 plain-language sentences on the plan.",
      },
      answer: {
        type: "string",
        description:
          "If the person asked a QUESTION, or asked you to explain, analyze, or describe something, put the full answer here and leave proposals empty. This is the reply they read — answer it properly.",
      },
      proposals: {
        type: "array",
        maxItems: 5,
        items: {
          type: "object",
          properties: {
            category: {
              type: "string",
              // Only planner-selectable categories are advertised — the
              // integrations (connection_call) category is created by the
              // runtime, never chosen by the model.
              enum: Object.values(CATEGORIES)
                .filter((c) => c.plannerSelectable !== false)
                .map((c) => c.category),
            },
            summary: {
              type: "string",
              description:
                "One plain-English sentence: exactly what this action will do.",
            },
            payload: {
              type: "object",
              description: "The exact payload that would be executed.",
            },
            requested_tier: { type: "integer", enum: [1, 2, 3] },
          },
          required: ["category", "summary", "payload"],
        },
      },
    },
    // `proposals` is required but may be EMPTY: a question has no actions in
    // it, and inventing one to satisfy the schema is exactly how a request
    // for an answer became a list of things to approve.
    required: ["reasoning", "proposals"],
  },
};

async function planWithLLM(
  command: string,
  blocks: UntrustedBlock[],
  connected: string,
  memory: string,
  userId?: string,
  opts: PlanCommandOpts = {}
): Promise<RawPlan> {
  const userContent = [
    `User command: ${command}`,
    ...blocks.map((b) => wrapUntrusted(b)),
  ].join("\n\n");

  const meta = userId
    ? {
        userId,
        plan: opts.planId ?? "free",
        task: "plan",
        sessionId: opts.sessionId ?? null,
      }
    : undefined;

  // All provider/vendor specifics live in ./provider — this call is neutral.
  let result = await callPlanner({
    model: opts.model || modelFor("plan"),
    maxTokens: MAX_TOKENS,
    system: buildSystemPrompt(connected, memory),
    userContent,
    tool: PROPOSE_ACTIONS_TOOL,
    meta,
  });

  // Per-user token accounting: a runaway user is visible same-day.
  logInfo("planner_usage", {
    userId: userId ?? "unknown",
    input_tokens: result.inputTokens,
    output_tokens: result.outputTokens,
  });

  if (!result.toolInput) {
    // Evidence-based escalation: the default model demonstrably failed to
    // produce a plan. One retry, on the stronger model only when the user's
    // plan carries it — this is the ONLY path to the premium model, so cost
    // follows demonstrated need rather than guessed complexity.
    const strongerModel = Boolean(PLANS[opts.planId as PlanId]?.strongerModel);
    const escalation = escalationFor("plan", { strongerModel, userId: userId ?? "unknown" });
    result = await callPlanner({
      model: escalation.model,
      maxTokens: MAX_TOKENS,
      system: buildSystemPrompt(connected, memory),
      userContent,
      tool: PROPOSE_ACTIONS_TOOL,
      meta,
    });
    if (!result.toolInput) {
      return {
        reasoning: "the operator couldn't produce a plan — try rephrasing.",
        answer: "",
        proposals: [],
      };
    }
  }
  const input = result.toolInput as {
    reasoning?: string;
    answer?: string;
    proposals?: ProposedAction[];
  };
  const proposals = (input.proposals ?? [])
    .filter(
      (p) =>
        p &&
        p.category in CATEGORIES &&
        CATEGORIES[p.category]?.plannerSelectable !== false &&
        typeof p.summary === "string"
    )
    .slice(0, 5)
    .map((p) => ({
      category: p.category,
      summary: p.summary,
      payload:
        p.payload && typeof p.payload === "object"
          ? (p.payload as Record<string, unknown>)
          : {},
      requested_tier: p.requested_tier,
    }));
  return { reasoning: input.reasoning ?? "", answer: (input.answer ?? "").trim(), proposals };
}
