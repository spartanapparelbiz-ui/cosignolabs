import { NextResponse } from "next/server";
import { errorResponse, requireUser } from "@/lib/api";
import { enforceLimit } from "@/lib/ratelimit";
import { verifyPlannerKey } from "@/lib/agent/provider";
import { isProduction } from "@/lib/env";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

/**
 * Is the operator actually working?
 *
 * "Is the API key environment variable set?" is not that question, and
 * answering it was the problem: a mistyped key, an exhausted balance, and a
 * model id that doesn't exist all pass that check and then fail on the first
 * real request — with the user seeing only "temporarily unavailable".
 *
 * This makes a real call, with a real image, and reports what came back.
 *
 * Auth-gated and rate-limited, because it spends money. The USER-facing text
 * never names an environment variable; the operator-facing hint does, and
 * only outside production — the same rule the rest of the app follows.
 */

/** What a signed-in person should be told, per cause. Actionable, not internal. */
const USER_TEXT: Record<string, string> = {
  ok: "the operator is working — it can read text, images, and video frames.",
  no_key: "cosigno isn't finished being set up. an administrator needs to connect the AI operator.",
  no_model: "cosigno isn't finished being set up. an administrator needs to connect the AI operator.",
  key_rejected: "cosigno's connection to the AI operator was refused. an administrator needs to renew it.",
  no_credit: "cosigno's AI operator account is out of credit. an administrator needs to top it up.",
  unknown_model: "cosigno is pointed at an AI model that doesn't exist. an administrator needs to correct it.",
  rate_limited: "cosigno is being rate-limited right now — it should recover on its own shortly.",
  provider_down: "the AI operator is having an outage. nothing is wrong with your account.",
  unreachable: "cosigno can't reach the AI operator from this deployment.",
};

/** What to change, for whoever can change it. Never shown in production. */
const OPERATOR_HINT: Record<string, string> = {
  ok: "",
  no_key: "Set PLANNER_API_KEY in this deployment's environment and redeploy.",
  no_model: "Set PLANNER_MODEL_DEFAULT to a model id this key can use, and redeploy.",
  key_rejected: "PLANNER_API_KEY was rejected. Check for a stray space or newline, that the key is still active, and that PLANNER_BASE_URL (if set) points at the right host.",
  no_credit: "The provider account behind PLANNER_API_KEY has no credit. Add funds or raise the spend limit.",
  unknown_model: "PLANNER_MODEL_DEFAULT is not a model id this account can call. Correct it and redeploy.",
  rate_limited: "The provider is throttling this account. Lower concurrency or raise the account's rate limit.",
  provider_down: "The provider returned a server error. Retry; if it persists, check the provider's status page.",
  unreachable: "The provider host is unreachable from this deployment. Check egress rules and any PLANNER_BASE_URL override.",
};

export async function GET() {
  try {
    const userId = await requireUser();
    // A live provider call costs money — one check per minute per person.
    await enforceLimit("transitionMinute", userId);

    const health = await verifyPlannerKey();

    return NextResponse.json({
      ok: health.ok,
      reason: health.reason,
      /** Can the operator genuinely see an image? Verified, not assumed. */
      vision: health.vision,
      message: USER_TEXT[health.reason] ?? USER_TEXT.unreachable,
      // Configuration names are operator information. Production users never
      // see one; a development build shows it so the fix is obvious.
      ...(isProduction() ? {} : { hint: OPERATOR_HINT[health.reason] || undefined, detail: health.detail }),
    });
  } catch (err) {
    return errorResponse(err);
  }
}
