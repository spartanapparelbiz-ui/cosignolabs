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
import { logError, logInfo, newRequestId } from "../log";

let warnedApiKey = false;
let warnedModel = false;

/**
 * A planner call failed in a way worth telling the operator about (bad key,
 * no runtime env, unknown model, no credit, provider outage). Carries a
 * SAFE, human-readable message — never the API key, never a stack trace —
 * so the API layer can show the real reason instead of a generic 500.
 */
export class PlannerError extends Error {
  constructor(
    public status: number | null,
    message: string
  ) {
    super(message);
    this.name = "PlannerError";
  }
}

/** Pull a status + clean detail string out of a provider SDK error. */
function describeFailure(err: unknown): { status: number | null; detail: string } {
  const e = err as {
    status?: number;
    error?: { error?: { message?: string } };
    message?: string;
  };
  const status = typeof e?.status === "number" ? e.status : null;
  const detail =
    e?.error?.error?.message ||
    (typeof e?.message === "string" ? e.message : "") ||
    "unknown error";
  return { status, detail };
}

/**
 * USER-FACING planner failure copy. Deliberately generic about the cause: the
 * specific reason (bad key, no credit, unknown model, raw provider body) is
 * operator/config information and is written to the server logs ONLY — never
 * returned to the browser. `_detail` is accepted for call-site stability but is
 * never surfaced. Exported for tests. No string here can contain the API key,
 * an env var name, a model id, or a stack trace.
 */
const PLANNER_UNAVAILABLE =
  "the AI operator is temporarily unavailable. we've been notified — please try again shortly.";

export function plannerErrorMessage(status: number | null, _detail?: string): string {
  if (status === 429) {
    return "cosigno is handling a lot of requests right now — wait a moment and try again.";
  }
  if (status !== null && status >= 500) {
    return "the AI operator is briefly unavailable — please try again in a moment.";
  }
  // 400 / 401 / 403 / 404 and anything else are configuration/provider issues
  // the user can't act on and must not see the internals of.
  return PLANNER_UNAVAILABLE;
}

/**
 * Resolve the planner API key, honoring the deprecated name once.
 * .trim() defends against the single most common deploy mistake: a stray
 * space or newline pasted into the dashboard env var, which the provider
 * would otherwise reject with a 401 "invalid key".
 */
export function plannerApiKey(): string | undefined {
  const primary = process.env.PLANNER_API_KEY?.trim();
  if (primary) return primary;
  const legacy = process.env.ANTHROPIC_API_KEY?.trim();
  if (legacy && !warnedApiKey) {
    warnedApiKey = true;
    logInfo("deprecated_env", {
      old: "ANTHROPIC_API_KEY",
      use: "PLANNER_API_KEY",
    });
  }
  return legacy || undefined;
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
    return (v || "").trim();
  }
  const v = process.env.PLANNER_MODEL_DEFAULT || process.env.COSIGNO_MODEL_DEFAULT;
  if (!process.env.PLANNER_MODEL_DEFAULT && process.env.COSIGNO_MODEL_DEFAULT && !warnedModel) {
    warnedModel = true;
    logInfo("deprecated_env", { old: "COSIGNO_MODEL_DEFAULT", use: "PLANNER_MODEL_DEFAULT" });
  }
  return (v || "").trim();
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
  const apiKey = plannerApiKey();
  // Misconfiguration (missing key / model at runtime) is logged with the exact
  // cause for the operator, but the USER only ever sees generic copy — no env
  // var names, no infra hints.
  if (!apiKey) {
    logError(newRequestId(), new Error("planner_api_key_missing_at_runtime"), {
      event: "planner_misconfigured",
    });
    throw new PlannerError(null, PLANNER_UNAVAILABLE);
  }
  if (!call.model) {
    logError(newRequestId(), new Error("planner_model_missing_at_runtime"), {
      event: "planner_misconfigured",
    });
    throw new PlannerError(null, PLANNER_UNAVAILABLE);
  }

  // Dynamic import keeps the SDK out of any non-planner bundle path.
  const { default: Provider } = await import("@anthropic-ai/sdk");
  const client = new Provider({
    apiKey,
    // Pin auth + endpoint explicitly so STRAY environment variables can't
    // hijack the request. The SDK otherwise auto-reads ANTHROPIC_AUTH_TOKEN
    // (→ a conflicting bearer header) and ANTHROPIC_BASE_URL (→ silently
    // routes the call to a wrong host, causing a 401/403 even with a valid
    // key). Only a deliberate PLANNER_BASE_URL override is honored.
    authToken: null,
    baseURL: process.env.PLANNER_BASE_URL?.trim() || "https://api.anthropic.com",
  });

  let response;
  try {
    response = await client.messages.create({
      model: call.model,
      max_tokens: call.maxTokens,
      system: call.system,
      messages: [{ role: "user", content: call.userContent }],
      tools: [call.tool as never],
      tool_choice: { type: "tool", name: call.tool.name },
    });
  } catch (err) {
    // Log the FULL provider error server-side (status, body, stack) under a
    // clear event, then rethrow a safe, plain-language version for the user.
    const { status, detail } = describeFailure(err);
    logError(newRequestId(), err, {
      event: "planner_call_failed",
      status,
      model: call.model,
    });
    throw new PlannerError(status, plannerErrorMessage(status, detail));
  }

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
