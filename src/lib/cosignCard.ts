import type { ActionRecord } from "./types";
import { signRequired } from "./sign";
import { effectLine, reversibilityChip } from "./actionPresentation";
import { planHash } from "./planHash";

/**
 * CoSign Card — the structured, server-computed descriptor of a prepared
 * action, presenting every field the approval brief requires:
 *   goal · exact proposed action · recipients · destinations · connected apps
 *   · files/data shared · timing · monetary impact · permission scope
 *   · reversibility · risk level · expected result · the controls available.
 *
 * PURE and total (never throws on odd payloads): the card is a projection of
 * the authoritative action row, not a second source of truth. Authorization is
 * always decided by the engine against stored state — the card only describes
 * what the user is being asked to authorize, and carries the current plan hash
 * so the UI can show when a plan changed under a CoSign Room.
 */

export type RiskLevel = "read_only" | "routine" | "consequential" | "locked";

export interface CosignControl {
  action: "edit" | "reject" | "approve" | "sign";
  label: string;
  /** True when this control is the deliberate authorization for the card. */
  primary: boolean;
}

export interface CosignCard {
  action_id: string;
  /** The mission goal or a synthesized goal line for a standalone card. */
  goal: string;
  /** One-sentence exact effect (never model prose). */
  proposed_action: string;
  category: ActionRecord["category"];
  tier: ActionRecord["tier"];
  risk_level: RiskLevel;
  risk_label: string;
  recipients: string[];
  destinations: string[];
  connected_apps: string[];
  shared_data: string[];
  timing: string;
  monetary_impact: { amount: string; direction: "out" | "in" | "none" } | null;
  permission_scope: string;
  reversibility: { label: string; reversible: boolean };
  expected_result: string;
  requires_signature: boolean;
  controls: CosignControl[];
  /** Set when external content tried to steer the agent — card is unapprovable. */
  flagged: boolean;
  plan_hash: string;
}

function str(v: unknown): string | null {
  if (typeof v === "string" && v.trim()) return v.trim();
  if (typeof v === "number" && Number.isFinite(v)) return String(v);
  return null;
}

function list(v: unknown): string[] {
  if (Array.isArray(v)) return v.map(str).filter((x): x is string => Boolean(x));
  const s = str(v);
  return s ? [s] : [];
}

function riskOf(action: Pick<ActionRecord, "category" | "tier">): {
  level: RiskLevel;
  label: string;
} {
  if (action.tier === 3) return { level: "locked", label: "Locked — typed confirmation required" };
  if (action.tier === 1) return { level: "read_only", label: "Read-only or reversible" };
  if (["send_email", "post_content", "webhook", "spend"].includes(action.category)) {
    return { level: "consequential", label: "Consequential — leaves your workspace" };
  }
  return { level: "routine", label: "Routine change" };
}

function moneyOf(action: Pick<ActionRecord, "category" | "payload">): CosignCard["monetary_impact"] {
  const amount = str(action.payload?.amount);
  if (!amount) return action.category === "payment" || action.category === "refund" || action.category === "spend"
    ? { amount: "amount not specified", direction: action.category === "refund" ? "in" : "out" }
    : null;
  const direction: "out" | "in" | "none" =
    action.category === "refund" ? "in" : action.category === "payment" || action.category === "spend" ? "out" : "none";
  return { amount, direction };
}

/** How this action shares/moves data outside the workspace, in plain words. */
function sharedData(action: Pick<ActionRecord, "category" | "payload">): string[] {
  const p = action.payload ?? {};
  const out: string[] = [];
  if (action.category === "send_email") {
    if (str(p.subject)) out.push(`Email subject: "${str(p.subject)}"`);
    if (p.body || p.draft) out.push("Email body (prepared draft)");
    if (Array.isArray(p.attachments) && p.attachments.length) out.push(`${p.attachments.length} attachment(s)`);
  }
  if (action.category === "post_content" && (p.body || p.content)) out.push("Post content (prepared)");
  if (action.category === "update_record" && p.changes) out.push("Record field changes");
  const files = list(p.files).concat(list(p.file));
  for (const f of files) out.push(`File: ${f}`);
  return out;
}

function connectedApps(action: Pick<ActionRecord, "category" | "payload">): string[] {
  if (action.category === "connection_call") {
    const name = str(action.payload?.connection_name) ?? str(action.payload?.provider_key);
    return name ? [name] : ["a connected app"];
  }
  return [];
}

function permissionScope(action: Pick<ActionRecord, "category" | "tier">): string {
  const r = reversibilityChip(action.category, action.tier);
  switch (action.category) {
    case "send_email":
      return "Send mail on your behalf via the connected account";
    case "post_content":
      return "Publish content to an external surface";
    case "update_record":
      return "Modify a record in a connected tool";
    case "spend":
      return "Commit spend under your configured cap";
    case "webhook":
      return "Fire your configured outbound webhook";
    case "payment":
      return "Move money out (locked action)";
    case "refund":
      return "Return money to a customer (locked action)";
    case "delete":
      return "Permanently delete data (locked action)";
    case "connection_call":
      return "Run the enabled, consented operation on the connected app";
    default:
      return r.grade === "safe" ? "Read-only within your workspace" : "Change data in a connected tool";
  }
}

/** Build a CoSign Card from an action row (+ optional mission goal). */
export function buildCosignCard(action: ActionRecord, missionGoal?: string): CosignCard {
  const p = action.payload ?? {};
  const risk = riskOf(action);
  const rev = reversibilityChip(action.category, action.tier);
  const requiresSig = signRequired(action.category, action.tier);

  const recipients = list(p.to).concat(list(p.recipient)).concat(list(p.recipients));
  const destinations = list(p.destination).concat(list(p.channel)).concat(list(p.endpoint));

  const controls: CosignControl[] = [
    { action: "edit", label: "Edit", primary: false },
    { action: "reject", label: "Reject", primary: false },
    requiresSig
      ? { action: "sign", label: action.tier === 3 ? "Type to confirm & sign" : "Sign", primary: true }
      : { action: "approve", label: "Approve", primary: true },
  ];

  return {
    action_id: action.id,
    goal: missionGoal ?? action.summary,
    proposed_action: effectLine(action),
    category: action.category,
    tier: action.tier,
    risk_level: risk.level,
    risk_label: risk.label,
    recipients,
    destinations,
    connected_apps: connectedApps(action),
    shared_data: sharedData(action),
    timing:
      str(p.when) ?? str(p.schedule) ?? str(p.send_at) ?? "On approval (no delay)",
    monetary_impact: moneyOf(action),
    permission_scope: permissionScope(action),
    reversibility: { label: rev.label, reversible: rev.grade === "safe" },
    expected_result:
      str(p.expected_result) ??
      (action.result && typeof action.result === "object"
        ? str((action.result as Record<string, unknown>).summary) ?? action.summary
        : action.summary),
    requires_signature: requiresSig,
    controls,
    flagged: action.injection_flag,
    plan_hash: planHash(action.payload),
  };
}
