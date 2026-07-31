import { NextRequest, NextResponse } from "next/server";
import { logInfo } from "@/lib/log";
import { enforceLimit, RateLimitError } from "@/lib/ratelimit";
import { clientIp } from "@/lib/clientIp";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * First-party analytics beacon (§9). Unauthenticated by design — landing-page
 * visitors have no session — but tightly bounded so it can't be abused:
 *   - event names are allowlisted to a short pattern (no free text),
 *   - only a fixed set of coarse enum props is kept (never PII / free text),
 *   - rate-limited per IP (reuses the preview window: 20/min),
 *   - always returns 204 (a beacon reads no response); errors never leak.
 *
 * The event is written to the structured log as `web_event`, so the funnel
 * (visits → demo_started → demo_completed → apply_submitted) is readable in
 * the operator's existing logs with zero third-party tracking.
 */

const EVENT_RE = /^[a-z][a-z_]{2,39}$/;
const SAFE_PROP_KEYS = ["step", "card", "tier", "to", "decision"] as const;

export async function POST(req: NextRequest) {
  try {
    await enforceLimit("trackMinute", clientIp(req));

    const raw = (await req.json().catch(() => null)) as {
      event?: unknown;
      props?: Record<string, unknown>;
    } | null;
    const event = typeof raw?.event === "string" ? raw.event : "";
    if (!EVENT_RE.test(event)) return new NextResponse(null, { status: 204 });

    // Keep only allowlisted, primitive, coarse props — never free text.
    const props: Record<string, string | number | boolean> = {};
    if (raw?.props && typeof raw.props === "object") {
      for (const k of SAFE_PROP_KEYS) {
        const v = raw.props[k];
        if (typeof v === "string" && v.length <= 40) props[k] = v;
        else if (typeof v === "number" || typeof v === "boolean") props[k] = v;
      }
    }

    logInfo("web_event", { event, ...props });
  } catch (err) {
    // A tripped rate limit (or anything else) is silent for a beacon.
    void (err as RateLimitError);
  }
  return new NextResponse(null, { status: 204 });
}
