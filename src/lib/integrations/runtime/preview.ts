import { getStore } from "../../store";
import { applyRequirementToTier, applyRules, type RuleContext } from "../../rules";
import type { Tier } from "../../types";
import { getProvider } from "../registry";
import { isCallable } from "../mcp/consent";
import { mcpToolRisk, resolveTier } from "../tiers";
import type { CustomApiConfig, ProviderAction } from "../types";
import { argAmount, argChannel } from "./ruleContext";
import { fillPath } from "./customApi";

/**
 * DRY-RUN / ACTION PREVIEW — show exactly what a connector capability WOULD do,
 * without doing any of it. This is a structural clone of
 * proposeConnectorAction's resolution half, stopped before the action card is
 * ever created: it computes the same tier and the same rule decision, renders
 * the request in readable form (with the secret's PLACEMENT but never its
 * value), and returns. It decrypts no credential, calls no provider, opens no
 * card, sends no request, and increments no usage. "Show me what you would do."
 */

export type WouldRequire = "auto" | "approval" | "signature" | "typed confirmation" | "blocked";

const TIER_REQUIRE: Record<Tier, WouldRequire> = {
  1: "auto",
  2: "signature",
  3: "typed confirmation",
};

export interface PreviewRequest {
  kind: "app" | "custom" | "mcp";
  /** One readable line: what would be sent, and to where. */
  description: string;
  method?: string;
  url?: string;
  /** How the credential would be attached — placement only, never the value. */
  keyPlacement?: string;
  args: Record<string, unknown>;
}

export interface PreviewResult {
  ok: boolean;
  tier?: Tier;
  clamped?: boolean;
  wouldRequire?: WouldRequire;
  rules: { text: string; effect: "raised to signature" | "blocked" | "no change" }[];
  request?: PreviewRequest;
  /** Always present: makes it unmistakable nothing happened. */
  note: string;
  error?: string;
}

const SAFE_NOTE = "this is a preview — nothing was sent, no credential was read, and no approval was created.";

export interface PreviewInput {
  connectionId: string;
  capability: string;
  args?: Record<string, unknown>;
}

export async function previewConnectorAction(
  userId: string,
  input: PreviewInput
): Promise<PreviewResult> {
  const store = getStore();
  const conn = await store.getConnection(userId, input.connectionId);
  if (!conn) return { ok: false, rules: [], note: SAFE_NOTE, error: "connection not found." };
  if (conn.status === "revoked") {
    return { ok: false, rules: [], note: SAFE_NOTE, error: "this connection was disconnected." };
  }

  const args = input.args ?? {};
  let risk: Parameters<typeof resolveTier>[0];
  let summary: string;
  let request: PreviewRequest;

  if (conn.kind === "app") {
    const provider = getProvider(conn.provider_key);
    const cap = provider?.listActions().find((a) => a.id === input.capability);
    if (!provider || !cap) {
      return { ok: false, rules: [], note: SAFE_NOTE, error: "that capability isn't available on this connection." };
    }
    risk = cap as ProviderAction;
    summary = `${conn.display_name}: ${cap.summary}`;
    request = { kind: "app", description: summary, args };
  } else if (conn.kind === "custom") {
    const cfg = conn.metadata as unknown as CustomApiConfig;
    const action = cfg.actions?.find((a) => a.id === input.capability);
    if (!action) {
      return { ok: false, rules: [], note: SAFE_NOTE, error: "that action isn't available on this connection." };
    }
    risk = { mutates: true, risk: action.risk };
    summary = `${conn.display_name}: ${action.summary}`;
    // Render the resolved request — WITHOUT loading or decrypting the key.
    const base = cfg.base_url.replace(/\/+$/, "");
    const path = fillPath(action.path, args);
    const url = `${base}${path.startsWith("/") ? "" : "/"}${path}`;
    const placement = cfg.auth?.placement ?? "bearer";
    const keyPlacement =
      placement === "bearer"
        ? "Authorization: Bearer ••••••••"
        : placement === "header"
          ? `${cfg.auth?.name || "X-API-Key"}: ••••••••`
          : `query: ${cfg.auth?.name || "api_key"}=••••••••`;
    request = { kind: "custom", description: `${action.method} ${url}`, method: action.method, url, keyPlacement, args };
  } else {
    const tool = await store.getMcpTool(userId, conn.id, input.capability);
    if (!tool) return { ok: false, rules: [], note: SAFE_NOTE, error: "that tool isn't on this server anymore." };
    if (!isCallable(tool)) {
      return { ok: false, rules: [], note: SAFE_NOTE, error: "enable this tool before it can be used." };
    }
    risk = { mutates: true, risk: mcpToolRisk(tool) };
    summary = `${conn.display_name}: run ${tool.name}`;
    request = { kind: "mcp", description: summary, args };
  }

  // Same tier resolution the real proposal uses.
  const { tier: baseTier, clamped } = resolveTier(risk, undefined);
  let tier: Tier = baseTier;
  let wouldRequire: WouldRequire = TIER_REQUIRE[tier];
  const ruleEffects: PreviewResult["rules"] = [];

  const rules = await store.listPermissionRules(userId).catch(() => []);
  if (rules.length > 0) {
    const ctx: RuleContext = {
      // The action's normalized identity: which system, and which capability.
      // Rules are matched on these, never on `summary` — that is carried only
      // for label conditions and the audit note.
      target: conn.provider_key,
      actionId: input.capability,
      risk: risk.risk,
      tier: baseTier,
      category: conn.kind,
      summary,
      amount: argAmount(args),
      channel: argChannel(args),
    };
    const decision = applyRules(rules, ctx);
    if (decision.requirement && decision.rule) {
      const folded = applyRequirementToTier(tier, decision.requirement);
      if (folded.blocked) {
        wouldRequire = "blocked";
        ruleEffects.push({ text: decision.rule.text, effect: "blocked" });
      } else if (folded.tier > tier) {
        tier = folded.tier;
        wouldRequire = TIER_REQUIRE[tier];
        ruleEffects.push({ text: decision.rule.text, effect: "raised to signature" });
      } else {
        ruleEffects.push({ text: decision.rule.text, effect: "no change" });
      }
    }
  }

  return { ok: true, tier, clamped, wouldRequire, rules: ruleEffects, request, note: SAFE_NOTE };
}
