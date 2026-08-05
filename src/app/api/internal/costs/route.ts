import { NextRequest, NextResponse } from "next/server";
import { getStore } from "@/lib/store";
import { PLANS, type PlanId } from "@/lib/plans";
import { logSecurity } from "@/lib/log";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * INTERNAL cost dashboard — operators only, never users.
 *
 * Answers, from the real ledger rather than estimates: cost per user, cost
 * per mission, cost per plan, average daily cost, and gross margin by plan.
 *
 * Access is a constant-time comparison against COSIGNO_ADMIN_KEY. No key
 * configured = the endpoint does not exist (404, same as any unknown route) —
 * fail closed, and don't advertise there's something here to unlock. This is
 * the only read path for the ledger; the table has no client RLS grant.
 */
function authorized(req: NextRequest): boolean {
  const key = process.env.COSIGNO_ADMIN_KEY?.trim();
  if (!key || key.length < 16) return false;
  const given = req.headers.get("x-admin-key") ?? "";
  if (given.length !== key.length) return false;
  let diff = 0;
  for (let i = 0; i < key.length; i += 1) diff |= key.charCodeAt(i) ^ given.charCodeAt(i);
  return diff === 0;
}

export async function GET(req: NextRequest) {
  if (!authorized(req)) {
    logSecurity("auth_failure", { at: "internal_costs" });
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  const days = Math.min(90, Math.max(1, Number(new URL(req.url).searchParams.get("days")) || 30));
  const since = new Date(Date.now() - days * 86_400_000).toISOString();
  const rows = await getStore().listAiUsageSince(since);

  const byUser = new Map<string, { cost: number; calls: number; plan: string }>();
  const byMission = new Map<string, { cost: number; calls: number; user: string }>();
  const byPlan = new Map<string, { cost: number; calls: number; users: Set<string> }>();
  const byDay = new Map<string, number>();
  const byModel = new Map<string, { cost: number; calls: number; inTok: number; outTok: number }>();
  let unknownCostCalls = 0;

  for (const r of rows) {
    const cost = r.est_cost_usd ?? 0;
    if (r.est_cost_usd === null) unknownCostCalls += 1;

    const u = byUser.get(r.user_id) ?? { cost: 0, calls: 0, plan: r.plan };
    u.cost += cost;
    u.calls += 1;
    u.plan = r.plan;
    byUser.set(r.user_id, u);

    if (r.mission_id) {
      const m = byMission.get(r.mission_id) ?? { cost: 0, calls: 0, user: r.user_id };
      m.cost += cost;
      m.calls += 1;
      byMission.set(r.mission_id, m);
    }

    const p = byPlan.get(r.plan) ?? { cost: 0, calls: 0, users: new Set<string>() };
    p.cost += cost;
    p.calls += 1;
    p.users.add(r.user_id);
    byPlan.set(r.plan, p);

    const day = r.created_at.slice(0, 10);
    byDay.set(day, (byDay.get(day) ?? 0) + cost);

    const mo = byModel.get(r.model) ?? { cost: 0, calls: 0, inTok: 0, outTok: 0 };
    mo.cost += cost;
    mo.calls += 1;
    mo.inTok += r.input_tokens;
    mo.outTok += r.output_tokens;
    byModel.set(r.model, mo);
  }

  const round = (n: number) => Number(n.toFixed(4));
  const dayCount = Math.max(1, byDay.size);
  const totalCost = [...byDay.values()].reduce((a, b) => a + b, 0);

  return NextResponse.json({
    window_days: days,
    calls: rows.length,
    // Honesty marker: calls whose model wasn't in the price table. A margin
    // number computed while this is high is a margin number to distrust.
    calls_without_cost_estimate: unknownCostCalls,
    total_cost_usd: round(totalCost),
    average_daily_cost_usd: round(totalCost / dayCount),
    cost_per_user: [...byUser.entries()]
      .map(([user, v]) => ({ user, plan: v.plan, calls: v.calls, cost_usd: round(v.cost) }))
      .sort((a, b) => b.cost_usd - a.cost_usd)
      .slice(0, 100),
    cost_per_mission: [...byMission.entries()]
      .map(([mission, v]) => ({ mission, user: v.user, calls: v.calls, cost_usd: round(v.cost) }))
      .sort((a, b) => b.cost_usd - a.cost_usd)
      .slice(0, 100),
    // Gross margin by plan: revenue is (paying users × monthly price),
    // prorated to the window; cost is the window's ledger total for the plan.
    margin_by_plan: [...byPlan.entries()].map(([plan, v]) => {
      const price = PLANS[plan as PlanId]?.price.monthly ?? 0;
      const revenue = price * v.users.size * (days / 30);
      return {
        plan,
        users: v.users.size,
        calls: v.calls,
        cost_usd: round(v.cost),
        est_revenue_usd: round(revenue),
        gross_margin:
          revenue > 0 ? round((revenue - v.cost) / revenue) : null,
      };
    }),
    cost_per_model: [...byModel.entries()].map(([model, v]) => ({
      model,
      calls: v.calls,
      input_tokens: v.inTok,
      output_tokens: v.outTok,
      cost_usd: round(v.cost),
    })),
    daily: [...byDay.entries()].sort().map(([day, cost]) => ({ day, cost_usd: round(cost) })),
  });
}
