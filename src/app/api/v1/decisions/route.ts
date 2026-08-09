import { NextRequest, NextResponse } from "next/server";
import { errorResponse } from "@/lib/api";
import { listDecisions, orgForKey } from "@/lib/authz/store";

/**
 * GET /api/v1/decisions — the ledger.
 *
 * Read-only by construction: there is no write, update, or delete route for a
 * decision anywhere in the API surface. This is the record an auditor reads.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const m = /^Bearer\s+(.+)$/i.exec((req.headers.get("authorization") ?? "").trim());
    const org = m ? orgForKey(m[1].trim()) : null;
    if (!org) {
      return NextResponse.json(
        { error: "unauthorized", message: "Provide a valid API key as a Bearer token." },
        { status: 401 }
      );
    }
    const limit = Math.min(200, Math.max(1, Number(req.nextUrl.searchParams.get("limit") ?? 50)));
    return NextResponse.json({ decisions: listDecisions(org, limit) });
  } catch (err) {
    return errorResponse(err);
  }
}
