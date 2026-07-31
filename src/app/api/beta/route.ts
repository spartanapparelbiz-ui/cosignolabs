import { NextRequest, NextResponse } from "next/server";
import { ApiError, errorResponse } from "@/lib/api";
import { isProduction } from "@/lib/env";
import { logSecurity } from "@/lib/log";
import { enforceLimit } from "@/lib/ratelimit";
import { clientIp } from "@/lib/clientIp";
import { betaSchema, parseStrict, readJsonBody } from "@/lib/schemas";
import { getStore } from "@/lib/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Verify a Cloudflare Turnstile token server-side. Fail-closed in
 * production: no secret configured → submissions are rejected outright.
 * In development without a secret, verification is skipped so the form
 * remains testable locally.
 */
async function verifyTurnstile(
  token: string | undefined,
  ip: string
): Promise<void> {
  const secret = process.env.TURNSTILE_SECRET_KEY;
  if (!secret) {
    if (isProduction()) {
      throw new ApiError(503, "not_configured", "applications are briefly closed — try again soon.");
    }
    return; // development only
  }
  if (!token) {
    logSecurity("turnstile_failed", { ip, reason: "missing_token" });
    throw new ApiError(400, "captcha_required", "please complete the human check.");
  }
  let data: { success?: boolean };
  try {
    const res = await fetch(
      "https://challenges.cloudflare.com/turnstile/v0/siteverify",
      {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ secret, response: token, remoteip: ip }),
        // Bound the external call so a slow/unreachable Cloudflare can't hang
        // the function; a timeout fails closed as a retryable captcha error.
        signal: AbortSignal.timeout(8000),
      }
    );
    data = (await res.json().catch(() => ({}))) as { success?: boolean };
  } catch {
    logSecurity("turnstile_failed", { ip, reason: "verify_unreachable" });
    throw new ApiError(503, "captcha_unavailable", "the human check timed out — try again in a moment.");
  }
  if (!data.success) {
    logSecurity("turnstile_failed", { ip, reason: "verification_failed" });
    throw new ApiError(400, "captcha_failed", "the human check didn't pass — try again.");
  }
}

/**
 * Founding beta application — the only unauthenticated write in the app.
 * Guarded by Turnstile + a 3/hour/IP rate limit.
 */
export async function POST(req: NextRequest) {
  try {
    const ip = clientIp(req);
    await enforceLimit("betaHour", ip);

    const body = parseStrict(betaSchema, await readJsonBody(req), "beta");
    await verifyTurnstile(body.turnstileToken, ip);

    await getStore().createBetaApplication({
      name: (body.name ?? "").trim(),
      email: body.email.trim(),
      tools: body.tools.trim(),
      workflow: body.workflow.trim(),
    });
    return NextResponse.json({
      ok: true,
      message:
        "application received — we review weekly and onboard in small cohorts. you'll hear from us at " +
        body.email.trim() +
        ".",
    });
  } catch (err) {
    return errorResponse(err);
  }
}
