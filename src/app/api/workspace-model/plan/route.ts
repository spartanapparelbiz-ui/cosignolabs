import { NextRequest, NextResponse } from "next/server";
import { errorResponse, requireUser } from "@/lib/api";
import { enforceLimit } from "@/lib/ratelimit";
import { parseStrict, readJsonBody, workspacePlanSchema } from "@/lib/schemas";
import { collectTwins } from "@/lib/twin/collect";
import { buildGraph } from "@/lib/workspace-model/graph";
import { buildPlan } from "@/lib/workspace-model/plan";
import { buildExecutionDiff } from "@/lib/workspace-model/diff";

/**
 * POST /api/workspace-model/plan — plan a change. Never execute one.
 *
 * Returns the execution plan (locate → verify → policy → simulate → estimate →
 * approve → execute → confirm), the changeset it would produce, the rollback
 * plan, and the diff the change is predicted to make.
 *
 * This route CANNOT execute anything, by construction — it calls no provider
 * and touches no credential. Execution stays where it already lives: an
 * approved action on the ledger, gated by the existing authority engine. A
 * plan is a proposal for a human to read.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const userId = await requireUser();
    await enforceLimit("previewMinute", userId);

    const body = parseStrict(workspacePlanSchema, await readJsonBody(req), "workspace_plan");
    const collected = await collectTwins(userId, { includeAvailable: true });
    const graph = buildGraph(collected.map((c) => c.twin));
    const plan = buildPlan(body, collected.map((c) => c.twin), graph);

    return NextResponse.json(
      {
        plan,
        // The predicted diff — planned figures only, until an execution is
        // actually observed. buildExecutionDiff labels it as such.
        predicted_diff: buildExecutionDiff(plan.changeset),
        note: "Planning is read-only. Nothing here has run: the plan and changeset describe what WOULD happen, and execution still requires the authority the plan states.",
      },
      { headers: { "cache-control": "no-store" } }
    );
  } catch (err) {
    return errorResponse(err);
  }
}
