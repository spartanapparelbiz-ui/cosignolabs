import { NextRequest, NextResponse } from "next/server";
import { ApiError, errorResponse, requireUser } from "@/lib/api";
import { enforceLimit } from "@/lib/ratelimit";
import { parseStrict, readJsonBody, skillActionSchema } from "@/lib/schemas";
import { installedKeys, installSkill, SKILLS, uninstallSkill } from "@/lib/skills";
import { getStore } from "@/lib/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** The skill catalog with the user's install state. */
export async function GET() {
  try {
    const userId = await requireUser();
    const automations = await getStore().listAutomations(userId);
    const installed = installedKeys(automations);
    return NextResponse.json({
      skills: SKILLS.map((s) => ({
        key: s.key,
        name: s.name,
        tagline: s.tagline,
        items: s.items.map((i) => ({ name: i.name, mode: i.mode, interval_hours: i.interval_hours })),
        installed: installed.has(s.key),
      })),
    });
  } catch (err) {
    return errorResponse(err);
  }
}

/** Install or uninstall one skill — it only ever touches its own rules. */
export async function POST(req: NextRequest) {
  try {
    const userId = await requireUser();
    await enforceLimit("transitionMinute", userId);
    const body = parseStrict(skillActionSchema, await readJsonBody(req), "skill");
    try {
      const count =
        body.action === "install"
          ? await installSkill(userId, body.key)
          : await uninstallSkill(userId, body.key);
      return NextResponse.json({ ok: true, count });
    } catch (e) {
      if (e instanceof Error && e.message === "unknown_skill") {
        throw new ApiError(404, "not_found", "that skill doesn't exist.");
      }
      throw e;
    }
  } catch (err) {
    return errorResponse(err);
  }
}
