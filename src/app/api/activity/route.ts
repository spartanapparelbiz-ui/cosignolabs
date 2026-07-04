import { NextRequest, NextResponse } from "next/server";
import { errorResponse, requireUser } from "@/lib/api";
import { getStore } from "@/lib/store";
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
    const params = req.nextUrl.searchParams;
    const actions = await getStore().listActions(userId, {
      status: (params.get("status") as ActionStatus) ?? undefined,
      tier: params.get("tier") ? Number(params.get("tier")) : undefined,
      category: params.get("category") ?? undefined,
      limit: 1000,
    });

    if (params.get("format") === "csv") {
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
