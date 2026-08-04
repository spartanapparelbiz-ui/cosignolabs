import { getStore } from "@/lib/store";
import { getProvider, listProviders } from "@/lib/integrations/registry";
import type { ConnectionRecord, CustomApiConfig } from "@/lib/integrations/types";
import { buildTwin, type DigitalTwin, type RawAction } from "./model";

/**
 * Collect every digital twin for a user, in one place.
 *
 * The Workspace Model and the approval card must reason about the SAME set of
 * twins — if two callers derived them slightly differently, an approval could
 * claim an undo the planner never modelled. So derivation lives here and every
 * caller reads it.
 *
 * IDENTITY MATTERS HERE. A twin is keyed by CONNECTION id, not by provider
 * key: every custom MCP server is stored with `provider_key: "mcp"` and every
 * generic API connector with `provider_key: "custom"`, so keying by provider
 * would merge two unrelated servers into one model — and a merged model can
 * offer an undo operation that belongs to somebody else's server.
 *
 * Nothing is synthesized: an operation appears only because a provider, MCP
 * server, OpenAPI import, or user-defined custom action genuinely declares it.
 */

export interface CollectedTwin {
  twin: DigitalTwin;
  /** The connection this twin models — absent for available-but-unconnected. */
  connection_id: string | null;
  /** Last successful health observation, for sync freshness. Null = never. */
  last_synced_at: string | null;
}

/** Custom API connectors declare their actions in non-secret metadata. */
function customActions(conn: ConnectionRecord): RawAction[] {
  const cfg = conn.metadata as unknown as CustomApiConfig;
  if (!Array.isArray(cfg?.actions)) return [];
  return cfg.actions.map((a) => ({
    id: a.id,
    summary: a.summary,
    // A read is the only class that changes nothing; everything else mutates.
    mutates: a.risk !== "read",
  }));
}

/**
 * Derivation FAILS LOUDLY. If the store can't be read, this throws rather than
 * returning an empty model: an empty model is not "no connections", it's "we
 * don't know", and the two are wildly different claims. An empty graph
 * rendered as fact would say a workspace has no tools, and an empty tool list
 * would make a live capability look withdrawn. Callers decide how to degrade —
 * the routes surface an error, the approval preview omits itself.
 */
export async function collectTwins(
  userId: string,
  opts: { includeAvailable?: boolean } = {}
): Promise<CollectedTwin[]> {
  const store = getStore();
  const connections = await store.listConnections(userId);
  const collected: CollectedTwin[] = [];

  for (const c of connections) {
    if (c.kind === "mcp") {
      // MCP: the twin is the tool list the server actually advertised.
      const tools = await store.listMcpTools(userId, c.id);
      collected.push({
        twin: buildTwin({
          connection_key: c.id,
          provider_key: c.provider_key,
          name: c.display_name,
          kind: "mcp",
          status: c.status,
          source: "mcp",
          actions: tools.map((t) => ({
            id: t.name,
            summary: t.description || t.name,
            // Unknown side effects are assumed consequential.
            mutates: t.sensitive !== false,
          })),
        }),
        connection_id: c.id,
        last_synced_at: c.last_health_at,
      });
      continue;
    }

    if (c.kind === "custom") {
      // Generic API-key connector: the twin is the action set the user mapped
      // (each already carrying the SERVER-assigned risk class).
      collected.push({
        twin: buildTwin({
          connection_key: c.id,
          provider_key: c.provider_key,
          name: c.display_name,
          kind: "custom",
          status: c.status,
          source: "openapi",
          actions: customActions(c),
        }),
        connection_id: c.id,
        last_synced_at: c.last_health_at,
      });
      continue;
    }

    const provider = getProvider(c.provider_key);
    if (!provider) continue;
    collected.push({
      twin: buildTwin({
        connection_key: c.id,
        provider_key: c.provider_key,
        name: c.display_name || provider.name,
        kind: "app",
        status: c.status,
        source: "provider",
        actions: provider.listActions() as RawAction[],
      }),
      connection_id: c.id,
      last_synced_at: c.last_health_at,
    });
  }

  if (opts.includeAvailable) {
    // A provider nobody has connected has no connection id, so its twin is
    // keyed by provider key — it models a capability surface, not a connection.
    const connectedKeys = new Set(connections.map((c) => c.provider_key));
    for (const p of listProviders()) {
      if (connectedKeys.has(p.key)) continue;
      collected.push({
        twin: buildTwin({
          connection_key: p.key,
          provider_key: p.key,
          name: p.name,
          kind: "app",
          status: "not_connected",
          source: "provider",
          actions: p.listActions() as RawAction[],
        }),
        connection_id: null,
        last_synced_at: null,
      });
    }
  }

  return collected.sort((a, b) => a.twin.name.localeCompare(b.twin.name));
}
