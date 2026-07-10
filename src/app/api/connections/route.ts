import { NextResponse } from "next/server";
import { errorResponse, requireUser } from "@/lib/api";
import { getStore } from "@/lib/store";
import { listProviderMeta } from "@/lib/integrations/registry";
import { toView } from "@/lib/integrations/runtime/connections";
import { vaultConfigured } from "@/lib/integrations/crypto";
import { mcpToolRisk, RISK_TIER } from "@/lib/integrations/tiers";

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

    // Tool lists come from the per-connection cache (no live re-handshake on
    // load). Fetch them in parallel rather than serially so many connected
    // servers don't stack their round-trips.
    const mcp = connections.filter((c) => c.kind === "mcp");
    const toolLists = await Promise.all(
      mcp.map((c) => store.listMcpTools(userId, c.id))
    );
    const tools: Record<string, unknown[]> = {};
    mcp.forEach((c, i) => {
      // Attach the SERVER-assigned tier each tool would be proposed at, so the
      // UI can show it. Derived from the tool's risk — never client-supplied.
      tools[c.id] = toolLists[i].map((t) => ({ ...t, tier: RISK_TIER[mcpToolRisk(t)] }));
    });

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
