import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Public uptime check. Returns no data beyond liveness. */
export async function GET() {
  return NextResponse.json({ ok: true });
}
