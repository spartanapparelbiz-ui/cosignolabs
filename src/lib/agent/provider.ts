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

let warnedApiKey = false;
let warnedModel = false;

/**
 * Hard per-call wall for the planner request. Sits comfortably under a
 * serverless function's execution budget so a slow provider fails as a clean,
 * catchable timeout (→ calm "busy, try again" copy) rather than hanging the
 * function until the platform kills it. Override with PLANNER_TIMEOUT_MS.
 */
const PLANNER_TIMEOUT_MS = Number(process.env.PLANNER_TIMEOUT_MS || 20_000);

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

/**
 * The image formats the model can genuinely SEE. This list is a property of
 * the provider, which is why it lives here and nowhere else: callers ask
 * `visionMimeSupported()` rather than hard-coding a format list that would
 * silently rot when the provider changes.
 */
const VISION_MIMES = new Set(["image/png", "image/jpeg", "image/webp", "image/gif"]);

export function visionMimeSupported(mime: string): boolean {
  return VISION_MIMES.has(mime.toLowerCase().trim());
}

/** The human-facing list, so error copy and the provider never disagree. */
export const VISION_LABEL = "PNG, JPG, WebP, and GIF";

/**
 * Per-image ceiling for a single call. The provider rejects oversized images
 * outright, so an image that would fail is dropped BEFORE the call with an
 * honest note rather than failing the whole request.
 */
export const MAX_VISION_BYTES = 3.75 * 1024 * 1024;

/** Total attached-image budget for one call — cost and latency containment. */
export const MAX_VISION_IMAGES = 8;

/**
 * An image the model actually looks at. `data` is raw base64 (no data: URL
 * prefix). `label` is shown to the model as a caption so it can refer to
 * "the second frame" or "the receipt" by name instead of by position.
 */
export interface PlannerImage {
  mime: string;
  data: string;
  label?: string;
}

export interface PlannerCall {
  model: string;
  maxTokens: number;
  system: string;
  userContent: string;
  /**
   * Structured output. When present the model is FORCED to call this tool.
   * When absent the model answers in prose — which is the only way a question
   * ("what is in this photo?") can be answered at all. A call that must
   * always propose actions can never answer a question, so this is optional
   * by design, not by accident.
   */
  tool?: PlannerTool;
  /**
   * Images the model sees. Anything here is genuine visual input — never a
   * text description standing in for a picture.
   */
  images?: PlannerImage[];
  /**
   * Internal accounting context. When present, the call writes one row to the
   * AI cost ledger (model, tokens, estimated cost, user, plan, mission).
   * Absent = unattributed call; it still runs, it just isn't in the ledger —
   * so every real call site should pass it.
   */
  meta?: {
    userId: string;
    plan: string;
    task: string;
    missionId?: string | null;
    sessionId?: string | null;
  };
}

export interface PlannerResult {
  /** The tool input object the planner produced, or null. */
  toolInput: Record<string, unknown> | null;
  /** The prose answer, when the call ran without a forced tool. */
  text: string;
  inputTokens?: number;
  outputTokens?: number;
}

type PlannerSdkClient = InstanceType<(typeof import("@anthropic-ai/sdk"))["default"]>;

// One SDK client per key+endpoint for the life of the process — the planner
// is the hottest external call and re-constructing the client per request is
// pure allocation waste. Keyed so a rotated key or base-URL change mid-life
// still picks up a fresh client.
const plannerClients = new Map<string, PlannerSdkClient>();

async function plannerClient(apiKey: string): Promise<PlannerSdkClient> {
  const baseURL = process.env.PLANNER_BASE_URL?.trim() || "https://api.anthropic.com";
  const cacheKey = `${baseURL}|${apiKey}`;
  const cached = plannerClients.get(cacheKey);
  if (cached) return cached;

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
    baseURL,
    // Bound every planner call so a slow/hung provider can't tie up a
    // serverless function. The SDK default is a 10-MINUTE timeout with 2
    // retries — catastrophic under load (functions pile up, then the platform
    // kills them with a raw 502). We cap the request well under any function
    // budget and allow a single retry; on timeout the SDK throws, we catch it
    // in callPlanner, and the user gets calm "busy, try again" copy instead
    // of a hang.
    timeout: PLANNER_TIMEOUT_MS,
    maxRetries: 1,
  });
  plannerClients.set(cacheKey, client);
  return client;
}

/**
 * Build the multimodal message content.
 *
 * Images go FIRST: the model reads the picture, then the instruction about
 * it, which is the ordering the provider recommends and the one that stops an
 * instruction being answered before the image is seen. An image the provider
 * would reject is dropped here and the model is TOLD it was dropped — the
 * alternative is a confident description of something never delivered.
 *
 * Shared by the buffered and streaming paths so they can never diverge on
 * what the model actually receives.
 */
function buildContent(call: PlannerCall): unknown[] {
  const images = (call.images ?? []).slice(0, MAX_VISION_IMAGES);
  const usable = images.filter(
    (img) => visionMimeSupported(img.mime) && base64Bytes(img.data) <= MAX_VISION_BYTES
  );
  const dropped = images.length - usable.length;

  const content: unknown[] = [];
  for (const img of usable) {
    if (img.label) content.push({ type: "text", text: img.label });
    content.push({
      type: "image",
      source: { type: "base64", media_type: img.mime, data: img.data },
    });
  }
  content.push({
    type: "text",
    text:
      dropped > 0
        ? `${call.userContent}\n\n(${dropped} attached image${dropped === 1 ? "" : "s"} could not be opened and ${dropped === 1 ? "is" : "are"} NOT visible to you. Say so plainly rather than describing ${dropped === 1 ? "it" : "them"}.)`
        : call.userContent,
  });
  return content;
}

/**
 * Invoke the planner and STREAM the answer back, token by token.
 *
 * This is the single biggest thing that makes cosigno feel fast. A detailed
 * report is a thousand-odd tokens; buffering it means staring at a spinner
 * for the whole generation, while streaming puts the first sentence on screen
 * in well under a second. The total time is the same — the waiting is not.
 *
 * Streaming is prose-only by design: a partially-emitted tool call is not
 * something a caller can act on, so structured planning stays buffered.
 *
 * `onText` receives each fragment as it arrives. The full text is returned at
 * the end so callers can persist it without re-assembling.
 */
export async function streamPlanner(
  call: PlannerCall,
  onText: (chunk: string) => void
): Promise<PlannerResult> {
  const apiKey = plannerApiKey();
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

  // A cached identical answer is delivered instantly, in one piece. Replaying
  // it token by token would be theater — pretending to work we already did.
  const cacheKey = plannerCacheKey(call);
  const cached = plannerCacheGet(cacheKey);
  if (cached) {
    logInfo("planner_cache_hit", { task: call.meta?.task ?? "unattributed", streamed: false });
    if (cached.text) onText(cached.text);
    return cached;
  }

  const client = await plannerClient(apiKey);
  let text = "";
  let inputTokens: number | undefined;
  let outputTokens: number | undefined;

  try {
    const stream = client.messages.stream({
      model: call.model,
      max_tokens: call.maxTokens,
      system: call.system,
      messages: [{ role: "user", content: buildContent(call) as never }],
    });

    for await (const event of stream) {
      if (
        event.type === "content_block_delta" &&
        "delta" in event &&
        event.delta.type === "text_delta"
      ) {
        text += event.delta.text;
        onText(event.delta.text);
      } else if (event.type === "message_delta" && "usage" in event) {
        outputTokens = event.usage?.output_tokens ?? outputTokens;
      } else if (event.type === "message_start" && "message" in event) {
        inputTokens = event.message?.usage?.input_tokens ?? inputTokens;
      }
    }
  } catch (err) {
    const { status, detail } = describeFailure(err);
    logError(newRequestId(), err, { event: "planner_stream_failed", status, model: call.model });
    throw new PlannerError(status, plannerErrorMessage(status, detail));
  }

  const result: PlannerResult = { toolInput: null, text: text.trim(), inputTokens, outputTokens };
  if (result.text) plannerCacheSet(cacheKey, result);
  recordUsage(call, result);
  return result;
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

  const client = await plannerClient(apiKey);

  // Identical work is answered from cache, not paid for twice. Keyed on the
  // COMPLETE call (model + system + content + tool), so only a byte-identical
  // request can ever hit — a different user asking a different thing can't
  // collide, and the same user retrying the same command doesn't re-pay.
  const cacheKey = plannerCacheKey(call);
  const cached = plannerCacheGet(cacheKey);
  if (cached) {
    logInfo("planner_cache_hit", { task: call.meta?.task ?? "unattributed" });
    return cached;
  }

  const content = buildContent(call);

  let response;
  try {
    response = await client.messages.create({
      model: call.model,
      max_tokens: call.maxTokens,
      system: call.system,
      messages: [{ role: "user", content: content as never }],
      // Only a call that asked for structured output forces a tool. Without
      // one the model answers in prose — the difference between "here is a
      // detailed report on your photo" and a forced list of action cards.
      ...(call.tool
        ? { tools: [call.tool as never], tool_choice: { type: "tool" as const, name: call.tool.name } }
        : {}),
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

  const text = response.content
    .filter((b) => b.type === "text")
    .map((b) => (b.type === "text" ? b.text : ""))
    .join("\n")
    .trim();

  const result: PlannerResult = {
    toolInput,
    text,
    inputTokens: response.usage?.input_tokens,
    outputTokens: response.usage?.output_tokens,
  };

  // Only a USABLE result is cached — caching an empty result would replay the
  // failure for an hour instead of retrying it. "Usable" depends on what was
  // asked for: a tool call needs its input, a prose answer needs its text.
  if (call.tool ? Boolean(toolInput) : text.length > 0) plannerCacheSet(cacheKey, result);

  recordUsage(call, result);

  return result;
}

/**
 * Internal cost ledger — fire-and-forget; accounting never delays or fails
 * the user's request. Dynamic import keeps store code out of this module's
 * dependency graph for callers that only need types.
 *
 * Shared by the buffered and streaming paths: a streamed answer costs exactly
 * the same money, so it has to land in the ledger the same way.
 */
function recordUsage(call: PlannerCall, result: PlannerResult): void {
  if (!call.meta) return;
  const meta = call.meta;
  void import("../ai/costs")
    .then(({ recordAiUsage, estimateCost }) =>
      recordAiUsage({
        user_id: meta.userId,
        mission_id: meta.missionId ?? null,
        session_id: meta.sessionId ?? null,
        task: meta.task,
        model: call.model,
        input_tokens: result.inputTokens ?? 0,
        output_tokens: result.outputTokens ?? 0,
        est_cost_usd: estimateCost(call.model, result.inputTokens ?? 0, result.outputTokens ?? 0),
        plan: meta.plan,
      })
    )
    .catch(() => undefined);
}

/* --------------------------------------------------- identical-work cache */

/**
 * In-process LRU for identical planner calls. Bounded and TTL'd: this exists
 * to stop paying twice for byte-identical work (a retried command, a
 * double-submitted form), not to be a knowledge store. Nothing here outlives
 * the process or crosses instances.
 */
const PLANNER_CACHE_MAX = 200;
const PLANNER_CACHE_TTL_MS = 60 * 60 * 1000;
const plannerCache = new Map<string, { at: number; result: PlannerResult }>();

function plannerCacheKey(call: PlannerCall): string {
  const h = createHash("sha256")
    .update(call.model)
    .update("\0")
    .update(call.system)
    .update("\0")
    .update(call.userContent)
    .update("\0")
    .update(JSON.stringify(call.tool ?? null));
  // Images are part of the question. Without them, two different photos sent
  // with the same words would collide on the same key — and the second person
  // would be handed an answer about a picture they never uploaded.
  for (const img of call.images ?? []) {
    h.update("\0").update(img.mime).update("\0").update(img.label ?? "").update("\0").update(img.data);
  }
  return h.digest("hex");
}

/** Decoded byte length of a base64 payload, without allocating the buffer. */
function base64Bytes(b64: string): number {
  const len = b64.length;
  if (len === 0) return 0;
  const padding = b64.endsWith("==") ? 2 : b64.endsWith("=") ? 1 : 0;
  return Math.floor((len * 3) / 4) - padding;
}

function plannerCacheGet(key: string): PlannerResult | null {
  const hit = plannerCache.get(key);
  if (!hit) return null;
  if (Date.now() - hit.at > PLANNER_CACHE_TTL_MS) {
    plannerCache.delete(key);
    return null;
  }
  // Refresh recency (Map preserves insertion order — delete+set moves to end).
  plannerCache.delete(key);
  plannerCache.set(key, hit);
  return hit.result;
}

function plannerCacheSet(key: string, result: PlannerResult): void {
  plannerCache.set(key, { at: Date.now(), result });
  while (plannerCache.size > PLANNER_CACHE_MAX) {
    const oldest = plannerCache.keys().next().value;
    if (oldest === undefined) break;
    plannerCache.delete(oldest);
  }
}

/** For tests. */
export function resetPlannerCacheForTests(): void {
  plannerCache.clear();
}

/* ------------------------------------------------------------ key health */

export type PlannerHealth = {
  /** The key is present AND the provider accepted it on a real call. */
  ok: boolean;
  /** Machine-readable cause, for the operator UI. Never shown raw to users. */
  reason:
    | "ok"
    | "no_key"
    | "no_model"
    | "key_rejected"
    | "no_credit"
    | "unknown_model"
    | "rate_limited"
    | "provider_down"
    | "unreachable";
  /** An operator-facing sentence. Contains NO key material and no stack. */
  detail: string;
  /** Whether the configured model actually accepted an image. */
  vision: boolean;
};

/**
 * Verify the planner key by USING it. "Is the env var set?" is not a health
 * check — a typo'd key, an exhausted balance, and a model id that doesn't
 * exist all pass that test and then fail on a real user's first request. This
 * sends the smallest possible real call (a 1×1 image plus one word) so the
 * answer covers the key, the model id, the credit balance, AND whether vision
 * works, which is the combination that actually has to hold.
 */
export async function verifyPlannerKey(): Promise<PlannerHealth> {
  const apiKey = plannerApiKey();
  if (!apiKey) {
    return { ok: false, reason: "no_key", detail: "No planner API key is set for this deployment.", vision: false };
  }
  const model = plannerModel("default");
  if (!model) {
    return { ok: false, reason: "no_model", detail: "No planner model id is set for this deployment.", vision: false };
  }

  // A 1×1 transparent PNG. Small enough to be free-ish, real enough that a
  // provider which cannot do vision will say so.
  const PIXEL =
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";

  try {
    const client = await plannerClient(apiKey);
    await client.messages.create({
      model,
      max_tokens: 16,
      messages: [
        {
          role: "user",
          content: [
            { type: "image", source: { type: "base64", media_type: "image/png", data: PIXEL } },
            { type: "text", text: "Reply with the single word: ready" },
          ] as never,
        },
      ],
    });
    return { ok: true, reason: "ok", detail: "The planner key works and the model accepted an image.", vision: true };
  } catch (err) {
    const { status, detail } = describeFailure(err);
    const lower = detail.toLowerCase();
    logError(newRequestId(), err, { event: "planner_health_failed", status, model });

    if (status === 401 || status === 403) {
      return { ok: false, reason: "key_rejected", detail: "The provider rejected the planner key.", vision: false };
    }
    if (lower.includes("credit") || lower.includes("billing") || lower.includes("quota")) {
      return { ok: false, reason: "no_credit", detail: "The provider account has no available credit.", vision: false };
    }
    if (status === 404 || lower.includes("model")) {
      return { ok: false, reason: "unknown_model", detail: "The configured planner model id was not recognized.", vision: false };
    }
    if (status === 429) {
      return { ok: false, reason: "rate_limited", detail: "The provider is rate-limiting this account right now.", vision: false };
    }
    if (status !== null && status >= 500) {
      return { ok: false, reason: "provider_down", detail: "The provider returned a server error.", vision: false };
    }
    return { ok: false, reason: "unreachable", detail: "The provider could not be reached from this deployment.", vision: false };
  }
}
