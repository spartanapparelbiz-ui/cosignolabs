import { NextRequest, NextResponse } from "next/server";
import { errorResponse, requireUser } from "@/lib/api";
import { enforceLimit } from "@/lib/ratelimit";
import { learnedPreferences } from "@/lib/learning";
import {
  memoryPrefsSchema,
  memorySchema,
  parseStrict,
  preferenceMuteSchema,
  readJsonBody,
} from "@/lib/schemas";
import { getStore } from "@/lib/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * The user's memory. Two kinds, deliberately kept apart:
 *  - `memories`: notes the USER wrote. The agent never writes here.
 *  - `learned`: what cosigno inferred from the user's own approvals, edits and
 *    vetoes. Derived on read, never stored, and shown with the count behind it
 *    so a person can check the arithmetic and switch off any conclusion.
 *
 * Both are governed by the same master switch — see learnedPreferences().
 */
export async function GET() {
  try {
    const userId = await requireUser();
    const [memories, prefs, learned] = await Promise.all([
      getStore().listMemories(userId),
      getStore().getPrefs(userId),
      learnedPreferences(userId),
    ]);
    return NextResponse.json({
      memories,
      memory_enabled: prefs.memory_enabled,
      learned,
      muted_preferences: prefs.muted_preferences,
    });
  } catch (err) {
    return errorResponse(err);
  }
}

export async function POST(req: NextRequest) {
  try {
    const userId = await requireUser();
    await enforceLimit("transitionMinute", userId);
    const body = parseStrict(memorySchema, await readJsonBody(req), "memory");
    const memory = await getStore().createMemory(userId, body.content);
    return NextResponse.json({ memory });
  } catch (err) {
    return errorResponse(err);
  }
}

/**
 * Two controls, both the user's:
 *  - the master switch, which stops everything (notes AND observations)
 *    reaching the planner;
 *  - a per-preference mute, which overrules one thing cosigno concluded
 *    without deleting the decisions it was concluded from.
 */
export async function PATCH(req: NextRequest) {
  try {
    const userId = await requireUser();
    await enforceLimit("transitionMinute", userId);
    const raw = await readJsonBody(req);

    if (raw && typeof raw === "object" && "preference_key" in raw) {
      const body = parseStrict(preferenceMuteSchema, raw, "preference_mute");
      const muted = await getStore().setPreferenceMuted(
        userId,
        body.preference_key,
        body.muted
      );
      return NextResponse.json({ ok: true, muted_preferences: muted });
    }

    const body = parseStrict(memoryPrefsSchema, raw, "memory_prefs");
    await getStore().setMemoryEnabled(userId, body.memory_enabled);
    return NextResponse.json({ ok: true, memory_enabled: body.memory_enabled });
  } catch (err) {
    return errorResponse(err);
  }
}
