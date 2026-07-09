import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { ApiError, errorResponse, requireUser } from "@/lib/api";
import { enforceLimit } from "@/lib/ratelimit";
import { parseStrict, readJsonBody } from "@/lib/schemas";
import { getUserPlan } from "@/lib/billing";
import { getStore } from "@/lib/store";
import { logSecurity } from "@/lib/log";
import { vaultConfigured } from "@/lib/integrations/crypto";
import { registerMcp } from "@/lib/integrations/mcp/register";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const schema = z
  .object({
    displayName: z.string().trim().min(1).max(60),
    url: z.string().trim().min(1).max(2048),
    transport: z.enum(["http", "sse"]).default("http"),
    bearer: z.string().max(4096).optional(),
    headers: z.record(z.string(), z.string().max(2048)).optional(),
  })
  .strict();

/**
 * Register a custom MCP server: handshake, discover + validate tools, cache
 * them (disabled by default). The plan's connection limit is enforced here,
 * server-side, exactly like third-party apps.
 */
export async function POST(req: NextRequest) {
  try {
    const userId = await requireUser();
    await enforceLimit("transitionMinute", userId);
    if (!vaultConfigured()) {
      throw new ApiError(503, "vault_unconfigured", "connections aren't available right now.");
    }
    const input = parseStrict(schema, await readJsonBody(req), "mcp");

    // Connection limit (custom MCPs count against it like apps do).
    const { plan, planId } = await getUserPlan(userId);
    const existing = await getStore().listConnections(userId);
    if (existing.length >= plan.integrationLimit) {
      logSecurity("usage_limit_hit", { userId, at: "mcp_connect", plan: planId });
      throw new ApiError(
        402,
        "upgrade_required",
        planId === "free"
          ? "free connects one integration. pro is $29/mo for unlimited."
          : "you've reached your plan's connection limit."
      );
    }

    const result = await registerMcp(userId, input);
    if (!result.ok) {
      // A failed handshake is a client-fixable 400 with a specific message.
      return NextResponse.json({ error: "mcp_connect_failed", message: result.error }, { status: 400 });
    }
    return NextResponse.json(result);
  } catch (err) {
    return errorResponse(err);
  }
}
