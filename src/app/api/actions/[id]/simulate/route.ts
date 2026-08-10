import { NextResponse } from "next/server";
import { errorResponse, requireUser } from "@/lib/api";
import { enforceLimit } from "@/lib/ratelimit";
import { getStore } from "@/lib/store";
import { simulateAction } from "@/lib/approvals/simulate";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/actions/[id]/simulate — "what would happen if I approved this?"
 *
 * Read-only and side-effect-free BY CONSTRUCTION. It reads the action, the
 * user's rules and the hold, and runs them through the same functions the
 * boundary runs on a real approval — then stops. It writes nothing, calls no
 * provider, decrypts no credential and increments no usage, so there is no
 * path from this route to an executed action.
 *
 * The rate limit is abuse hygiene only; a simulation costs a couple of reads.
 */
export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const userId = await requireUser();
    await enforceLimit("commandMinute", userId);
    const { id } = await params;

    const store = getStore();
    const action = await store.getAction(userId, id);
    if (!action) {
      return NextResponse.json(
        { error: "not_found", message: "that action isn't in your workspace." },
        { status: 404 }
      );
    }

    const [rules, hold] = await Promise.all([
      store.listPermissionRules(userId).catch(() => []),
      store.getHold(userId).catch(() => null),
    ]);

    return NextResponse.json({
      simulation: simulateAction(action, rules, hold?.scope ?? "none"),
    });
  } catch (err) {
    return errorResponse(err);
  }
}
