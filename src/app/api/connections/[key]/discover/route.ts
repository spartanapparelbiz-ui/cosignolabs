import { NextRequest, NextResponse } from "next/server";
import { errorResponse, requireUser } from "@/lib/api";
import { enforceLimit } from "@/lib/ratelimit";
import { describeConnection } from "@/lib/integrations/engine/describe";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/connections/[key]/discover — the connection, described.
 * `key` is the connection id.
 *
 * Every kind goes through the one engine: a built-in provider, a custom HTTP
 * API, and an MCP server all come back in the same shape, so the interface
 * that renders them is identical and a connector cosigno has never seen
 * presents exactly like a first-party one.
 *
 * Both halves stay measured. `facts` come from live read-only calls and are
 * empty (with a stated limitation) for kinds that cannot be inventoried.
 * `capabilities` are derived from what the connection declares plus the SERVER
 * tier rule the approval engine enforces at execution — so the checklist can
 * never advertise a weaker gate than the action actually gets.
 *
 * POST because built-in discovery makes live upstream calls; rate-limited for
 * the same reason.
 */
export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ key: string }> }
) {
  try {
    const userId = await requireUser();
    // Discovery costs several upstream calls, so it shares the transition
    // budget rather than being freely repeatable.
    await enforceLimit("transitionMinute", userId);
    const { key } = await params;

    const model = await describeConnection(userId, key);
    if (!model) {
      return NextResponse.json(
        { ok: false, facts: [], limitations: [], capabilities: [], error: "Connection not found." },
        { status: 404 }
      );
    }

    return NextResponse.json(
      { ok: !model.discoveryError, ...model, error: model.discoveryError },
      { headers: { "cache-control": "no-store" } }
    );
  } catch (err) {
    return errorResponse(err);
  }
}
