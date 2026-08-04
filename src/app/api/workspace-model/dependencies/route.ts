import { NextResponse } from "next/server";
import { ApiError, errorResponse, requireUser } from "@/lib/api";
import { collectTwins } from "@/lib/twin/collect";
import { buildGraph } from "@/lib/workspace-model/graph";
import { analyzeDependencies, analyzeOperationImpact } from "@/lib/workspace-model/dependencies";

/**
 * GET /api/workspace-model/dependencies?node=<id>&action=delete
 *
 * "What would break?" — the impact of touching one object, walked across every
 * connected system through the model's relationships.
 *
 * The report names the object TYPES at risk and, where a resource genuinely
 * reports synced counts, how many records that is. It will not estimate a
 * record count it has not observed: an invented number in an impact report is
 * the number a human uses to decide, so it must be real or absent.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ACTIONS = new Set(["delete", "update", "read"]);

export async function GET(req: Request) {
  try {
    const userId = await requireUser();
    const url = new URL(req.url);
    const node = url.searchParams.get("node")?.trim();
    const action = url.searchParams.get("action")?.trim() ?? "delete";
    const depthParam = Number(url.searchParams.get("depth") ?? 3);

    if (!node) throw new ApiError(400, "invalid_input", "node: a Workspace Model node id is required.");
    if (!ACTIONS.has(action)) {
      throw new ApiError(400, "invalid_input", "action: must be delete, update, or read.");
    }
    const depth = Number.isFinite(depthParam) ? Math.min(Math.max(Math.trunc(depthParam), 1), 5) : 3;

    const collected = await collectTwins(userId, { includeAvailable: true });
    const graph = buildGraph(collected.map((c) => c.twin));

    const report = node.startsWith("operation:")
      ? analyzeOperationImpact(graph, node)
      : analyzeDependencies(graph, node, { action: action as "delete" | "update" | "read", depth });

    return NextResponse.json(report, { headers: { "cache-control": "no-store" } });
  } catch (err) {
    return errorResponse(err);
  }
}
