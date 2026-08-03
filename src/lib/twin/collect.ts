import { getStore } from "@/lib/store";
import { getProvider, listProviders } from "@/lib/integrations/registry";
import { buildTwin, type DigitalTwin, type RawAction } from "./model";

/**
 * Collect every digital twin for a user, in one place.
 *
 * The twin route and the whole Workspace Model surface (graph, plans,
 * changesets, sync) must reason about the SAME set of twins — if two callers
 * derived them slightly differently, a plan could be validated against a model
 * the explorer never showed. So derivation lives here and each caller reads it.
 *
 * Nothing is synthesized: an operation appears only because a provider, MCP
 * server, or imported OpenAPI document genuinely declares it.
 */

export interface CollectedTwin {
  twin: DigitalTwin;
  /** Last successful health observation, for sync freshness. Null = never. */
  last_synced_at: string | null;
}

export async function collectTwins(
  userId: string,
  opts: { includeAvailable?: boolean } = {}
): Promise<CollectedTwin[]> {
  const store = getStore();
  const connections = await store.listConnections(userId).catch(() => []);
  const collected: CollectedTwin[] = [];

  for (const c of connections) {
    if (c.kind === "mcp") {
      // MCP: the twin is the tool list the server actually advertised.
      const tools = await store.listMcpTools(userId, c.id).catch(() => []);
      collected.push({
        twin: buildTwin({
          connection_key: c.provider_key,
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
        last_synced_at: c.last_health_at,
      });
      continue;
    }

    const provider = getProvider(c.provider_key);
    if (!provider) continue;
    collected.push({
      twin: buildTwin({
        connection_key: c.provider_key,
        name: c.display_name || provider.name,
        kind: "app",
        status: c.status,
        source: "provider",
        actions: provider.listActions() as RawAction[],
      }),
      last_synced_at: c.last_health_at,
    });
  }

  if (opts.includeAvailable) {
    const connectedKeys = new Set(connections.map((c) => c.provider_key));
    for (const p of listProviders()) {
      if (connectedKeys.has(p.key)) continue;
      collected.push({
        twin: buildTwin({
          connection_key: p.key,
          name: p.name,
          kind: "app",
          status: "not_connected",
          source: "provider",
          actions: p.listActions() as RawAction[],
        }),
        last_synced_at: null,
      });
    }
  }

  return collected.sort((a, b) => a.twin.name.localeCompare(b.twin.name));
}
