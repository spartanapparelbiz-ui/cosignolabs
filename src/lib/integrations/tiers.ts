import type { Tier } from "../types";
import type { CapabilityRisk, ProviderAction } from "./types";
import { CATEGORY_RISK, toCategory } from "./mcp/classify";

/**
 * Capability → approval tier. This is the SERVER's rule, and it is the only
 * authority: a connector never sets its own tier. Read is auto-eligible (tier
 * 1), anything that writes waits for a signature (tier 2), anything
 * destructive requires typed confirmation (tier 3).
 */
export const RISK_TIER: Record<CapabilityRisk, Tier> = {
  read: 1,
  write: 2,
  destructive: 3,
};

/** The risk class of a capability — explicit, else derived from `mutates`. */
export function capabilityRisk(action: Pick<ProviderAction, "mutates" | "risk">): CapabilityRisk {
  return action.risk ?? (action.mutates ? "write" : "read");
}

/** The tier the server assigns a capability. */
export function serverTier(action: Pick<ProviderAction, "mutates" | "risk">): Tier {
  return RISK_TIER[capabilityRisk(action)];
}

/**
 * Resolve the effective tier for a connector action. A caller may ask for a
 * MORE restrictive tier (that's fine), but a request for a LOWER tier than the
 * server rule is clamped up and flagged — a connector can never talk its way
 * into a weaker approval than its risk class demands.
 */
export function resolveTier(
  action: Pick<ProviderAction, "mutates" | "risk">,
  requested?: number | null
): { tier: Tier; clamped: boolean } {
  const floor = serverTier(action);
  if (requested == null || !Number.isFinite(requested)) return { tier: floor, clamped: false };
  const req = Math.max(1, Math.min(3, Math.round(requested))) as Tier;
  if (req < floor) return { tier: floor, clamped: true };
  return { tier: req, clamped: false };
}

/**
 * Safe-default risk for a user-mapped custom API action. Nothing is trusted to
 * be read-only unless it PROVABLY looks it (a GET with a read-ish name);
 * destructive/payment-sounding names or a DELETE default to destructive;
 * everything else defaults to write (approval required). The user may raise the
 * risk afterwards, never lower it.
 */
export function customActionRisk(name: string, method: string): CapabilityRisk {
  const n = name.toLowerCase().replace(/[_-]+/g, " ").trim();
  const m = method.toUpperCase();
  if (m === "DELETE") return "destructive";
  if (/\b(delete|remove|destroy|drop|purge|wipe|erase|revoke|cancel|refund|pay|payment|transfer|charge|wire)\b/.test(n))
    return "destructive";
  if (m === "GET" && /^(get|list|search|read|fetch|find|show|view|lookup|query)\b/.test(n))
    return "read";
  return "write";
}

/**
 * The risk class of an MCP tool.
 *
 * The authority is the tool's CATEGORY — one of the nine the classifier
 * assigns at discovery, or the one a human settled. That mapping lives in
 * ./mcp/classify (CATEGORY_RISK) so there is exactly one table saying what
 * "delete" or "payment" means.
 *
 * The name-based rule below is the fallback for rows written before
 * classification existed. It stays deliberately conservative: anything not
 * provably read-only is a write.
 */
export function mcpToolRisk(tool: {
  name: string;
  sensitive: boolean;
  category?: string | null;
}): CapabilityRisk {
  const category = toCategory(tool.category);
  if (category) return CATEGORY_RISK[category];

  // Normalize snake_case / kebab-case so word boundaries match each segment
  // ("wipe_database" → "wipe database").
  const n = tool.name.toLowerCase().replace(/[_-]+/g, " ").trim();
  if (/\b(delete|remove|destroy|drop|purge|trash|wipe|erase|revoke|cancel|refund|pay|transfer|charge)\b/.test(n))
    return "destructive";
  // Anything not clearly read-only defaults to write (approval) — the safe floor.
  if (!tool.sensitive && /^(get|list|search|read|fetch|find|show|view|lookup|query)\b/.test(n))
    return "read";
  return "write";
}
