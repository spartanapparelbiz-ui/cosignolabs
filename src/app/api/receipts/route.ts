import { NextResponse } from "next/server";
import { errorResponse, requireUser } from "@/lib/api";
import { getStore } from "@/lib/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Proof Receipts — the immutable record of every attempted external action.
 * Read-only; the caller only ever sees their own receipts (userId-scoped).
 */
export async function GET() {
  try {
    const userId = await requireUser();
    const receipts = await getStore().listReceipts(userId, 100);
    return NextResponse.json({ receipts });
  } catch (err) {
    return errorResponse(err);
  }
}
