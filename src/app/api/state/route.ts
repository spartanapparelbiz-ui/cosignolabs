import { NextResponse } from "next/server";
import { errorResponse, requireUser } from "@/lib/api";
import { assembleState } from "@/lib/state";
import { getStore } from "@/lib/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Cosigno State — the live condition of delegated work: what's moving, what
 * needs the user, what's watched, what's blocked, plus the state stream and
 * operational notes. Pure assembly (src/lib/state.ts) over stored records;
 * polled by the Presence mark and rendered on Home.
 */
export async function GET() {
  try {
    const userId = await requireUser();
    const store = getStore();
    // This endpoint is polled — both reads are bounded IN THE QUERY and the
    // actions read is a narrow projection (no payload/result JSON), so cost
    // stays flat no matter how much history the account accumulates.
    const [missions, actions, automations, events, tierSettings, hold] = await Promise.all([
      store.listMissions(userId, 100),
      store.listActionHeads(userId, 1000),
      store.listAutomations(userId),
      store.listEvents(userId, undefined, 400),
      store.getTierSettings(userId),
      store.getHold(userId),
    ]);
    const tiers = Object.fromEntries(tierSettings.map((t) => [t.category, t.tier]));
    const state = assembleState({
      missions,
      actions,
      automations,
      events,
      tiers,
      hold: hold.scope,
    });
    return NextResponse.json({ state });
  } catch (err) {
    return errorResponse(err);
  }
}
