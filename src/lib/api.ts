import { NextResponse } from "next/server";
import { getUserId } from "./auth";
import { EngineError } from "./actions/engine";
import { servingAllowed } from "./env";
import { logError, logSecurity, newRequestId } from "./log";
import { RateLimitError } from "./ratelimit";

export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string
  ) {
    super(message);
  }
}

/**
 * Server-side auth gate used by every protected route (in addition to the
 * middleware — defense in depth). Fail-closed ordering:
 *   1. production without the full key set → 503, demo mode unreachable
 *   2. no verified Clerk session → 401
 */
export async function requireUser(): Promise<string> {
  if (!servingAllowed()) {
    logSecurity("serving_blocked", { reason: "missing_production_keys" });
    throw new ApiError(
      503,
      "not_configured",
      "cosigno is briefly unavailable. try again in a moment."
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
};

/**
 * Uniform error mapping. Expected 4xx conditions return their specific
 * code + message. Anything unexpected is logged server-side with a request
 * ID and returned as a GENERIC message — no stack traces, no internals.
 */
export function errorResponse(err: unknown): NextResponse {
  if (err instanceof ApiError) {
    return NextResponse.json(
      { error: err.code, message: err.message },
      { status: err.status }
    );
  }
  if (err instanceof RateLimitError) {
    return NextResponse.json(
      { error: "rate_limited", message: err.message },
      { status: 429, headers: { "Retry-After": String(err.retryAfter) } }
    );
  }
  if (err instanceof EngineError) {
    return NextResponse.json(
      { error: err.code, message: err.message },
      { status: ENGINE_STATUS[err.code] ?? 400 }
    );
  }
  const message = err instanceof Error ? err.message : "";
  if (message === "not_editable") {
    return NextResponse.json(
      { error: "not_editable", message: "only proposed actions can be edited." },
      { status: 409 }
    );
  }
  if (message.startsWith("invalid_transition") || message.startsWith("injection_blocked")) {
    logSecurity("rejected_status_write", { detail: message });
    return NextResponse.json(
      { error: "invalid_transition", message: "that status change isn't allowed." },
      { status: 409 }
    );
  }

  const requestId = newRequestId();
  logError(requestId, err);
  return NextResponse.json(
    { error: "internal", message: "something went wrong on our side. try again in a moment.", requestId },
    { status: 500 }
  );
}
