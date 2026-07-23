import { NextResponse } from "next/server";
import { errorResponse, requireUser } from "@/lib/api";
import { getStore } from "@/lib/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** The user's own durable security events (Security Center feed). */
export async function GET() {
  try {
    const userId = await requireUser();
    const events = await getStore().listSecurityEvents(userId, 100);
    return NextResponse.json({ events });
  } catch (err) {
    return errorResponse(err);
  }
}
