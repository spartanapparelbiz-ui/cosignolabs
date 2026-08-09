import { NextRequest, NextResponse } from "next/server";
import { ApiError, errorResponse, requireUser } from "@/lib/api";
import { enforceLimit } from "@/lib/ratelimit";
import { browserControlSchema, idParamSchema, parseStrict, readJsonBody } from "@/lib/schemas";
import { getStore } from "@/lib/store";
import { getBrowserProvider, isLiveBrowser, remoteBrowserProvider } from "@/lib/browser";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

type Params = { params: Promise<{ id: string }> };

/**
 * The browser view's data: the mission's session (current page, status,
 * preview), its event log (plain-language actions), the products actually
 * collected, and the steps. Everything is the caller's own — session access
 * is strictly workspace-scoped, screenshots included.
 */
export async function GET(_req: NextRequest, { params }: Params) {
  try {
    const userId = await requireUser();
    const id = parseStrict(idParamSchema, (await params).id, "mission_id");
    const store = getStore();
    const mission = await store.getMission(userId, id);
    if (!mission) throw new ApiError(404, "not_found", "we couldn't find that mission.");

    const [sessions, steps, products] = await Promise.all([
      store.listBrowserSessions(userId, id),
      store.listMissionSteps(userId, id),
      store.listBrowserProducts(userId, id),
    ]);
    const session = sessions[sessions.length - 1] ?? null;
    const events = session ? await store.listBrowserActions(userId, session.id) : [];

    return NextResponse.json({
      mission,
      session,
      // The event log the user reads: plain purposes + honest outcomes only.
      events: events.map((e) => ({
        id: e.id,
        purpose: e.purpose,
        kind: e.kind,
        target: e.target,
        state: e.state,
        summary: typeof e.detail.summary === "string" ? e.detail.summary : null,
        created_at: e.created_at,
      })),
      products,
      steps,
      live: isLiveBrowser(),
    });
  } catch (err) {
    return errorResponse(err);
  }
}

/** Pause / resume / stop the browser session, or refresh the page preview. */
export async function POST(req: NextRequest, { params }: Params) {
  try {
    const userId = await requireUser();
    await enforceLimit("transitionMinute", userId);
    const id = parseStrict(idParamSchema, (await params).id, "mission_id");
    const { op } = parseStrict(browserControlSchema, await readJsonBody(req), "browser_control");

    const store = getStore();
    const mission = await store.getMission(userId, id);
    if (!mission) throw new ApiError(404, "not_found", "we couldn't find that mission.");
    const sessions = await store.listBrowserSessions(userId, id);
    const session = sessions[sessions.length - 1] ?? null;
    if (!session) throw new ApiError(404, "no_session", "this mission hasn't opened a browser yet.");

    const TERMINAL = new Set(["expired", "stopped", "failed_safely", "completed"]);

    if (op === "pause") {
      if (TERMINAL.has(session.status)) throw new ApiError(409, "ended", "the browser session has already ended.");
      const updated = await store.updateBrowserSession(userId, session.id, {
        status: "paused",
        last_action: "Paused by you — no pages are being opened.",
      });
      return NextResponse.json({ session: updated });
    }

    if (op === "resume") {
      if (session.status !== "paused") throw new ApiError(409, "not_paused", "the session isn't paused.");
      const updated = await store.updateBrowserSession(userId, session.id, {
        status: "active",
        last_action: "Resumed.",
      });
      return NextResponse.json({ session: updated });
    }

    if (op === "stop") {
      if (!TERMINAL.has(session.status)) {
        if (session.provider_ref) {
          await getBrowserProvider()
            .destroySession({ providerRef: session.provider_ref, provider: session.provider, simulated: session.simulated })
            .catch(() => {});
        }
        const updated = await store.updateBrowserSession(userId, session.id, {
          status: "stopped",
          stop_reason: "Stopped by you. Everything found so far was kept.",
          last_action: "Stopped by you.",
        });
        return NextResponse.json({ session: updated });
      }
      return NextResponse.json({ session });
    }

    // refresh: re-read the current page honestly (live only — the sandbox
    // placeholder never pretends to be a live page).
    if (!session.current_url) {
      throw new ApiError(409, "no_page", "no page is open yet.");
    }
    if (isLiveBrowser() && !TERMINAL.has(session.status)) {
      const shot = await remoteBrowserProvider.screenshot(session.current_url);
      const updated = await store.updateBrowserSession(userId, session.id, {
        ...(shot ? { screenshot_ref: shot } : {}),
        last_action: shot ? "Preview refreshed." : "The preview couldn't be captured right now.",
      });
      return NextResponse.json({ session: updated });
    }
    return NextResponse.json({ session });
  } catch (err) {
    return errorResponse(err);
  }
}
