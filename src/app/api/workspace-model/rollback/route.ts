import { NextRequest, NextResponse } from "next/server";
import { errorResponse, requireUser } from "@/lib/api";
import { enforceLimit } from "@/lib/ratelimit";
import { parseStrict, readJsonBody, workspaceRollbackSchema } from "@/lib/schemas";
import { collectTwins } from "@/lib/twin/collect";
import { buildGraph, resourceNodeId } from "@/lib/workspace-model/graph";
import { buildChangeset } from "@/lib/workspace-model/changeset";
import { analyzeDependencies } from "@/lib/workspace-model/dependencies";

/**
 * POST /api/workspace-model/rollback — preview the undo before you need it.
 *
 * Returns the rollback plan for a change (its steps, which of them cosigno can
 * run automatically, the authority the rollback itself demands, an honest
 * recovery estimate) together with the impact of RUNNING that rollback — an
 * undo is a change too, and it gets the same scrutiny as the original.
 *
 * Previewing never executes. Where no inverse exists in the model, the
 * response says the change is irreversible instead of implying an undo cosigno
 * cannot perform.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const userId = await requireUser();
    await enforceLimit("previewMinute", userId);

    const body = parseStrict(workspaceRollbackSchema, await readJsonBody(req), "workspace_rollback");
    const collected = await collectTwins(userId, { includeAvailable: true });
    const twins = collected.map((c) => c.twin);
    const graph = buildGraph(twins);

    // The rollback plan is derived from the changeset, so the undo is always
    // computed from the same facts as the change itself.
    const changeset = buildChangeset({
      twin: twins.find((t) => t.connection_key === body.connector),
      graph,
      operation: body.operation,
      before: body.before,
      after: body.after,
    });

    const rollbackImpact = changeset.refused
      ? null
      : analyzeDependencies(graph, resourceNodeId(changeset.connector, changeset.resource), {
          // Restoring a record rewrites it; treat the undo as an update unless
          // the undo is itself a delete.
          action: changeset.rollback.steps.some((s) => s.operation?.startsWith("delete")) ? "delete" : "update",
        });

    return NextResponse.json(
      {
        changeset_id: changeset.id,
        refused: changeset.refused,
        refusal_reason: changeset.refusal_reason,
        rollback: changeset.rollback,
        rollback_impact: rollbackImpact,
        note: "This is a preview. Rolling back is itself an approved action — the authority stated here is what it will demand.",
      },
      { headers: { "cache-control": "no-store" } }
    );
  } catch (err) {
    return errorResponse(err);
  }
}
