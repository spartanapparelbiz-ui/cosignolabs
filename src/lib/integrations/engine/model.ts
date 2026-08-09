import type { Tier } from "../../types";
import type {
  CapabilityRisk,
  ConnectionRecord,
  ConnectionStatus,
  CustomApiConfig,
  DiscoveredFact,
  McpToolRecord,
} from "../types";
import { customActionRisk, mcpToolRisk, RISK_TIER, serverTier, capabilityRisk } from "../tiers";
import { getProvider } from "../registry";
import { humanizeActionId, humanizeEndpoint } from "./humanize";

/**
 * The one shape every connection normalizes to.
 *
 * Built-in providers, custom HTTP APIs, and MCP servers arrive in three
 * different formats and used to be rendered by three different code paths,
 * which is why only the built-ins ever got a real interface. They are all
 * described here instead, so a connector cosigno has never seen presents
 * exactly like a first-party one — the built-ins become presets on this
 * pipeline rather than a separate implementation.
 *
 * Normalizing does NOT mean flattening away what makes each kind different.
 * MCP tools carry an enable/consent gate that HTTP actions don't have, so the
 * model keeps `available` and a stated reason: erasing that distinction to
 * make the rows look uniform would render a tool as usable when calling it
 * would be refused.
 */

export interface ConnectorCapability {
  /** Stable id used to invoke it. */
  id: string;
  /** Business language — "Create Order", never "POST /v1/orders". */
  label: string;
  /** One plain sentence, from the source when it supplied one. */
  summary: string;
  risk: CapabilityRisk;
  tier: Tier;
  /** What has to happen before this runs, in the user's words. */
  requires: "runs automatically" | "your approval" | "typed confirmation";
  /** False when the user must still enable or consent to it. */
  available: boolean;
  /** Present only when `available` is false. */
  unavailableReason?: string;
  /** The underlying call, kept for the details view — never the headline. */
  technical?: string;
}

export interface ConnectorModel {
  kind: ConnectionRecord["kind"];
  connectionId: string;
  /** Provider key, or "custom"/"mcp". */
  source: string;
  name: string;
  status: ConnectionStatus;
  lastHealthAt: string | null;
  /** Measured inventory. Empty when discovery isn't available for this kind. */
  facts: DiscoveredFact[];
  /** What could not be determined, in plain language. */
  limitations: string[];
  capabilities: ConnectorCapability[];
  /** Set when discovery was attempted and failed. */
  discoveryError?: string;
}

const REQUIRES: Record<Tier, ConnectorCapability["requires"]> = {
  1: "runs automatically",
  2: "your approval",
  3: "typed confirmation",
};

function capability(input: {
  id: string;
  label: string;
  summary: string;
  risk: CapabilityRisk;
  tier: Tier;
  available?: boolean;
  unavailableReason?: string;
  technical?: string;
}): ConnectorCapability {
  return {
    id: input.id,
    label: input.label,
    summary: input.summary,
    risk: input.risk,
    tier: input.tier,
    requires: REQUIRES[input.tier],
    available: input.available ?? true,
    ...(input.unavailableReason ? { unavailableReason: input.unavailableReason } : {}),
    ...(input.technical ? { technical: input.technical } : {}),
  };
}

/**
 * A built-in provider's declared actions. The tier comes from the SERVER rule
 * the approval engine enforces at execution, so a preset can't advertise a
 * weaker gate than it will actually get.
 */
export function capabilitiesFromProvider(providerKey: string): ConnectorCapability[] {
  const provider = getProvider(providerKey);
  if (!provider) return [];
  return provider.listActions().map((a) =>
    capability({
      id: a.id,
      label: humanizeActionId(a.id),
      summary: a.summary,
      risk: capabilityRisk(a),
      tier: serverTier(a),
      technical: a.id,
    })
  );
}

/**
 * A user-mapped HTTP API. Risk is derived from the METHOD plus the name, not
 * from anything the user typed in a label — a mapping called "sync" pointed at
 * a DELETE is still destructive.
 */
export function capabilitiesFromCustomApi(config: CustomApiConfig): ConnectorCapability[] {
  return (config.actions ?? []).map((a) => {
    // The stored risk is a starting point; re-deriving means an edited label
    // can never quietly downgrade a dangerous call.
    const derived = customActionRisk(a.id, a.method);
    const risk: CapabilityRisk =
      RISK_TIER[a.risk] > RISK_TIER[derived] ? a.risk : derived;
    return capability({
      id: a.id,
      label: humanizeEndpoint(a.method, a.path),
      summary: a.summary || `${a.method} ${a.path}`,
      risk,
      tier: RISK_TIER[risk],
      technical: `${a.method} ${a.path}`,
    });
  });
}

/**
 * An MCP server's tools. Unlike the other two kinds these are off until the
 * user enables them, and sensitive ones additionally need consent — so the
 * model reports them as unavailable with the reason rather than listing them
 * as though they were ready to run.
 */
export function capabilitiesFromMcp(tools: McpToolRecord[]): ConnectorCapability[] {
  return tools.map((t) => {
    const risk = mcpToolRisk(t);
    const needsConsent = t.sensitive && !t.consented_at;
    const available = t.enabled && !needsConsent;
    return capability({
      id: t.name,
      label: humanizeActionId(t.name),
      // MCP descriptions come from a third-party server and are UNTRUSTED
      // text. Bounded here so a long or hostile description can't take over
      // the surface a person reads before approving.
      summary: (t.description || "No description supplied by the server.").slice(0, 300),
      risk,
      tier: RISK_TIER[risk],
      available,
      unavailableReason: !t.enabled
        ? "turned off — enable it on this server to make it callable."
        : needsConsent
          ? "needs your consent before cosigno can call it."
          : undefined,
      technical: t.name,
    });
  });
}
