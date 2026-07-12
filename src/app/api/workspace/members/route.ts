import { NextRequest, NextResponse } from "next/server";
import { ApiError, errorResponse, requireUser } from "@/lib/api";
import { getUserEmail } from "@/lib/auth";
import { enforceLimit } from "@/lib/ratelimit";
import { parseStrict, readJsonBody, workspaceInviteSchema } from "@/lib/schemas";
import { getStore } from "@/lib/store";
import { myWorkspace } from "@/lib/workspace";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_MEMBERS = 8;

/** Invite by email (owner only). The invite activates when that email signs in. */
export async function POST(req: NextRequest) {
  try {
    const userId = await requireUser();
    await enforceLimit("transitionMinute", userId);
    const email = await getUserEmail();
    const ws = await myWorkspace(userId, email);
    if (!ws) throw new ApiError(404, "not_found", "you're not in a workspace.");
    if (ws.me.role !== "owner") {
      throw new ApiError(403, "forbidden", "only the owner can invite members.");
    }
    if (ws.members.length >= MAX_MEMBERS) {
      throw new ApiError(400, "workspace_full", `a workspace holds up to ${MAX_MEMBERS} people.`);
    }
    const body = parseStrict(workspaceInviteSchema, await readJsonBody(req), "workspace_invite");
    try {
      const member = await getStore().inviteWorkspaceMember(
        ws.workspace.id,
        body.email,
        body.role ?? "member"
      );
      await getStore().logAudit(userId, "workspace_member_invited", {
        email: body.email,
        role: member.role,
      });
      return NextResponse.json({
        member: { id: member.id, email: member.email, role: member.role, status: member.status },
      });
    } catch (e) {
      if (e instanceof Error && e.message === "already_invited") {
        throw new ApiError(409, "already_invited", "that email is already in the workspace.");
      }
      throw e;
    }
  } catch (err) {
    return errorResponse(err);
  }
}
