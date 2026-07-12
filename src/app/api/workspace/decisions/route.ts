import { NextRequest, NextResponse } from "next/server";
import { errorResponse, requireUser } from "@/lib/api";
import { getUserEmail } from "@/lib/auth";
import { enforceLimit } from "@/lib/ratelimit";
import { delegatedDecisionSchema, parseStrict, readJsonBody } from "@/lib/schemas";
import { decideDelegated, listDelegatedProposals } from "@/lib/workspace";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Workspace-mates' tier-2 proposals the caller may decide on. */
export async function GET() {
  try {
    const userId = await requireUser();
    const email = await getUserEmail();
    const proposals = await listDelegatedProposals(userId, email);
    return NextResponse.json({
      decisions: proposals.map((p) => ({
        action: {
          id: p.action.id,
          category: p.action.category,
          tier: p.action.tier,
          summary: p.action.summary,
          injection_flag: p.action.injection_flag,
          created_at: p.action.created_at,
        },
        owner_email: p.owner_email,
      })),
    });
  } catch (err) {
    return errorResponse(err);
  }
}

/** Approve or veto one of those proposals — same engine door, audited actor. */
export async function POST(req: NextRequest) {
  try {
    const userId = await requireUser();
    await enforceLimit("transitionMinute", userId);
    const email = await getUserEmail();
    const body = parseStrict(delegatedDecisionSchema, await readJsonBody(req), "delegated_decision");
    const action = await decideDelegated(userId, email, body.action_id, body.decision, body.reason);
    return NextResponse.json({
      action: { id: action.id, status: action.status, summary: action.summary },
    });
  } catch (err) {
    return errorResponse(err);
  }
}
