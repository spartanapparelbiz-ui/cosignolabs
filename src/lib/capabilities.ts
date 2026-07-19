import { signRequired } from "./sign";
import { CATEGORIES, type ActionCategory, type Tier } from "./types";

/**
 * "What can you do right now?" — an HONEST capability report built only from
 * what actually exists: the user's connected apps and their real permission
 * (tier) settings. It never advertises an integration the user doesn't have,
 * and it's explicit about what needs the user's authority. This is the
 * never-fake-capability rule (#22) turned into a feature.
 */

export interface CapabilityReport {
  /** Apps actually connected right now. */
  connected: string[];
  /** What cosigno can do now without crossing the boundary. */
  can_now: string[];
  /** What it can prepare but needs your approval or signature to complete. */
  needs_you: string[];
  /** Honest note when little is connected. */
  note: string | null;
}

/** Categories that are always available (read-only / reversible, internal). */
const ALWAYS_CAN = [
  "Find and gather relevant context across your connected tools",
  "Summarize and organize what it finds",
  "Prepare drafts and documents (saved, never sent)",
];

const NEEDS_LABEL: Partial<Record<ActionCategory, string>> = {
  send_email: "Send an external email",
  post_content: "Publish or post something",
  spend: "Commit spend under your rules",
  webhook: "Fire an outbound webhook",
  update_record: "Update a record in a connected tool",
  delete: "Delete something",
  refund: "Issue a refund",
  payment: "Move money out",
};

export function capabilityReport(
  connectedApps: string[],
  tiers: Partial<Record<ActionCategory, Tier>>
): CapabilityReport {
  const canNow = [...ALWAYS_CAN];
  for (const app of connectedApps) canNow.push(`Work with ${app}`);

  const needsYou: string[] = [];
  for (const meta of Object.values(CATEGORIES)) {
    if (meta.category === "connection_call") continue; // created by the runtime, not planned
    const tier = tiers[meta.category] ?? meta.defaultTier;
    if (tier === 1) continue; // auto — already in "can now"
    const label = NEEDS_LABEL[meta.category] ?? meta.label;
    const how = signRequired(meta.category, tier === 3 ? 3 : 2) ? "signature" : "one-click approval";
    needsYou.push(`${label} — needs your ${how}`);
  }

  return {
    connected: connectedApps,
    can_now: canNow,
    needs_you: needsYou,
    note:
      connectedApps.length === 0
        ? "No apps are connected yet, so cosigno can prepare and organize but can't act in your tools. Connect an app to widen what it can do."
        : null,
  };
}
