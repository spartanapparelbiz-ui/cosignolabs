import { NextRequest, NextResponse } from "next/server";
import { errorResponse, requireUser } from "@/lib/api";
import { enforceLimit } from "@/lib/ratelimit";
import { memoryPrefsSchema, memorySchema, parseStrict, readJsonBody } from "@/lib/schemas";
import { getStore } from "@/lib/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** The user's memory: notes + the master switch. Never written by the agent. */
export async function GET() {
  try {
    const userId = await requireUser();
    const [memories, prefs] = await Promise.all([
      getStore().listMemories(userId),
      getStore().getPrefs(userId),
    ]);
    return NextResponse.json({ memories, memory_enabled: prefs.memory_enabled });
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

/** Master switch: disable memory entirely (nothing is fed to the planner). */
export async function PATCH(req: NextRequest) {
  try {
    const userId = await requireUser();
    await enforceLimit("transitionMinute", userId);
    const body = parseStrict(memoryPrefsSchema, await readJsonBody(req), "memory_prefs");
    await getStore().setMemoryEnabled(userId, body.memory_enabled);
    return NextResponse.json({ ok: true, memory_enabled: body.memory_enabled });
  } catch (err) {
    return errorResponse(err);
  }
}
