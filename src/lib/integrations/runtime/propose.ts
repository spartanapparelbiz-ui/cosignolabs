import { autoExecute, proposeAction } from "../../actions/engine";
import { logSecurity } from "../../log";
import { getStore } from "../../store";
import { applyRequirementToTier, applyRules, type RuleContext } from "../../rules";
import type { ActionRecord, Tier } from "../../types";
import { getProvider } from "../registry";
import { isCallable } from "../mcp/consent";
import { mcpToolRisk, resolveTier } from "../tiers";
import type { CustomApiConfig, ProviderAction } from "../types";
import { argAmount, argChannel } from "./ruleContext";

export interface ProposeConnectorInput {
  connectionId: string;
  /** Provider action id (apps) or MCP tool name. */
  capability: string;
  args?: Record<string, unknown>;
  /** Advisory only — clamped up to the server rule, never down. */
  requestedTier?: number | null;
}

export interface ProposeConnectorResult {
  ok: boolean;
  action?: ActionRecord;
  error?: string;
}

/**
 * Turn a connector capability into a PROPOSED action card — the single door
 * through which any integration reaches the outside world. The server assigns
 * the tier from the capability's risk class (read→1 / write→2 / destructive→3);
 * a requested lower tier is clamped and flagged. The card then flows through
 * the exact same approval → signature → execute engine as everything else, so
 * a connector can propose but never bypass the signature loop.
 */
export async function proposeConnectorAction(
  userId: string,
  sessionId: string,
  input: ProposeConnectorInput
): Promise<ProposeConnectorResult> {
  const store = getStore();
  const conn = await store.getConnection(userId, input.connectionId);
  if (!conn) return { ok: false, error: "Connection not found." };
  if (conn.status === "revoked") return { ok: false, error: "This connection was disconnected." };

  let risk: Parameters<typeof resolveTier>[0];
  let summary: string;
  let payload: Record<string, unknown>;

  if (conn.kind === "app") {
    const provider = getProvider(conn.provider_key);
    const cap = provider?.listActions().find((a) => a.id === input.capability);
    if (!provider || !cap) return { ok: false, error: "That capability isn't available on this connection." };
    risk = cap as ProviderAction;
    summary = `${conn.display_name}: ${cap.summary}`;
    payload = { kind: "app", connection_id: conn.id, action: cap.id, args: input.args ?? {} };
  } else if (conn.kind === "custom") {
    // Generic API-key connector: risk is the SERVER-assigned safe default
    // stored on the action at add time (user may raise, never lower).
    const cfg = conn.metadata as unknown as CustomApiConfig;
    const action = cfg.actions?.find((a) => a.id === input.capability);
    if (!action) return { ok: false, error: "That action isn't available on this connection." };
    risk = { mutates: true, risk: action.risk };
    summary = `${conn.display_name}: ${action.summary}`;
    payload = { kind: "custom", connection_id: conn.id, action: action.id, args: input.args ?? {} };
  } else {
    const tool = await store.getMcpTool(userId, conn.id, input.capability);
    if (!tool) return { ok: false, error: "That tool isn't on this server anymore." };
    // A tool can only be proposed once the user has enabled (and, if
    // sensitive, consented to) it — enforced again at execute time.
    if (!isCallable(tool)) return { ok: false, error: "Enable this tool before it can be used." };
    risk = { mutates: true, risk: mcpToolRisk(tool) };
    summary = `${conn.display_name}: run ${tool.name}`;
    payload = { kind: "mcp", connection_id: conn.id, tool: tool.name, args: input.args ?? {} };
  }

  const { tier: baseTier, clamped } = resolveTier(risk, input.requestedTier);
  let tier: Tier = baseTier;
  let tierNote: string | null = null;
  if (clamped) {
    logSecurity("tier_clamped", {
      userId,
      category: "connection_call",
      requested: input.requestedTier,
      enforced: tier,
      connection: conn.id,
    });
    tierNote = `the connector asked for tier ${input.requestedTier}; the server enforced tier ${tier} from the capability's risk. connectors cannot lower their own approval level.`;
  }

  // Custom permission rules — the user's plain-language policy over their
  // tools. Rules only ever TIGHTEN: they can raise the tier (require approval /
  // signature) or FORBID the action, never lower the server's floor.
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
      amount: argAmount(input.args ?? {}),
      channel: argChannel(input.args ?? {}),
    };
    const decision = applyRules(rules, ctx);
    if (decision.requirement) {
      const folded = applyRequirementToTier(tier, decision.requirement);
      if (folded.blocked) {
        logSecurity("rule_blocked", {
          userId,
          connection: conn.id,
          capability: input.capability,
          rule: decision.rule?.id,
        });
        return {
          ok: false,
          error: `a permission rule blocks this: "${decision.rule?.text ?? "no action allowed"}". change or remove the rule to allow it.`,
        };
      }
      if (folded.tier > tier) {
        tier = folded.tier;
        const raised = `a permission rule raised this to tier ${tier}: "${decision.rule?.text ?? ""}".`;
        tierNote = tierNote ? `${tierNote} ${raised}` : raised;
      }
    }
  }

  let action = await proposeAction({
    session_id: sessionId,
    user_id: userId,
    category: "connection_call",
    tier,
    summary,
    payload,
    injection_flag: false,
    tier_note: tierNote,
  });

  // Tier-1 (read-only) connector actions auto-run, exactly like any tier-1.
  if (tier === 1) action = await autoExecute(userId, action);
  return { ok: true, action };
}
