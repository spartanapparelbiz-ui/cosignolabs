import { getStore } from "../../store";
import { getProvider } from "../registry";
import { discoverConnection } from "../runtime/connections";
import type { ConnectionRecord, CustomApiConfig } from "../types";
import {
  capabilitiesFromCustomApi,
  capabilitiesFromMcp,
  capabilitiesFromProvider,
  type ConnectorModel,
} from "./model";

/**
 * The pipeline every connection goes through:
 *
 *   Connection → Discovery → Normalization → Action Generation
 *              → Permission Mapping → (Generated UI)
 *
 * One function, three kinds. Built-in providers are presets that happen to
 * supply a hand-written action list and a discovery implementation; a custom
 * HTTP API or an MCP server enters the same pipeline and comes out the same
 * shape, which is what makes the generated interface identical for a connector
 * cosigno has never seen.
 *
 * Discovery is the only stage that can genuinely be unavailable, and that is
 * reported rather than filled in. The rest — action generation, permission
 * mapping — works for every kind because it derives from what the connection
 * already declares.
 */
export async function describeConnection(
  userId: string,
  connectionId: string
): Promise<ConnectorModel | null> {
  const store = getStore();
  const connection = await store.getConnection(userId, connectionId);
  if (!connection) return null;

  const base = {
    kind: connection.kind,
    connectionId: connection.id,
    status: connection.status,
    lastHealthAt: connection.last_health_at,
  };

  if (connection.kind === "mcp") {
    // An MCP server's tool list IS its discovery result — it was enumerated at
    // handshake. Reporting the tool count as a "fact" would be restating the
    // capability list as though it were an inventory of the user's data.
    const tools = await store.listMcpTools(userId, connection.id).catch(() => []);
    return {
      ...base,
      source: "mcp",
      name: connection.display_name,
      facts: [],
      limitations: [
        "cosigno lists what this server exposes; it can't inventory what's inside it.",
      ],
      capabilities: capabilitiesFromMcp(tools),
    };
  }

  if (connection.kind === "custom") {
    const config = (connection.metadata ?? {}) as unknown as CustomApiConfig;
    return {
      ...base,
      source: "custom",
      name: connection.display_name,
      facts: [],
      limitations: [
        "cosigno only knows the actions you mapped — it can't inventory this API on its own.",
      ],
      capabilities: capabilitiesFromCustomApi(config),
    };
  }

  // Built-in provider preset.
  const provider = getProvider(connection.provider_key);
  const discovery = await discoverConnection(userId, connection.id);
  return {
    ...base,
    source: connection.provider_key,
    name: provider?.name ?? connection.display_name,
    facts: discovery.ok ? discovery.facts : [],
    limitations: discovery.limitations,
    capabilities: capabilitiesFromProvider(connection.provider_key),
    ...(discovery.ok ? {} : { discoveryError: discovery.error }),
  };
}

/** Every connection the user has, described through the same pipeline. */
export async function describeAllConnections(userId: string): Promise<ConnectorModel[]> {
  const connections = await getStore().listConnections(userId);
  const live = connections.filter((c: ConnectionRecord) => c.status !== "revoked");
  const models = await Promise.all(live.map((c) => describeConnection(userId, c.id)));
  return models.filter((m): m is ConnectorModel => m !== null);
}
