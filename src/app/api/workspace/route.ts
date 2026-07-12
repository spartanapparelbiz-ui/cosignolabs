import { NextRequest, NextResponse } from "next/server";
import { ApiError, errorResponse, requireUser } from "@/lib/api";
import { getUserEmail } from "@/lib/auth";
import { enforceLimit } from "@/lib/ratelimit";
import { parseStrict, readJsonBody, workspaceSchema } from "@/lib/schemas";
import { getStore } from "@/lib/store";
import { myWorkspace } from "@/lib/workspace";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * The caller's workspace. GET also accepts any pending invite for the
 * caller's email — signing in IS joining. Member emails are visible to
 * members (that's the product), but user ids are never sent to a client.
 */
export async function GET() {
  try {
    const userId = await requireUser();
    const email = await getUserEmail();
    const ws = await myWorkspace(userId, email);
    if (!ws) return NextResponse.json({ workspace: null });
    return NextResponse.json({
      workspace: { id: ws.workspace.id, name: ws.workspace.name, created_at: ws.workspace.created_at },
      members: ws.members.map((m) => ({
        id: m.id,
        email: m.email,
        role: m.role,
        status: m.status,
        is_me: m.id === ws.me.id,
      })),
      my_role: ws.me.role,
    });
  } catch (err) {
    return errorResponse(err);
  }
}

export async function POST(req: NextRequest) {
  try {
    const userId = await requireUser();
    await enforceLimit("transitionMinute", userId);
    const email = await getUserEmail();
    if (!email) throw new ApiError(400, "no_email", "we couldn't read your account email.");
    const body = parseStrict(workspaceSchema, await readJsonBody(req), "workspace");
    const existing = await myWorkspace(userId, email);
    if (existing) {
      throw new ApiError(409, "already_in_workspace", "you're already in a workspace — leave it first.");
    }
    const workspace = await getStore().createWorkspace(userId, email, body.name);
    await getStore().logAudit(userId, "workspace_created", { name: body.name });
    return NextResponse.json({ workspace: { id: workspace.id, name: workspace.name } });
  } catch (err) {
    return errorResponse(err);
  }
}

/** Owner dissolves the workspace (memberships cascade). */
export async function DELETE() {
  try {
    const userId = await requireUser();
    await enforceLimit("transitionMinute", userId);
    const email = await getUserEmail();
    const ws = await myWorkspace(userId, email);
    if (!ws) throw new ApiError(404, "not_found", "you're not in a workspace.");
    if (ws.me.role !== "owner") {
      throw new ApiError(403, "forbidden", "only the owner can dissolve the workspace.");
    }
    await getStore().deleteWorkspace(ws.workspace.id);
    await getStore().logAudit(userId, "workspace_deleted", { name: ws.workspace.name });
    return NextResponse.json({ ok: true });
  } catch (err) {
    return errorResponse(err);
  }
}
