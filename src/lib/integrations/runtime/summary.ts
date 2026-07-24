import { getStore } from "../../store";
import { getProvider } from "../registry";
import { capabilityRisk, mcpToolRisk } from "../tiers";
import { isCallable } from "../mcp/consent";
import type { CustomApiConfig } from "../types";

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

  const live = connections.filter((c) => c.status !== "revoked");

  // MCP tool lists are per-connection queries — fetch them all at once
  // instead of serially inside the loop (this runs before every planner call).
  const mcpConnections = live.filter((c) => c.kind !== "app" && c.kind !== "custom");
  const mcpToolLists = await Promise.all(
    mcpConnections.map((c) => store.listMcpTools(userId, c.id))
  );
  const mcpToolsById = new Map(
    mcpConnections.map((c, i) => [c.id, mcpToolLists[i].filter(isCallable)])
  );

  const lines: string[] = [];
  for (const c of live) {
    if (c.kind === "app") {
      const provider = getProvider(c.provider_key);
      if (!provider) continue;
      const caps = provider
        .listActions()
        .map((a) => `${a.id}(${capabilityRisk(a)})`)
        .join(", ");
      lines.push(`- ${c.display_name}: ${caps}`);
    } else if (c.kind === "custom") {
      const cfg = c.metadata as unknown as CustomApiConfig;
      const caps = (cfg.actions ?? []).map((a) => `${a.id}(${a.risk})`).join(", ");
      lines.push(`- ${c.display_name} (custom API): ${caps || "no actions"}`);
    } else {
      const tools = mcpToolsById.get(c.id) ?? [];
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
