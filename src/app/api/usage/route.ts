import { NextResponse } from "next/server";
import { errorResponse, requireUser } from "@/lib/api";
import { getStore } from "@/lib/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const userId = await requireUser();
    const usage = await getStore().getUsage(userId);
    return NextResponse.json({ usage });
  } catch (err) {
    return errorResponse(err);
  }
}
