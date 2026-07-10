import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { errorResponse, requireUser } from "@/lib/api";
import { enforceLimit } from "@/lib/ratelimit";
import { parseStrict, readJsonBody } from "@/lib/schemas";
import { getStore } from "@/lib/store";
import { proposeConnectorAction } from "@/lib/integrations/runtime/propose";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const schema = z
  .object({
    capability: z.string().trim().min(1).max(80),
    args: z.record(z.string(), z.unknown()).optional(),
    sessionId: z.string().trim().min(1).max(80).optional(),
  })
  .strict();

/**
 * Propose a connector capability as an action card. The SERVER assigns the
 * tier from the capability's risk (never the caller); the card then flows
 * through the normal approval → signature → execute engine. This is the single
 * door a connector uses to reach the outside world — it can propose, never
 * bypass. `requestedTier` is intentionally NOT accepted from the client: the
 * risk class is authoritative.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ key: string }> }
) {
  try {
    const userId = await requireUser();
    await enforceLimit("commandMinute", userId);
    const { key: id } = await params;
    const body = parseStrict(schema, await readJsonBody(req), "propose_connector");

    const store = getStore();
    // Use the given session or the newest one, else open a fresh one.
    let sessionId = body.sessionId;
    if (!sessionId) {
      const sessions = await store.listSessions(userId);
      sessionId = sessions[0]?.id ?? (await store.createSession(userId, "connector action")).id;
    }

    const res = await proposeConnectorAction(userId, sessionId, {
      connectionId: id,
      capability: body.capability,
      args: body.args ?? {},
    });
    if (!res.ok || !res.action) {
      return NextResponse.json({ error: "propose_failed", message: res.error }, { status: 400 });
    }
    return NextResponse.json({ action: res.action, sessionId });
  } catch (err) {
    return errorResponse(err);
  }
}
