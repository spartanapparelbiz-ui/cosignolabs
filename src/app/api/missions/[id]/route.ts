import { NextRequest, NextResponse } from "next/server";
import { ApiError, errorResponse, requireUser } from "@/lib/api";
import { idParamSchema, parseStrict } from "@/lib/schemas";
import { getStore } from "@/lib/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, { params }: Params) {
  try {
    const userId = await requireUser();
    const id = parseStrict(idParamSchema, (await params).id, "mission_id");
    const mission = await getStore().getMission(userId, id);
    if (!mission) throw new ApiError(404, "not_found", "we couldn't find that mission.");
    const [steps, sources] = await Promise.all([
      getStore().listMissionSteps(userId, id),
      getStore().listMissionSources(userId, id),
    ]);
    return NextResponse.json({ mission, steps, sources });
  } catch (err) {
    return errorResponse(err);
  }
}
