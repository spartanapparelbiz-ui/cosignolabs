import { NextRequest, NextResponse } from "next/server";
import { ApiError, errorResponse, requireUser } from "@/lib/api";
import { enforceLimit } from "@/lib/ratelimit";
import { automationPatchSchema, idParamSchema, parseStrict, readJsonBody } from "@/lib/schemas";
import { getStore } from "@/lib/store";
import { nextRunAt } from "@/lib/automations";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

/** One automation + its recent run history. */
export async function GET(_req: NextRequest, { params }: Params) {
  try {
    const userId = await requireUser();
    const id = parseStrict(idParamSchema, (await params).id, "automation_id");
    const automation = await getStore().getAutomation(userId, id);
    if (!automation) throw new ApiError(404, "not_found", "we couldn't find that automation.");
    const runs = await getStore().listAutomationRuns(userId, id, 20);
    return NextResponse.json({ automation, runs });
  } catch (err) {
    return errorResponse(err);
  }
}

/** Edit / pause / resume. Changing the interval reschedules from now. */
export async function PATCH(req: NextRequest, { params }: Params) {
  try {
    const userId = await requireUser();
    await enforceLimit("transitionMinute", userId);
    const id = parseStrict(idParamSchema, (await params).id, "automation_id");
    const body = parseStrict(automationPatchSchema, await readJsonBody(req), "automation_patch");
    const patch: Record<string, unknown> = { ...body };
    if (body.interval_hours) patch.next_run_at = nextRunAt(body.interval_hours);
    const automation = await getStore().updateAutomation(userId, id, patch);
    if (!automation) throw new ApiError(404, "not_found", "we couldn't find that automation.");
    return NextResponse.json({ automation });
  } catch (err) {
    return errorResponse(err);
  }
}

/** The kill switch: delete the automation (runs cascade). */
export async function DELETE(_req: NextRequest, { params }: Params) {
  try {
    const userId = await requireUser();
    await enforceLimit("transitionMinute", userId);
    const id = parseStrict(idParamSchema, (await params).id, "automation_id");
    await getStore().deleteAutomation(userId, id);
    await getStore().logAudit(userId, "automation_deleted", { id });
    return NextResponse.json({ ok: true });
  } catch (err) {
    return errorResponse(err);
  }
}
