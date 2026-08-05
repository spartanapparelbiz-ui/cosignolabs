import { NextRequest, NextResponse } from "next/server";
import { errorResponse, requireUser } from "@/lib/api";
import { enforceLimit } from "@/lib/ratelimit";
import { actionBudgetSchema, parseStrict, readJsonBody } from "@/lib/schemas";
import { getStore } from "@/lib/store";
import { BUDGET_CHOICES, DEFAULT_ACTION_BUDGET, clampBudget } from "@/lib/missions/budget";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * The workspace default: how many things a new mission may change before it
 * stops and asks. Missions that set their own limit keep it; everything else
 * follows this, so changing it here changes what happens next rather than only
 * what happens to missions created after now.
 */
export async function GET() {
  try {
    const userId = await requireUser();
    const prefs = await getStore().getPrefs(userId);
    return NextResponse.json({
      budget: prefs.action_budget ?? DEFAULT_ACTION_BUDGET,
      choices: BUDGET_CHOICES,
    });
  } catch (err) {
    return errorResponse(err);
  }
}

export async function PUT(req: NextRequest) {
  try {
    const userId = await requireUser();
    await enforceLimit("transitionMinute", userId);
    const body = parseStrict(actionBudgetSchema, await readJsonBody(req), "action_budget");
    const budget = clampBudget(body.budget);
    const store = getStore();
    await store.setActionBudget(userId, budget);
    await store.logAudit(userId, "budget_default_changed", { budget });
    return NextResponse.json({ budget, choices: BUDGET_CHOICES });
  } catch (err) {
    return errorResponse(err);
  }
}
