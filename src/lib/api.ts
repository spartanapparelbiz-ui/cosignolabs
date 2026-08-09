import { NextResponse } from "next/server";
import { getUserId } from "./auth";
import { EngineError } from "./actions/engine";
import { PlannerError } from "./agent/provider";
import { servingAllowed } from "./env";
import { logError, logSecurity, newRequestId } from "./log";
import { RateLimitError } from "./ratelimit";

/**
 * An error with two audiences.
 *
 * `message` is for the person in the browser: what happened, in their words.
 * `developer` is the setting names that would fix it — useful to whoever
 * operates the workspace, meaningless (and slightly alarming) to everyone
 * else. It is attached at the throw site and STRIPPED FROM THE RESPONSE
 * outside development, so a route cannot leak it by forgetting to.
 *
 * The rule this encodes: naming a setting a reader cannot change tells them
 * only that they are not the audience. Making that impossible in one place
 * beats remembering it at every throw.
 */
export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    /** Setting NAMES only — never a value, never a secret. */
    public developer?: string[]
  ) {
    super(message);
  }
}

/** Development builds may see setting names; nothing else ever does. */
export function developerDetail(names: string[] | undefined): { developer?: string[] } {
  if (!names?.length) return {};
  if (process.env.NODE_ENV !== "development") return {};
  return { developer: names };
}

/** A configuration key: SCREAMING_SNAKE_CASE with at least one underscore. */
const SETTING_NAME = /\b[A-Z][A-Z0-9]{2,}(?:_[A-Z0-9]+)+\b/;

/**
 * The last gate before a message leaves the server.
 *
 * Components across this app render `err.message` directly, and errors are
 * thrown from everywhere — providers, the crypto module, rate limiters, the
 * planner. Fixing each call site fixes today and not tomorrow, because the
 * next throw is one commit away and nobody will remember this rule.
 *
 * So the guarantee is made HERE, once: any message on its way to a browser
 * that names a configuration key is replaced wholesale. A customer cannot act
 * on a key name, so losing the detail costs them nothing — and the real text
 * is logged, where the person who can act on it is already looking.
 */
export function safeMessage(message: string, code: string): string {
  if (!SETTING_NAME.test(message)) return message;
  logSecurity("config_name_withheld", { code, detail: message.slice(0, 200) });
  return "This isn't available right now. Please try again later, or contact support.";
}

/**
 * Server-side auth gate used by every protected route (in addition to the
 * middleware — defense in depth). Fail-closed ordering:
 *   1. production without the full key set → 503, demo mode unreachable
 *   2. no verified auth session → 401
 */
export async function requireUser(): Promise<string> {
  if (!servingAllowed()) {
    logSecurity("serving_blocked", { reason: "missing_production_keys" });
    throw new ApiError(
      503,
      "not_configured",
      "cosigno is briefly unavailable. Try again in a moment."
    );
  }
  const userId = await getUserId();
  if (!userId) {
    logSecurity("auth_failure", {});
    throw new ApiError(401, "unauthorized", "sign in to continue.");
  }
  return userId;
}

const ENGINE_STATUS: Record<string, number> = {
  not_found: 404,
  invalid_state: 409,
  confirmation_required: 428,
  confirmation_mismatch: 400,
  usage_limit: 402,
  forbidden: 403,
  injection_blocked: 403,
  on_hold: 423, // Locked — cosigno is held; resume to continue.
};

/**
 * Uniform error mapping. Expected 4xx conditions return their specific
 * code + message. Anything unexpected is logged server-side with a request
 * ID and returned as a GENERIC message — no stack traces, no internals.
 */
export function errorResponse(err: unknown): NextResponse {
  if (err instanceof ApiError) {
    return NextResponse.json(
      { error: err.code, message: safeMessage(err.message, err.code), ...developerDetail(err.developer) },
      { status: err.status }
    );
  }
  if (err instanceof RateLimitError) {
    return NextResponse.json(
      { error: "rate_limited", message: safeMessage(err.message, "rate_limited") },
      { status: 429, headers: { "Retry-After": String(err.retryAfter) } }
    );
  }
  if (err instanceof EngineError) {
    return NextResponse.json(
      { error: err.code, message: safeMessage(err.message, err.code) },
      { status: ENGINE_STATUS[err.code] ?? 400 }
    );
  }
  // The AI planner/provider failed. Unlike an unexpected internal error, this
  // carries a safe, already-human-readable reason (bad key, no runtime env,
  // unknown model, no credit, provider outage) — surface it so the operator
  // can fix it without reading logs. Full detail is logged in the provider.
  if (err instanceof PlannerError) {
    const requestId = newRequestId();
    return NextResponse.json(
      { error: "planner_failed", message: safeMessage(err.message, "planner_failed"), requestId },
      { status: 502 }
    );
  }
  const message = err instanceof Error ? err.message : "";
  if (message === "not_editable") {
    return NextResponse.json(
      { error: "not_editable", message: "Only proposed actions can be edited." },
      { status: 409 }
    );
  }
  if (message.startsWith("invalid_transition") || message.startsWith("injection_blocked")) {
    logSecurity("rejected_status_write", { detail: message });
    return NextResponse.json(
      { error: "invalid_transition", message: "That status change isn't allowed." },
      { status: 409 }
    );
  }

  const requestId = newRequestId();
  logError(requestId, err);
  return NextResponse.json(
    { error: "internal", message: "Something went wrong on our side. Try again in a moment.", requestId },
    { status: 500 }
  );
}
