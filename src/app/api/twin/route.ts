import { NextResponse } from "next/server";
import { errorResponse, requireUser } from "@/lib/api";
import { getStore } from "@/lib/store";
import { getProvider, listProviders } from "@/lib/integrations/registry";
import { buildTwin, type DigitalTwin, type RawAction } from "@/lib/twin/model";

/**
 * GET /api/twin — the digital twin of every connected application.
 *
 * Each twin is derived from the provider's REAL declared actions (or, for MCP
 * connections, the tool schemas the server actually advertised). Nothing is
 * synthesized: an operation appears only because the integration genuinely
 * exposes it, which is what lets the planner reason over the model instead of
 * guessing endpoints.
 *
 * `?available=1` also returns twins for providers that are configured but not
 * yet connected, so the capability surface is inspectable before you connect.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    const userId = await requireUser();
    const store = getStore();
    const url = new URL(req.url);
    const includeAvailable = url.searchParams.get("available") === "1";

    const connections = await store.listConnections(userId).catch(() => []);
    const twins: DigitalTwin[] = [];

    for (const c of connections) {
      if (c.kind === "mcp") {
        // MCP: the twin is the tool list the server actually advertised.
        const tools = await store.listMcpTools(userId, c.id).catch(() => []);
        twins.push({
          ...buildTwin({
            connection_key: c.provider_key,
            name: c.display_name,
            kind: "mcp",
            status: c.status,
            source: "mcp",
            actions: tools.map((t) => ({
              id: t.name,
              summary: t.description || t.name,
              // An MCP tool is treated as mutating unless it is explicitly
              // non-sensitive: unknown side effects are assumed consequential.
              mutates: t.sensitive !== false,
            })),
          }),
          // When cosigno last successfully reached this connection — the
          // honest "last synced": a real check, not a heartbeat we invent.
          last_checked_at: c.last_health_at,
        });
        continue;
      }

      const provider = getProvider(c.provider_key);
      if (!provider) continue;
      twins.push({
        ...buildTwin({
          connection_key: c.provider_key,
          name: c.display_name || provider.name,
          kind: "app",
          status: c.status,
          source: "provider",
          actions: provider.listActions() as RawAction[],
        }),
        last_checked_at: c.last_health_at,
      });
    }

    if (includeAvailable) {
      const connectedKeys = new Set(connections.map((c) => c.provider_key));
      for (const p of listProviders()) {
        if (connectedKeys.has(p.key)) continue;
        twins.push(
          buildTwin({
            connection_key: p.key,
            name: p.name,
            kind: "app",
            status: "not_connected",
            source: "provider",
            actions: p.listActions() as RawAction[],
          })
        );
      }
    }

    return NextResponse.json(
      {
        generated_at: new Date().toISOString(),
        twins: twins.sort((a, b) => a.name.localeCompare(b.name)),
        // Stated so the UI never implies the twin mirrors live data.
        note: "Twins model each app's capability surface — resource types, operations, and the authority each requires. They do not mirror record data unless a resource reports a synced count.",
      },
      { headers: { "cache-control": "no-store" } }
    );
  } catch (err) {
    return errorResponse(err);
  }
}
