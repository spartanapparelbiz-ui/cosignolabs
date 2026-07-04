import { logInfo } from "../log";
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

export function anthropicConfigured(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY);
}

/** Hard cap on model output per planning call — cost containment. */
const MAX_TOKENS = 1024;

/**
 * command → plan → proposals. External content is scanned + wrapped before
 * it reaches model context. The model's tier requests are recorded but the
 * caller resolves the real tier server-side — the agent cannot self-escalate.
 * The offline mock planner is development-only: production without an
 * Anthropic key fails closed (and is already blocked upstream by the
 * production-readiness gate).
 */
export async function planCommand(
  command: string,
  externalContent: ExternalContentInput[] = [],
  userId?: string
): Promise<PlanResult> {
  const blocks = externalContent.map((c) => scanUntrusted(c.source, c.content));
  const suspectedSources = blocks
    .filter((b) => b.injectionSuspected)
    .map((b) => b.source);

  if (!anthropicConfigured() && process.env.NODE_ENV === "production") {
    throw new Error("anthropic_not_configured");
  }

  const plan = anthropicConfigured()
    ? await planWithClaude(command, blocks, userId)
    : planWithMock(command, blocks);

  return {
    ...plan,
    injectionSuspected: suspectedSources.length > 0,
    suspectedSources,
    promptVersion: SYSTEM_PROMPT_VERSION,
  };
}

type RawPlan = { reasoning: string; proposals: ProposedAction[] };

async function planWithClaude(
  command: string,
  blocks: UntrustedBlock[],
  userId?: string
): Promise<RawPlan> {
  const { default: Anthropic } = await import("@anthropic-ai/sdk");
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  const userContent = [
    `User command: ${command}`,
    ...blocks.map((b) => wrapUntrusted(b)),
  ].join("\n\n");

  const response = await client.messages.create({
    model: process.env.COSIGNO_OPERATOR_MODEL || "claude-sonnet-5",
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
  logInfo("anthropic_usage", {
    userId: userId ?? "unknown",
    input_tokens: response.usage?.input_tokens,
    output_tokens: response.usage?.output_tokens,
    model: response.model,
  });

  const toolUse = response.content.find((b) => b.type === "tool_use");
  if (!toolUse || toolUse.type !== "tool_use") {
    return { reasoning: "The operator could not produce a plan.", proposals: [] };
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

/**
 * Deterministic planner used when no ANTHROPIC_API_KEY is configured
 * (local development / demo). Keyword-parses the command into plausible
 * proposals so the full approval loop is exercisable offline.
 */
function planWithMock(command: string, blocks: UntrustedBlock[]): RawPlan {
  const c = command.toLowerCase();
  const proposals: ProposedAction[] = [];

  if (/(newsletter|inbox|unsubscribe|clean|clear)/.test(c)) {
    proposals.push(
      {
        category: "search",
        summary: "Scan your inbox for newsletter and promotional senders from the last 30 days.",
        payload: { query: "category:promotions OR list-unsubscribe", window_days: 30 },
        requested_tier: 1,
      },
      {
        category: "update_record",
        summary: "Archive 47 matched newsletter emails and label them \"newsletters\".",
        payload: { operation: "archive+label", label: "newsletters", match_count: 47 },
        requested_tier: 2,
      }
    );
  }
  if (/(draft|reply|replies|respond|lead)/.test(c)) {
    proposals.push({
      category: "draft",
      summary: "Draft replies to the 3 most recent unanswered leads — saved as drafts, nothing sent.",
      payload: {
        count: 3,
        tone: "warm, direct",
        drafts: [
          { to: "lead-1", body: "(draft generated at execution)" },
          { to: "lead-2", body: "(draft generated at execution)" },
          { to: "lead-3", body: "(draft generated at execution)" },
        ],
      },
      requested_tier: 1,
    });
  }
  if (/(send)/.test(c) && !/(draft)/.test(c)) {
    proposals.push({
      category: "send_email",
      summary: "Send the follow-up email to the recipient named in your command.",
      payload: { to: "recipient@example.com", subject: "Follow-up", body: "(from your command)" },
      requested_tier: 2,
    });
  }
  if (/(reprice|price|pricing)/.test(c)) {
    proposals.push({
      category: "update_record",
      summary: "Update prices on the matched products to the values you specified.",
      payload: { operation: "reprice", products: "matched from command", strategy: "as specified" },
      requested_tier: 2,
    });
  }
  if (/(delete|remove permanently)/.test(c)) {
    proposals.push({
      category: "delete",
      summary: "Permanently delete the items named in your command.",
      payload: { target: "items from command" },
      requested_tier: 3,
    });
  }
  if (/(payment|pay\b|wire|transfer)/.test(c)) {
    proposals.push({
      category: "payment",
      summary: "Send the payment named in your command.",
      payload: { amount: "as specified", recipient: "from command" },
      // Deliberately requests tier 1 — the dev mock simulates a compromised
      // model attempting to de-escalate. The server must clamp to tier 3;
      // the security suite asserts it.
      requested_tier: 1,
    });
  }
  if (/refund/.test(c)) {
    proposals.push({
      category: "refund",
      summary: "Issue the refund named in your command.",
      payload: { amount: "as specified", order: "from command" },
      requested_tier: 3,
    });
  }
  if (/(summar|digest)/.test(c)) {
    proposals.push({
      category: "summarize",
      summary: "Summarize the referenced content into a short digest in this thread.",
      payload: { sources: blocks.map((b) => b.source) },
      requested_tier: 1,
    });
  }
  if (proposals.length === 0) {
    proposals.push(
      {
        category: "search",
        summary: "Look up what's needed to carry out your command across connected tools.",
        payload: { query: command.slice(0, 200) },
        requested_tier: 1,
      },
      {
        category: "draft",
        summary: "Draft the output of your command for review — saved, not sent.",
        payload: { command: command.slice(0, 200) },
        requested_tier: 1,
      }
    );
  }

  const injected = blocks.some((b) => b.injectionSuspected);
  const reasoning = injected
    ? "I planned the steps below from your command only. Note: content I read from an external source contained instructions aimed at me — I ignored them and flagged the affected cards."
    : "I broke your command into the smallest independently-approvable steps. Read-only steps run automatically; anything that changes the outside world waits for your sign-off.";

  return { reasoning, proposals };
}
