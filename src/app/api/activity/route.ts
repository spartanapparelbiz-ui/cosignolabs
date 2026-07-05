import { NextRequest, NextResponse } from "next/server";
import { ApiError, errorResponse, requireUser } from "@/lib/api";
import { getUserPlan } from "@/lib/billing";
import { logSecurity } from "@/lib/log";
import { getStore } from "@/lib/store";
import { actionsQuerySchema, parseStrict } from "@/lib/schemas";
import type { ActionStatus } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function csvEscape(value: unknown): string {
  const s = value === null || value === undefined ? "" : String(value);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export async function GET(req: NextRequest) {
  try {
    const userId = await requireUser();
    const q = parseStrict(
      actionsQuerySchema,
      Object.fromEntries(req.nextUrl.searchParams),
      "activity_query"
    );
    const actions = await getStore().listActions(userId, {
      status: q.status as ActionStatus | undefined,
      tier: q.tier ? Number(q.tier) : undefined,
      category: q.category,
      limit: 1000,
    });

    if (q.format === "csv") {
      // CSV export is a pro+ feature.
      const { plan, planId } = await getUserPlan(userId);
      if (!plan.canExportCsv) {
        logSecurity("usage_limit_hit", { userId, at: "csv_export", plan: planId });
        throw new ApiError(
          402,
          "upgrade_required",
          "CSV export is a pro feature. upgrade to export your audit log."
        );
      }
      const header = [
        "id",
        "created_at",
        "resolved_at",
        "category",
        "tier",
        "status",
        "summary",
        "veto_reason",
        "injection_flag",
        "payload",
        "result",
      ];
      const rows = actions.map((a) =>
        [
          a.id,
          a.created_at,
          a.resolved_at,
          a.category,
          a.tier,
          a.status,
          a.summary,
          a.veto_reason,
          a.injection_flag,
          JSON.stringify(a.payload),
          a.result ? JSON.stringify(a.result) : "",
        ]
          .map(csvEscape)
          .join(",")
      );
      const csv = [header.join(","), ...rows].join("\n");
      return new NextResponse(csv, {
        headers: {
          "Content-Type": "text/csv; charset=utf-8",
          "Content-Disposition": `attachment; filename="cosigno-activity-${new Date().toISOString().slice(0, 10)}.csv"`,
        },
      });
    }

    return NextResponse.json({ actions });
  } catch (err) {
    return errorResponse(err);
  }
}
