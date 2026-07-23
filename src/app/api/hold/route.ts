import { NextRequest, NextResponse } from "next/server";
import { errorResponse, requireUser } from "@/lib/api";
import { enforceLimit } from "@/lib/ratelimit";
import { holdSchema, parseStrict, readJsonBody } from "@/lib/schemas";
import { recordSecurityEvent } from "@/lib/securityEvents";
import { getStore } from "@/lib/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Cosigno Hold — the user-level authority brake. Enforced in the engine
 * before any execution (src/lib/actions/engine.ts): while held, nothing new
 * crosses the boundary. Setting it back to "none" is Resume; base
 * permissions are never touched, so resuming restores exactly the prior
 * behavior. Every change is audited.
 */
export async function GET() {
  try {
    const userId = await requireUser();
    const hold = await getStore().getHold(userId);
    return NextResponse.json({ hold });
  } catch (err) {
    return errorResponse(err);
  }
}

export async function POST(req: NextRequest) {
  try {
    const userId = await requireUser();
    await enforceLimit("transitionMinute", userId);
    const body = parseStrict(holdSchema, await readJsonBody(req), "hold");
    const before = await getStore().getHold(userId);
    const hold = await getStore().setHold(userId, body.scope);
    await getStore().logAudit(userId, "hold_changed", { scope: body.scope });
    // Durable security events: scope "all" is the Emergency Stop — a server
    // state consulted by the engine AND by every scheduled tick, never a UI
    // switch. Engage/release are both recorded.
    if (body.scope === "all" && before.scope !== "all") {
      await recordSecurityEvent(userId, "emergency_stop_engaged", {
        detail: { previous: before.scope },
      });
    } else if (body.scope !== "all" && before.scope === "all") {
      await recordSecurityEvent(userId, "emergency_stop_released", {
        detail: { now: body.scope },
      });
    } else if (body.scope !== before.scope) {
      await recordSecurityEvent(
        userId,
        body.scope === "none" ? "hold_released" : "hold_engaged",
        { detail: { from: before.scope, to: body.scope } }
      );
    }
    return NextResponse.json({ hold });
  } catch (err) {
    return errorResponse(err);
  }
}
