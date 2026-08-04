import { NextRequest, NextResponse } from "next/server";
import { errorResponse, requireUser } from "@/lib/api";
import { enforceLimit } from "@/lib/ratelimit";
import { parseStrict, readJsonBody, workspaceQuerySchema } from "@/lib/schemas";
import { collectTwins } from "@/lib/twin/collect";
import { buildGraph } from "@/lib/workspace-model/graph";
import { runQuery } from "@/lib/workspace-model/query";

/**
 * POST /api/workspace-model/query — ask the Workspace Model a question.
 *
 * "Show every workflow using Stripe." "Which permissions can modify
 * production?" "What depends on this object?"
 *
 * The parse is DETERMINISTIC — no model call — so the same question always
 * returns the same answer and the response can show exactly how the sentence
 * was read, including any words it could not use. This endpoint is strictly
 * read-only: it searches the model and can execute nothing.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const userId = await requireUser();
    await enforceLimit("previewMinute", userId);

    const body = parseStrict(workspaceQuerySchema, await readJsonBody(req), "workspace_query");
    const collected = await collectTwins(userId, { includeAvailable: true });
    const graph = buildGraph(collected.map((c) => c.twin));

    return NextResponse.json(runQuery(graph, body.query), {
      headers: { "cache-control": "no-store" },
    });
  } catch (err) {
    return errorResponse(err);
  }
}
