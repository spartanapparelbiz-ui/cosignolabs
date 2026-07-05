/**
 * PROVIDER ISOLATION LAYER — the ONLY file in the app that touches the LLM
 * vendor SDK or vendor-specific config. Swapping providers later must touch
 * exactly this file. Nothing outside it may import the SDK package or
 * reference vendor names; the vendor-grep CI check exempts only this file.
 *
 * Config is neutral and portable:
 *   PLANNER_API_KEY        the provider API key
 *   PLANNER_MODEL_DEFAULT  fast planner model id
 *   PLANNER_MODEL_PREMIUM  stronger planner model id (max plan, complex plans)
 *   PLANNER_BASE_URL       optional base URL override (provider portability)
 *
 * Backward-compat (one release, with a one-time deprecation warning): the
 * previous env names are still read if the new ones are unset.
 */
import { logInfo } from "../log";

let warnedApiKey = false;
let warnedModel = false;

/** Resolve the planner API key, honoring the deprecated name once. */
export function plannerApiKey(): string | undefined {
  if (process.env.PLANNER_API_KEY) return process.env.PLANNER_API_KEY;
  const legacy = process.env.ANTHROPIC_API_KEY;
  if (legacy && !warnedApiKey) {
    warnedApiKey = true;
    logInfo("deprecated_env", {
      old: "ANTHROPIC_API_KEY",
      use: "PLANNER_API_KEY",
    });
  }
  return legacy;
}

export function plannerConfigured(): boolean {
  return Boolean(plannerApiKey());
}

export type PlannerTier = "default" | "premium";

/** Model ids are config only — resolve with one-release backward-compat. */
export function plannerModel(tier: PlannerTier): string {
  if (tier === "premium") {
    const v = process.env.PLANNER_MODEL_PREMIUM || process.env.COSIGNO_MODEL_STRONG;
    if (!process.env.PLANNER_MODEL_PREMIUM && process.env.COSIGNO_MODEL_STRONG && !warnedModel) {
      warnedModel = true;
      logInfo("deprecated_env", { old: "COSIGNO_MODEL_STRONG", use: "PLANNER_MODEL_PREMIUM" });
    }
    return v || "";
  }
  const v = process.env.PLANNER_MODEL_DEFAULT || process.env.COSIGNO_MODEL_DEFAULT;
  if (!process.env.PLANNER_MODEL_DEFAULT && process.env.COSIGNO_MODEL_DEFAULT && !warnedModel) {
    warnedModel = true;
    logInfo("deprecated_env", { old: "COSIGNO_MODEL_DEFAULT", use: "PLANNER_MODEL_DEFAULT" });
  }
  return v || "";
}

/** A JSON-schema tool definition, provider-agnostic. */
export interface PlannerTool {
  name: string;
  description: string;
  input_schema: Record<string, unknown>;
}

export interface PlannerCall {
  model: string;
  maxTokens: number;
  system: string;
  userContent: string;
  tool: PlannerTool;
}

export interface PlannerResult {
  /** The tool input object the planner produced, or null. */
  toolInput: Record<string, unknown> | null;
  inputTokens?: number;
  outputTokens?: number;
}

/**
 * Invoke the planner and return a neutral result. All vendor SDK types and
 * response shapes are handled here and never leak out.
 */
export async function callPlanner(call: PlannerCall): Promise<PlannerResult> {
  // Dynamic import keeps the SDK out of any non-planner bundle path.
  const { default: Provider } = await import("@anthropic-ai/sdk");
  const client = new Provider({
    apiKey: plannerApiKey(),
    ...(process.env.PLANNER_BASE_URL ? { baseURL: process.env.PLANNER_BASE_URL } : {}),
  });

  const response = await client.messages.create({
    model: call.model,
    max_tokens: call.maxTokens,
    system: call.system,
    messages: [{ role: "user", content: call.userContent }],
    tools: [call.tool as never],
    tool_choice: { type: "tool", name: call.tool.name },
  });

  const toolUse = response.content.find((b) => b.type === "tool_use");
  const toolInput =
    toolUse && toolUse.type === "tool_use"
      ? (toolUse.input as Record<string, unknown>)
      : null;

  return {
    toolInput,
    inputTokens: response.usage?.input_tokens,
    outputTokens: response.usage?.output_tokens,
  };
}
