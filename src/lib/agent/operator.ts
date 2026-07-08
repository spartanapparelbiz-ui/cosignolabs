import { logInfo } from "../log";
import { planWithMock } from "./mockPlanner";
import { callPlanner, plannerConfigured, plannerModel, PlannerError } from "./provider";
import { ActionCategory, CATEGORIES, Tier } from "../types";
import { buildSystemPrompt, SYSTEM_PROMPT_VERSION } from "./systemPrompt";
import { scanUntrusted, wrapUntrusted, type UntrustedBlock } from "./untrusted";

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
export async function planCommand(
  command: string,
  externalContent: ExternalContentInput[] = [],
  userId?: string,
  model?: string
): Promise<PlanResult> {
  const blocks = externalContent.map((c) => scanUntrusted(c.source, c.content));
  const suspectedSources = blocks
    .filter((b) => b.injectionSuspected)
    .map((b) => b.source);

  if (!plannerConfigured() && process.env.NODE_ENV === "production") {
    throw new PlannerError(
      null,
      "the AI planner isn't configured on the server: PLANNER_API_KEY isn't visible at runtime. In Netlify, set PLANNER_API_KEY (scope must include Functions/Runtime) and redeploy."
    );
  }

  const plan = plannerConfigured()
    ? await planWithLLM(command, blocks, userId, model)
    : planWithMock(command, blocks);

  return {
    ...plan,
    injectionSuspected: suspectedSources.length > 0,
    suspectedSources,
    promptVersion: SYSTEM_PROMPT_VERSION,
  };
}

type RawPlan = { reasoning: string; proposals: ProposedAction[] };

async function planWithLLM(
  command: string,
  blocks: UntrustedBlock[],
  userId?: string,
  model?: string
): Promise<RawPlan> {
  const userContent = [
    `User command: ${command}`,
    ...blocks.map((b) => wrapUntrusted(b)),
  ].join("\n\n");

  // All provider/vendor specifics live in ./provider — this call is neutral.
  const result = await callPlanner({
    model: model || plannerModel("default"),
    maxTokens: MAX_TOKENS,
    system: buildSystemPrompt(),
    userContent,
    tool: {
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
          proposals: {
            type: "array",
            maxItems: 5,
            items: {
              type: "object",
              properties: {
                category: { type: "string", enum: Object.keys(CATEGORIES) },
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
        required: ["reasoning", "proposals"],
      },
    },
  });

  // Per-user token accounting: a runaway user is visible same-day.
  logInfo("planner_usage", {
    userId: userId ?? "unknown",
    input_tokens: result.inputTokens,
    output_tokens: result.outputTokens,
  });

  if (!result.toolInput) {
    return { reasoning: "the operator couldn't produce a plan — try rephrasing.", proposals: [] };
  }
  const input = result.toolInput as {
    reasoning?: string;
    proposals?: ProposedAction[];
  };
  const proposals = (input.proposals ?? [])
    .filter((p) => p && p.category in CATEGORIES && typeof p.summary === "string")
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
  return { reasoning: input.reasoning ?? "", proposals };
}
