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
import { createHash } from "crypto";
import { logError, logInfo, newRequestId } from "../log";

/**
 * TEMPORARY in-runtime auth diagnostic. When the planner call fails, this
 * fires a raw request to the provider from INSIDE the running function and
 * reports the exact key hash used + the raw HTTP status. It isolates three
 * things at once: is the key the function uses actually the good one; does a
 * bare request from this runtime authenticate; and is a legacy env var set.
 */
async function diagnoseAuth(apiKey: string, model: string): Promise<string> {
  const keyShaUsed = createHash("sha256").update(apiKey).digest("hex").slice(0, 12);
  const legacyEnvSet = process.env.ANTHROPIC_API_KEY ? "yes" : "no";
  let rawFetch: string;
  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({ model, max_tokens: 1, messages: [{ role: "user", content: "x" }] }),
    });
    rawFetch = String(res.status);
  } catch (e) {
    rawFetch = "threw:" + String(e).slice(0, 60);
  }
  return ` [diag: keyShaUsed=${keyShaUsed} rawFetch=${rawFetch} legacyEnvSet=${legacyEnvSet}]`;
}

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
 * Turn a provider failure into a plain-language, actionable message. Exported
 * for tests. Vendor-neutral by design: it names the cosigno env vars to check,
 * never the provider. None of these strings can contain the API key.
 */
export function plannerErrorMessage(status: number | null, detail: string): string {
  if (status === 401) {
    return "the AI provider rejected the API key (401). Check PLANNER_API_KEY in Netlify — a wrong key or a stray space/newline is the usual cause — then redeploy.";
  }
  if (status === 403) {
    return "the AI provider denied access (403). The key may not have access to the requested model, or billing isn't active on the provider account.";
  }
  if (status === 404) {
    return `the AI provider didn't recognize the model (404). Check PLANNER_MODEL_DEFAULT and PLANNER_MODEL_PREMIUM are exact model ids. (${detail})`;
  }
  if (status === 400 && /credit|balance|billing|quota/i.test(detail)) {
    return "the AI provider account is out of credit. Add credit/billing to the provider account, then try again.";
  }
  if (status === 400) {
    return `the AI provider rejected the request (400): ${detail}`;
  }
  if (status === 429) {
    return "the AI provider is rate-limiting requests right now (429). Wait a moment and try again.";
  }
  if (status !== null && status >= 500) {
    return "the AI provider had a temporary server error. Try again in a moment.";
  }
  return `the AI planner call failed: ${detail}`;
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
  if (!apiKey) {
    // The single most common production failure: the variable exists in the
    // Netlify dashboard but isn't exposed to the running function (its scope
    // must include Functions/Runtime, not just Builds).
    throw new PlannerError(
      null,
      "the AI planner key isn't visible to the server at runtime. In Netlify → Site configuration → Environment variables, make sure PLANNER_API_KEY is set and its scope includes Functions (and Runtime), then Clear cache and deploy."
    );
  }
  if (!call.model) {
    throw new PlannerError(
      null,
      "no planner model is configured. Set PLANNER_MODEL_DEFAULT (and PLANNER_MODEL_PREMIUM) in Netlify, then redeploy."
    );
  }

  // Dynamic import keeps the SDK out of any non-planner bundle path.
  const { default: Provider } = await import("@anthropic-ai/sdk");
  const client = new Provider({
    apiKey,
    ...(process.env.PLANNER_BASE_URL ? { baseURL: process.env.PLANNER_BASE_URL } : {}),
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
    const diag = await diagnoseAuth(apiKey, call.model);
    throw new PlannerError(status, plannerErrorMessage(status, detail) + diag);
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
