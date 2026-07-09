import { NextResponse } from "next/server";
import { errorResponse, requireUser } from "@/lib/api";
import { getStore } from "@/lib/store";
import { listProviderMeta } from "@/lib/integrations/registry";
import { toView } from "@/lib/integrations/runtime/connections";
import { vaultConfigured } from "@/lib/integrations/crypto";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * The Connections screen's data: available providers (with whether their env
 * is configured), the user's live connections (secret-free views), and each
 * MCP connection's cached tool list. No credentials are ever returned.
 */
export async function GET() {
  try {
    const userId = await requireUser();
    const store = getStore();
    const connections = await store.listConnections(userId);

    const tools: Record<string, unknown[]> = {};
    for (const c of connections) {
      if (c.kind === "mcp") tools[c.id] = await store.listMcpTools(userId, c.id);
    }

    return NextResponse.json({
      providers: listProviderMeta(),
      connections: connections.map(toView),
      tools,
      // The UI warns (and connect is blocked) if the server can't store secrets.
      vaultReady: vaultConfigured(),
    });
  } catch (err) {
    return errorResponse(err);
  }
}
