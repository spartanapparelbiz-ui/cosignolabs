import type { ActionCategory } from "@/lib/types";

/**
 * The action-type registry.
 *
 * Agents speak in verbs ("refund.issue", "infra.deploy"). cosigno's existing
 * authority model speaks in categories with server-assigned tiers. This maps
 * one to the other, so the new authorization API inherits the SAME floors that
 * already govern the product — including the pinned, un-escalatable ones.
 *
 * An unknown action is never auto-cleared: it falls back to `update_record`
 * (tier 2, approval required). Autonomy is granted explicitly or not at all.
 */

export interface ActionTypeMeta {
  /** Dotted action id an agent sends. */
  id: string;
  /** Existing cosigno category — supplies the un-lowerable policy floor. */
  category: ActionCategory;
  label: string;
  /** Facts implied by the action type itself, unless the caller overrides. */
  implies?: {
    reversible?: boolean;
    production?: boolean;
    credential_change?: boolean;
  };
}

export const ACTION_TYPES: ActionTypeMeta[] = [
  // reads
  { id: "data.search", category: "search", label: "Search data", implies: { reversible: true } },
  { id: "data.summarize", category: "summarize", label: "Summarize content", implies: { reversible: true } },
  { id: "doc.draft", category: "draft", label: "Draft a document", implies: { reversible: true } },
  // writes
  { id: "email.send", category: "send_email", label: "Send email", implies: { reversible: false } },
  { id: "content.post", category: "post_content", label: "Post content", implies: { reversible: false } },
  { id: "record.update", category: "update_record", label: "Update a record", implies: { reversible: true } },
  { id: "webhook.fire", category: "webhook", label: "Fire a webhook", implies: { reversible: false } },
  { id: "budget.spend", category: "spend", label: "Commit spend", implies: { reversible: false } },
  // destructive / money
  { id: "record.delete", category: "delete", label: "Delete records", implies: { reversible: false } },
  { id: "refund.issue", category: "refund", label: "Issue a refund", implies: { reversible: false } },
  { id: "payment.send", category: "payment", label: "Send a payment", implies: { reversible: false } },
  // infrastructure
  {
    id: "infra.deploy",
    category: "update_record",
    label: "Deploy to an environment",
    implies: { production: true, reversible: true },
  },
  {
    id: "access.grant",
    category: "update_record",
    label: "Grant access or permissions",
    implies: { credential_change: true, reversible: true },
  },
  // connected tools
  { id: "tool.call", category: "connection_call", label: "Call a connected tool" },
];

const BY_ID = new Map(ACTION_TYPES.map((a) => [a.id, a]));

/** Registry lookup. Unknown ids resolve to an approval-required fallback. */
export function resolveActionType(id: string): ActionTypeMeta {
  return (
    BY_ID.get(id) ?? {
      id,
      category: "update_record",
      label: "Unregistered action",
    }
  );
}

export function isRegistered(id: string): boolean {
  return BY_ID.has(id);
}
