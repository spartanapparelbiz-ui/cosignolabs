import { NextRequest, NextResponse } from "next/server";
import { vetoAction } from "@/lib/actions/engine";
import { errorResponse, requireUser } from "@/lib/api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

export async function POST(req: NextRequest, { params }: Params) {
  try {
    const userId = await requireUser();
    const { id } = await params;
    const body = await req.json().catch(() => ({}));
    const reason =
      typeof body.reason === "string" ? body.reason.trim().slice(0, 500) : "";
    const action = await vetoAction(userId, id, reason);
    return NextResponse.json({ action });
  } catch (err) {
    return errorResponse(err);
  }
}
