import { NextRequest, NextResponse } from "next/server";
import { ApiError, errorResponse, requireUser } from "@/lib/api";
import { getUserEmail } from "@/lib/auth";
import { enforceLimit } from "@/lib/ratelimit";
import { idParamSchema, parseStrict, readJsonBody, workspaceMemberPatchSchema } from "@/lib/schemas";
import { getStore } from "@/lib/store";
import { myWorkspace } from "@/lib/workspace";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

/** Owner changes a member's role (owner's own row is untouchable). */
export async function PATCH(req: NextRequest, { params }: Params) {
  try {
    const userId = await requireUser();
    await enforceLimit("transitionMinute", userId);
    const email = await getUserEmail();
    const ws = await myWorkspace(userId, email);
    if (!ws) throw new ApiError(404, "not_found", "you're not in a workspace.");
    if (ws.me.role !== "owner") {
      throw new ApiError(403, "forbidden", "only the owner can change roles.");
    }
    const id = parseStrict(idParamSchema, (await params).id, "member_id");
    const target = ws.members.find((m) => m.id === id);
    if (!target) throw new ApiError(404, "not_found", "we couldn't find that member.");
    if (target.role === "owner") {
      throw new ApiError(400, "invalid_input", "the owner's role can't be changed.");
    }
    const body = parseStrict(workspaceMemberPatchSchema, await readJsonBody(req), "member_patch");
    const member = await getStore().updateWorkspaceMember(ws.workspace.id, id, { role: body.role });
    await getStore().logAudit(userId, "workspace_role_changed", {
      email: target.email,
      role: body.role,
    });
    return NextResponse.json({
      member: member && { id: member.id, email: member.email, role: member.role, status: member.status },
    });
  } catch (err) {
    return errorResponse(err);
  }
}

/** Owner removes anyone (except themselves — dissolve instead); others remove ONLY themselves (leave). */
export async function DELETE(_req: NextRequest, { params }: Params) {
  try {
    const userId = await requireUser();
    await enforceLimit("transitionMinute", userId);
    const email = await getUserEmail();
    const ws = await myWorkspace(userId, email);
    if (!ws) throw new ApiError(404, "not_found", "you're not in a workspace.");
    const id = parseStrict(idParamSchema, (await params).id, "member_id");
    const target = ws.members.find((m) => m.id === id);
    if (!target) throw new ApiError(404, "not_found", "we couldn't find that member.");
    if (target.role === "owner") {
      throw new ApiError(400, "invalid_input", "the owner can't be removed — dissolve the workspace instead.");
    }
    const isSelf = target.id === ws.me.id;
    if (!isSelf && ws.me.role !== "owner") {
      throw new ApiError(403, "forbidden", "only the owner can remove other members.");
    }
    await getStore().removeWorkspaceMember(ws.workspace.id, id);
    await getStore().logAudit(userId, "workspace_member_removed", {
      email: target.email,
      left: isSelf,
    });
    return NextResponse.json({ ok: true });
  } catch (err) {
    return errorResponse(err);
  }
}
