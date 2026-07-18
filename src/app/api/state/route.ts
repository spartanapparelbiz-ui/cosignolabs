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
    const [missions, actions, automations, events, tierSettings] = await Promise.all([
      store.listMissions(userId, 100),
      store.listActions(userId, { limit: 1000 }),
      store.listAutomations(userId),
      store.listEvents(userId),
      store.getTierSettings(userId),
    ]);
    const tiers = Object.fromEntries(tierSettings.map((t) => [t.category, t.tier]));
    const state = assembleState({
      missions,
      actions,
      automations,
      // Only recent events matter for the stream; the lib sorts and caps.
      events: events.slice(-400),
      tiers,
    });
    return NextResponse.json({ state });
  } catch (err) {
    return errorResponse(err);
  }
}
