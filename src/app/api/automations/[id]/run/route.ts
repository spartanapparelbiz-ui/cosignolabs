import { NextRequest, NextResponse } from "next/server";
import { ApiError, errorResponse, requireUser } from "@/lib/api";
import { idParamSchema, parseStrict } from "@/lib/schemas";
import { getStore } from "@/lib/store";
import { runAutomation } from "@/lib/automations";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Run now (also serves as test mode): executes one cycle immediately through
 * the full pipeline. Cards land in the decision inbox exactly as a scheduled
 * run's would — nothing beyond tier-1 reads executes without a signature.
 * The owner's command rate limits apply inside runAutomation.
 */
export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const userId = await requireUser();
    const id = parseStrict(idParamSchema, (await params).id, "automation_id");
    const automation = await getStore().getAutomation(userId, id);
    if (!automation) throw new ApiError(404, "not_found", "we couldn't find that automation.");
    const run = await runAutomation(automation);
    return NextResponse.json({ run });
  } catch (err) {
    return errorResponse(err);
  }
}
