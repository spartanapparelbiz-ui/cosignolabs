import { getStore } from "./store";
import { approveAction, vetoAction, EngineError } from "./actions/engine";
import type { ActionRecord, WorkspaceMemberRecord, WorkspaceRecord } from "./types";

/**
 * Workspace policy — the ONLY module that grants cross-user powers, and the
 * powers are deliberately small:
 *   - members see each other's PROPOSED tier-2 actions (the shared inbox),
 *   - owners/approvers may approve or veto those tier-2 actions through the
 *     same engine door (recorded as a delegated decision in the audit trail),
 *   - tier-3 (destructive) approvals stay personal to the action's owner,
 *   - the agent gains nothing: a workspace only ever adds HUMANS.
 */

export interface WorkspaceView {
  workspace: WorkspaceRecord;
  members: WorkspaceMemberRecord[];
  me: WorkspaceMemberRecord;
}

/** A workspace-mate's proposal, labeled with who it belongs to. */
export interface DelegatedProposal {
  action: ActionRecord;
  owner_email: string;
}

/** Resolve the caller's workspace + membership, accepting pending invites first. */
export async function myWorkspace(
  userId: string,
  email: string | null
): Promise<WorkspaceView | null> {
  const store = getStore();
  if (email) await store.acceptWorkspaceInvites(userId, email);
  const workspace = await store.getWorkspaceForUser(userId);
  if (!workspace) return null;
  const members = await store.listWorkspaceMembers(workspace.id);
  const me = members.find((m) => m.user_id === userId && m.status === "active");
  if (!me) return null;
  return { workspace, members, me };
}

export function canDecide(role: WorkspaceMemberRecord["role"]): boolean {
  return role === "owner" || role === "approver";
}

/**
 * Workspace-mates' proposed tier-2 actions the caller may decide on.
 * Injection-flagged cards are listed (visibility is honest) but the engine
 * refuses their approval as always.
 */
export async function listDelegatedProposals(
  userId: string,
  email: string | null
): Promise<DelegatedProposal[]> {
  const ws = await myWorkspace(userId, email);
  if (!ws || !canDecide(ws.me.role)) return [];
  const mates = ws.members.filter(
    (m) => m.status === "active" && m.user_id && m.user_id !== userId
  );
  if (mates.length === 0) return [];
  const emailByUser = new Map(mates.map((m) => [m.user_id as string, m.email]));
  const actions = await getStore().listProposedActionsForUsers([...emailByUser.keys()]);
  return actions
    .filter((a) => a.tier === 2)
    .map((a) => ({ action: a, owner_email: emailByUser.get(a.user_id) ?? "member" }));
}

/**
 * Decide a workspace-mate's tier-2 proposal. Ownership, role, and tier are
 * all re-checked HERE at decision time (never trusted from the client), then
 * the engine applies its own guards again (status, injection, tier-2-only
 * for delegates, usage limits).
 */
export async function decideDelegated(
  actorId: string,
  actorEmail: string | null,
  actionId: string,
  decision: "approve" | "veto",
  reason?: string
): Promise<ActionRecord> {
  const ws = await myWorkspace(actorId, actorEmail);
  if (!ws || !canDecide(ws.me.role)) {
    throw new EngineError("forbidden", "you don't have approval rights in a workspace.");
  }
  const proposals = await listDelegatedProposals(actorId, actorEmail);
  const match = proposals.find((p) => p.action.id === actionId);
  if (!match) {
    throw new EngineError("not_found", "we couldn't find that decision in your workspace.");
  }
  const ownerId = match.action.user_id;
  const delegate = { actorId, actorEmail: ws.me.email };
  return decision === "approve"
    ? approveAction(ownerId, actionId, { delegate })
    : vetoAction(ownerId, actionId, reason ?? "", delegate);
}
