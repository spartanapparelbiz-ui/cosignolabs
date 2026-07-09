import { NextRequest, NextResponse } from "next/server";
import { errorResponse, requireUser } from "@/lib/api";
import { enforceLimit } from "@/lib/ratelimit";
import { getStore } from "@/lib/store";
import { disconnect } from "@/lib/integrations/runtime/connections";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Revoke and remove a connection. Best-effort provider token revocation runs
 * first, then the row (and any cached MCP tools) is hard-deleted — which
 * immediately invalidates the stored, encrypted credentials. `key` is the
 * connection id here. Idempotent: unknown ids are a no-op success.
 */
export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ key: string }> }
) {
  try {
    const userId = await requireUser();
    await enforceLimit("transitionMinute", userId);
    const { key } = await params;
    const existing = await getStore().getConnection(userId, key);
    await disconnect(userId, key);
    if (existing) {
      await getStore().logAudit(userId, "integration_disconnected", {
        provider: existing.provider_key,
        kind: existing.kind,
      });
    }
    return NextResponse.json({ ok: true });
  } catch (err) {
    return errorResponse(err);
  }
}
