import { NextRequest, NextResponse } from "next/server";
import { approveAction } from "@/lib/actions/engine";
import { errorResponse, requireUser } from "@/lib/api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

export async function POST(req: NextRequest, { params }: Params) {
  try {
    const userId = await requireUser();
    const { id } = await params;
    const body = await req.json().catch(() => ({}));
    const action = await approveAction(userId, id, {
      confirmation:
        typeof body.confirmation === "string" ? body.confirmation : undefined,
      payload:
        body.payload && typeof body.payload === "object" ? body.payload : undefined,
    });
    return NextResponse.json({ action });
  } catch (err) {
    return errorResponse(err);
  }
}
