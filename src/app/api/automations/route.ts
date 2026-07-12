import { NextRequest, NextResponse } from "next/server";
import { errorResponse, requireUser } from "@/lib/api";
import { enforceLimit } from "@/lib/ratelimit";
import { automationSchema, parseStrict, readJsonBody } from "@/lib/schemas";
import { getStore } from "@/lib/store";
import { nextRunAt } from "@/lib/automations";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** List the user's automations (with their recent runs fetched separately). */
export async function GET() {
  try {
    const userId = await requireUser();
    const automations = await getStore().listAutomations(userId);
    return NextResponse.json({ automations });
  } catch (err) {
    return errorResponse(err);
  }
}

/** Create a recurring mission. First run is scheduled one interval out. */
export async function POST(req: NextRequest) {
  try {
    const userId = await requireUser();
    await enforceLimit("transitionMinute", userId);
    const body = parseStrict(automationSchema, await readJsonBody(req), "automation");
    const automation = await getStore().createAutomation({
      user_id: userId,
      name: body.name,
      command: body.command,
      interval_hours: body.interval_hours,
      next_run_at: nextRunAt(body.interval_hours),
    });
    await getStore().logAudit(userId, "automation_created", {
      name: body.name,
      interval_hours: body.interval_hours,
    });
    return NextResponse.json({ automation });
  } catch (err) {
    return errorResponse(err);
  }
}
