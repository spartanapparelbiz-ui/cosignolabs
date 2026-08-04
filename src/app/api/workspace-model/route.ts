import { NextResponse } from "next/server";
import { errorResponse, requireUser } from "@/lib/api";
import { collectTwins } from "@/lib/twin/collect";
import { buildGraph } from "@/lib/workspace-model/graph";
import { buildSyncReport } from "@/lib/workspace-model/sync";

/**
 * GET /api/workspace-model — the Workspace Model itself.
 *
 * Returns the universal object graph (connectors → resources → operations →
 * permissions, plus the relationships between them) and the live-sync state of
 * every connected system.
 *
 * This is a MODEL, not a mirror of your records: it describes structure,
 * capability, authority and reversibility. Instance counts appear only where a
 * connector genuinely synced them, and the response says so explicitly so no
 * caller can mistake the model for a data copy.
 *
 * `?available=1` includes configured-but-unconnected providers, so the model
 * is inspectable before anything is connected.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    const userId = await requireUser();
    const includeAvailable = new URL(req.url).searchParams.get("available") === "1";

    const collected = await collectTwins(userId, { includeAvailable });
    const graph = buildGraph(collected.map((c) => c.twin));
    const sync = buildSyncReport(
      collected.map((c) => ({ twin: c.twin, last_synced_at: c.last_synced_at }))
    );

    return NextResponse.json(
      {
        graph,
        sync,
        note: "The Workspace Model describes structure — objects, relationships, permissions, reversibility. It is not a copy of your data: record counts appear only where a connector actually synced them.",
      },
      { headers: { "cache-control": "no-store" } }
    );
  } catch (err) {
    return errorResponse(err);
  }
}
