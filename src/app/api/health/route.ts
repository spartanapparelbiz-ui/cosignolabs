import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Public uptime check. Returns liveness plus build provenance — the short
 * commit hash and build timestamp stamped in at build time (next.config.mjs).
 * The pair costs nothing to expose and is what lets `verify:deploy` tell a
 * healthy fresh deploy apart from a healthy STALE one, which otherwise look
 * identical from outside.
 */
export async function GET() {
  return NextResponse.json({
    ok: true,
    commit: process.env.BUILD_COMMIT || null,
    built_at: process.env.BUILD_AT || null,
  });
}
