import { logInfo } from "../log";
import { planWithMock } from "./mockPlanner";
import { ActionCategory, CATEGORIES, Tier } from "../types";
import { buildSystemPrompt, SYSTEM_PROMPT_VERSION } from "./systemPrompt";
import { scanUntrusted, wrapUntrusted, type UntrustedBlock } from "./untrusted";

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

export function plannerConfigured(): boolean {
  return Boolean(process.env.PLANNER_API_KEY);
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
    throw new Error("planner_not_configured");
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
  // Server-only vendor SDK; the package + client never reach the browser.
  const { default: LLM } = await import("@anthropic-ai/sdk");
  const client = new LLM({ apiKey: process.env.PLANNER_API_KEY });

  const userContent = [
    `User command: ${command}`,
    ...blocks.map((b) => wrapUntrusted(b)),
  ].join("\n\n");

  const response = await client.messages.create({
    // The model id is config, never hardcoded (see PLANNER_MODEL_*).
    model: model || process.env.PLANNER_MODEL_DEFAULT || "",
    max_tokens: MAX_TOKENS,
    system: buildSystemPrompt(),
    messages: [{ role: "user", content: userContent }],
    tools: [
      {
        name: "propose_actions",
        description:
          "Submit the action proposals for this command. Called exactly once.",
        input_schema: {
          type: "object" as const,
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
                  category: {
                    type: "string",
                    enum: Object.keys(CATEGORIES),
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
          required: ["reasoning", "proposals"],
        },
      },
    ],
    tool_choice: { type: "tool", name: "propose_actions" },
  });

  // Per-user token accounting: a runaway user is visible same-day.
  logInfo("planner_usage", {
    userId: userId ?? "unknown",
    input_tokens: response.usage?.input_tokens,
    output_tokens: response.usage?.output_tokens,
  });

  const toolUse = response.content.find((b) => b.type === "tool_use");
  if (!toolUse || toolUse.type !== "tool_use") {
    return { reasoning: "the operator couldn't produce a plan — try rephrasing.", proposals: [] };
  }
  const input = toolUse.input as {
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
