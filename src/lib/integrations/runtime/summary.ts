import { getStore } from "../../store";
import { getProvider } from "../registry";
import { capabilityRisk, mcpToolRisk } from "../tiers";
import { isCallable } from "../mcp/consent";

/**
 * A compact, plain-text summary of what a user has connected — fed to the
 * planner so it knows what's actually available and never invents an action
 * for a tool the user hasn't connected. It lists capabilities with their risk
 * class only; it carries NO secrets and no untrusted server content.
 */
export async function connectedCapabilitiesSummary(userId: string): Promise<string> {
  const store = getStore();
  let connections;
  try {
    connections = await store.listConnections(userId);
  } catch {
    return "";
  }
  if (connections.length === 0) return "";

  const lines: string[] = [];
  for (const c of connections) {
    if (c.status === "revoked") continue;
    if (c.kind === "app") {
      const provider = getProvider(c.provider_key);
      if (!provider) continue;
      const caps = provider
        .listActions()
        .map((a) => `${a.id}(${capabilityRisk(a)})`)
        .join(", ");
      lines.push(`- ${c.display_name}: ${caps}`);
    } else {
      const tools = (await store.listMcpTools(userId, c.id)).filter(isCallable);
      if (tools.length === 0) {
        lines.push(`- ${c.display_name} (custom MCP): no tools enabled yet`);
        continue;
      }
      const caps = tools.map((t) => `${t.name}(${mcpToolRisk(t)})`).join(", ");
      lines.push(`- ${c.display_name} (custom MCP): ${caps}`);
    }
  }
  return lines.join("\n");
}
