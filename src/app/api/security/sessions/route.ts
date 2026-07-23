import { NextRequest, NextResponse } from "next/server";
import { ApiError, errorResponse, requireUser } from "@/lib/api";
import { clerkConfigured } from "@/lib/auth";
import { enforceLimit } from "@/lib/ratelimit";
import { parseStrict, readJsonBody, sessionRevokeSchema } from "@/lib/schemas";
import { recordSecurityEvent } from "@/lib/securityEvents";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Device/session management, backed by the auth provider's real session
 * store (Clerk). Lists the user's active sessions and revokes one — or all
 * of them ("sign out everywhere"). Revocation is server-side through Clerk's
 * backend API: a revoked session token stops verifying everywhere within
 * Clerk's propagation window. Demo mode (no Clerk) reports honestly that
 * session management needs the auth provider.
 */

interface SessionView {
  id: string;
  status: string;
  last_active_at: string | null;
  created_at: string | null;
  expire_at: string | null;
  city: string | null;
  device: string | null;
  is_current_shape: boolean;
}

export async function GET() {
  try {
    const userId = await requireUser();
    if (!clerkConfigured()) {
      return NextResponse.json({ configured: false, sessions: [] });
    }
    const { clerkClient } = await import("@clerk/nextjs/server");
    const client = await clerkClient();
    const list = await client.sessions.getSessionList({ userId, status: "active" });
    const sessions: SessionView[] = list.data.map((s) => {
      const activity = (s as unknown as {
        latestActivity?: {
          city?: string;
          browserName?: string;
          deviceType?: string;
          isMobile?: boolean;
        };
      }).latestActivity;
      return {
        id: s.id,
        status: s.status,
        last_active_at: s.lastActiveAt ? new Date(s.lastActiveAt).toISOString() : null,
        created_at: s.createdAt ? new Date(s.createdAt).toISOString() : null,
        expire_at: s.expireAt ? new Date(s.expireAt).toISOString() : null,
        city: activity?.city ?? null,
        device:
          [activity?.deviceType, activity?.browserName].filter(Boolean).join(" · ") || null,
        is_current_shape: false,
      };
    });
    return NextResponse.json({ configured: true, sessions });
  } catch (err) {
    return errorResponse(err);
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const userId = await requireUser();
    await enforceLimit("transitionMinute", userId);
    if (!clerkConfigured()) {
      throw new ApiError(501, "not_configured", "session management needs the auth provider.");
    }
    const body = parseStrict(sessionRevokeSchema, await readJsonBody(req), "session_revoke");
    const { clerkClient } = await import("@clerk/nextjs/server");
    const client = await clerkClient();

    if (body.all) {
      const list = await client.sessions.getSessionList({ userId, status: "active" });
      for (const s of list.data) {
        await client.sessions.revokeSession(s.id).catch(() => {});
      }
      await recordSecurityEvent(userId, "all_sessions_revoked", {
        detail: { count: list.data.length },
      });
      return NextResponse.json({ ok: true, revoked: list.data.length });
    }

    // Single-session revoke: verify the session belongs to THIS user before
    // touching it — a session id is never trusted on its own.
    const session = await client.sessions.getSession(body.sessionId!);
    if (!session || session.userId !== userId) {
      throw new ApiError(404, "not_found", "that session wasn't found.");
    }
    await client.sessions.revokeSession(session.id);
    await recordSecurityEvent(userId, "session_revoked", {
      detail: { session_id: session.id },
    });
    return NextResponse.json({ ok: true, revoked: 1 });
  } catch (err) {
    return errorResponse(err);
  }
}
