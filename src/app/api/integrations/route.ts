import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { ApiError, errorResponse, requireUser } from "@/lib/api";
import { getUserPlan } from "@/lib/billing";
import { logSecurity } from "@/lib/log";
import { enforceLimit } from "@/lib/ratelimit";
import { parseStrict, readJsonBody } from "@/lib/schemas";
import { getStore } from "@/lib/store";
import { AVAILABLE_INTEGRATIONS, INTEGRATION_KEYS } from "@/lib/integrations";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const bodySchema = z
  .object({ key: z.enum(INTEGRATION_KEYS), connected: z.boolean() })
  .strict();

export async function GET() {
  try {
    const userId = await requireUser();
    const [connected, { plan }] = await Promise.all([
      getStore().listIntegrations(userId),
      getUserPlan(userId),
    ]);
    return NextResponse.json({
      available: AVAILABLE_INTEGRATIONS,
      connected,
      limit: plan.integrationLimit === Infinity ? null : plan.integrationLimit,
    });
  } catch (err) {
    return errorResponse(err);
  }
}

/**
 * Connect / disconnect an integration. The plan's integration limit is
 * enforced HERE, server-side: a free user connecting a 2nd integration is
 * rejected 402 with an upgrade prompt.
 */
export async function POST(req: NextRequest) {
  try {
    const userId = await requireUser();
    await enforceLimit("transitionMinute", userId);
    const { key, connected } = parseStrict(bodySchema, await readJsonBody(req), "integrations");

    const store = getStore();
    if (connected) {
      const { plan, planId } = await getUserPlan(userId);
      const current = await store.listIntegrations(userId);
      const alreadyOn = current.includes(key);
      if (!alreadyOn && current.length >= plan.integrationLimit) {
        logSecurity("usage_limit_hit", { userId, at: "integration_connect", plan: planId });
        throw new ApiError(
          402,
          "upgrade_required",
          planId === "free"
            ? "free connects one integration. pro is $29/mo for unlimited."
            : "you've reached your plan's integration limit."
        );
      }
    }

    await store.setIntegration(userId, key, connected);
    const list = await store.listIntegrations(userId);
    return NextResponse.json({ connected: list });
  } catch (err) {
    return errorResponse(err);
  }
}
