import { NextResponse } from "next/server";
import { errorResponse, requireUser } from "@/lib/api";
import { collectTwins } from "@/lib/twin/collect";

/**
 * GET /api/twin — the digital twin of every connected application.
 *
 * Each twin is derived from the provider's REAL declared actions (or, for MCP
 * connections, the tool schemas the server actually advertised). Nothing is
 * synthesized: an operation appears only because the integration genuinely
 * exposes it, which is what lets the planner reason over the model instead of
 * guessing endpoints.
 *
 * `?available=1` also returns twins for providers that are configured but not
 * yet connected, so the capability surface is inspectable before you connect.
 *
 * Derivation itself lives in lib/twin/collect, so this route and every
 * Workspace Model surface reason about exactly the same model.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    const userId = await requireUser();
    const url = new URL(req.url);
    const includeAvailable = url.searchParams.get("available") === "1";

    const collected = await collectTwins(userId, { includeAvailable });

    return NextResponse.json(
      {
        generated_at: new Date().toISOString(),
        twins: collected.map((c) => c.twin),
        // Stated so the UI never implies the twin mirrors live data.
        note: "Twins model each app's capability surface — resource types, operations, and the authority each requires. They do not mirror record data unless a resource reports a synced count.",
      },
      { headers: { "cache-control": "no-store" } }
    );
  } catch (err) {
    return errorResponse(err);
  }
}
