import { NextResponse } from "next/server";
import { errorResponse, requireUser } from "@/lib/api";
import { collectTwins } from "@/lib/twin/collect";
import { buildGraph } from "@/lib/workspace-model/graph";
import { buildMap } from "@/lib/workspace-model/map";
import { coverageOf, describeConnection } from "@/lib/workspace-model/actionSpec";

/**
 * GET /api/workspace-model/map — the Workspace Map.
 *
 * The same model as the graph route, projected into something readable: one
 * entry per connected system, in the order work flows through them, with links
 * only where two neighbours genuinely share a business object.
 *
 * Read-only. Like every model surface, it calls no provider and can execute
 * nothing.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const userId = await requireUser();
    const collected = await collectTwins(userId);
    const twins = collected.map((c) => c.twin);
    const map = buildMap(buildGraph(twins));

    // Each box opens into the universal action model for that system: what
    // every action needs, what it would produce, and whether cosigno can
    // verify or undo it.
    const byKey = new Map(twins.map((t) => [t.connection_key, t]));
    map.systems = map.systems.map((system) => {
      const twin = byKey.get(system.connector);
      if (!twin) return system;
      return { ...system, specs: describeConnection(twin), coverage: coverageOf(twin) };
    });

    return NextResponse.json(
      {
        map,
        note: "The map models structure — systems, the objects they hold, and what AI may do to them. Object counts appear only where a connector genuinely synced them.",
      },
      { headers: { "cache-control": "no-store" } }
    );
  } catch (err) {
    return errorResponse(err);
  }
}
