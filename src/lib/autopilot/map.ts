import { fmtCount, fmtMoney, fmtPct, windowChange, windowSum } from "./metrics";
import type {
  BusinessHealth,
  BusinessMap,
  BusinessSnapshot,
  FunnelStage,
  HealthStatus,
} from "./types";

/**
 * The Business Map — Cosigno's internal model of how the company works,
 * shown as the core funnel (traffic → leads → customers → revenue →
 * retention) plus the six business areas, each with its connected systems
 * and current health. Area health reuses the health engine's category reads
 * so the map and the health section never disagree.
 */

function trend(change: number | null): FunnelStage["trend"] {
  if (change === null || Math.abs(change) < 0.03) return "flat";
  return change > 0 ? "up" : "down";
}

function stage(
  key: FunnelStage["key"],
  label: string,
  value: string,
  change: number | null
): FunnelStage {
  return { key, label, value, change: change === null ? null : fmtPct(change), trend: trend(change) };
}

export function computeMap(s: BusinessSnapshot, health: BusinessHealth): BusinessMap {
  const cat = (key: string) => health.categories.find((c) => c.key === key);
  const status = (key: string): HealthStatus => cat(key)?.status ?? "no_data";

  const churn = windowSum(s.series.churned_customers, 7);
  const customers = windowSum(s.series.new_customers, 7);
  const retention = customers + churn > 0 ? customers / (customers + churn) : null;

  const funnel: FunnelStage[] = [
    stage(
      "traffic",
      "Traffic",
      `${fmtCount(windowSum(s.series.sessions, 7))} sessions / wk`,
      windowChange(s.series.sessions, 7)
    ),
    stage("leads", "Leads", `${fmtCount(s.leads.length)} open`, null),
    stage(
      "customers",
      "Customers",
      `${fmtCount(customers)} new / wk`,
      windowChange(s.series.new_customers, 7)
    ),
    stage(
      "revenue",
      "Revenue",
      `${fmtMoney(windowSum(s.series.revenue, 7))} / wk`,
      windowChange(s.series.revenue, 7)
    ),
    stage(
      "retention",
      "Retention",
      retention === null ? "—" : `${Math.round(retention * 100)}% kept / wk`,
      windowChange(s.series.churned_customers, 14) === null
        ? null
        : -(windowChange(s.series.churned_customers, 14) as number)
    ),
  ];

  const areas: BusinessMap["areas"] = [
    {
      key: "marketing",
      label: "Marketing",
      status: status("marketing"),
      summary: cat("marketing")?.summary ?? "",
      systems: s.systems.marketing,
    },
    {
      key: "sales",
      label: "Sales",
      status: status("sales"),
      summary: cat("sales")?.summary ?? "",
      systems: s.systems.sales,
    },
    {
      key: "operations",
      label: "Operations",
      status: status("operations"),
      summary: cat("operations")?.summary ?? "",
      systems: s.systems.operations,
    },
    {
      key: "finance",
      label: "Finance",
      status: status("cash"),
      summary: cat("cash")?.summary ?? "",
      systems: s.systems.finance,
    },
    {
      key: "support",
      label: "Support",
      status: status("operations"),
      summary: cat("operations")?.summary ?? "",
      systems: s.systems.support,
    },
    {
      key: "products",
      label: "Products",
      status: status("revenue"),
      summary:
        s.products.length > 0
          ? `${s.products.length} products tracked; strongest: ${[...s.products].sort((a, b) => b.revenue_14d - a.revenue_14d)[0].name}.`
          : "No product source connected yet.",
      systems: s.systems.products,
    },
  ];

  return { funnel, areas };
}
