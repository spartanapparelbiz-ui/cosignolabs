import { NextResponse } from "next/server";
import { isProduction } from "@/lib/env";
import { errorResponse, requireUser } from "@/lib/api";
import { createApiKey, listApiKeys } from "@/lib/authz/store";

/**
 * POST /api/v1/keys/bootstrap — DEVELOPMENT ONLY, and session-authenticated.
 *
 * Mints a demo API key so the authorization API can be driven end-to-end
 * locally. Two independent guards, because a key-minting endpoint is the last
 * place to be relaxed:
 *   1. 404 in production — real keys come from the authenticated console.
 *   2. requires a session even in development, so it upholds the same
 *      "every API route 401s unauthenticated" invariant as the rest of /api.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST() {
  try {
    if (isProduction()) {
      return NextResponse.json({ error: "not_found" }, { status: 404 });
    }
    await requireUser();

    const org = "org_demo";
    const { key, record } = createApiKey(org, `dev-${listApiKeys(org).length + 1}`);
    return NextResponse.json({
      org,
      key_id: record.id,
      key,
      note: "development only — shown once, never stored in plaintext",
    });
  } catch (err) {
    return errorResponse(err);
  }
}
