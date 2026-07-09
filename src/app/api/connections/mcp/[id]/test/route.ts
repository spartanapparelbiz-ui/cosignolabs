import { NextRequest, NextResponse } from "next/server";
import { errorResponse, requireUser } from "@/lib/api";
import { enforceLimit } from "@/lib/ratelimit";
import { getStore } from "@/lib/store";
import { decryptSecret } from "@/lib/integrations/crypto";
import { handshakeAndList, McpError, type McpConfig } from "@/lib/integrations/mcp/client";
import { validateTools } from "@/lib/integrations/mcp/validate";
import { isSensitiveTool } from "@/lib/integrations/mcp/consent";
import type { McpCredentials } from "@/lib/integrations/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Test-connection for a registered MCP server: re-handshake, re-discover, and
 * refresh the cached tool list (preserving each tool's enabled/consent state).
 * Returns a friendly ok/label or a specific error — never provider internals.
 */
export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const userId = await requireUser();
    await enforceLimit("transitionMinute", userId);
    const { id } = await params;
    const store = getStore();
    const c = await store.getConnection(userId, id);
    if (!c || c.kind !== "mcp") {
      return NextResponse.json({ error: "not_found", message: "connection not found." }, { status: 404 });
    }

    const creds = (c.encrypted_credentials
      ? decryptSecret<McpCredentials>(c.encrypted_credentials)
      : {}) as McpCredentials;
    const cfg: McpConfig = {
      url: String((c.metadata as { url?: string }).url ?? ""),
      transport: (c.metadata as { transport?: "http" | "sse" }).transport ?? "http",
      bearer: creds.bearer,
      headers: creds.headers,
    };

    try {
      const discovered = await handshakeAndList(cfg, 10_000);
      const validation = validateTools(discovered.rawTools);
      await store.saveMcpTools(
        userId,
        id,
        validation.tools.map((t) => ({
          ...t,
          sensitive: isSensitiveTool(t),
          enabled: false,
          consented_at: null,
        }))
      );
      await store.updateConnection(userId, id, {
        status: "connected",
        last_health_at: new Date().toISOString(),
      });
      return NextResponse.json({
        ok: true,
        serverName: discovered.serverName,
        toolCount: validation.tools.length,
      });
    } catch (err) {
      const kind = err instanceof McpError ? err.kind : "error";
      await store.updateConnection(userId, id, {
        status: kind === "auth" ? "needs_reauth" : "error",
        last_health_at: new Date().toISOString(),
      });
      return NextResponse.json({ ok: false, kind }, { status: 200 });
    }
  } catch (err) {
    return errorResponse(err);
  }
}
