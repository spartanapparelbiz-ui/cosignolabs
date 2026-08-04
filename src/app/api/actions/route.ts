import { NextRequest, NextResponse } from "next/server";
import { errorResponse, requireUser } from "@/lib/api";
import { getStore } from "@/lib/store";
import { actionsQuerySchema, parseStrict } from "@/lib/schemas";
import { previewForActions } from "@/lib/workspace-model/approvalPreview";
import type { ActionStatus } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const userId = await requireUser();
    const q = parseStrict(
      actionsQuerySchema,
      Object.fromEntries(req.nextUrl.searchParams),
      "actions_query"
    );
    const actions = await getStore().listActions(userId, {
      session_id: q.session,
      status: q.status as ActionStatus | undefined,
      tier: q.tier ? Number(q.tier) : undefined,
      category: q.category,
      limit: q.limit,
    });
    // Anything waiting on a human gets the Workspace Model's read on it: what
    // the operation touches and whether it can be undone. Resolved cards don't
    // need it — the decision is already made — so the derivation only runs for
    // the queue a person is about to act on.
    const pending = actions.filter((a) => a.status === "proposed");
    const previews = pending.length > 0 ? await previewForActions(userId, pending) : {};

    return NextResponse.json({
      actions: actions.map((a) => (previews[a.id] ? { ...a, preview: previews[a.id] } : a)),
    });
  } catch (err) {
    return errorResponse(err);
  }
}
