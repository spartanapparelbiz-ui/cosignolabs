import {
  fmtMoney,
  fmtPct,
  windowChange,
  windowMean,
  windowSum,
} from "./metrics";
import type {
  BusinessHealth,
  BusinessSnapshot,
  CategoryHealth,
  HealthKey,
  HealthStatus,
} from "./types";

/**
 * Business health — one honest score per category, each explained by the
 * numbers behind it. Scores are heuristic reads of REAL snapshot series, not
 * a gimmick: a category without data says "no data" rather than inventing a
 * number, and the overall score is a weighted mean of only the categories
 * that have one.
 */

function clamp(n: number): number {
  return Math.max(0, Math.min(100, Math.round(n)));
}

/** Map a fractional trend (e.g. +0.10) onto a score centered at `base`. */
function trendScore(change: number | null, base = 70, gain = 160): number | null {
  if (change === null) return null;
  return clamp(base + change * gain);
}

function statusFor(score: number | null, improving = false): HealthStatus {
  if (score === null) return "no_data";
  if (score >= 85) return "strong";
  if (score >= 70) return "healthy";
  if (score >= 55) return improving ? "improving" : "stable";
  if (score >= 40) return "needs_attention";
  return "at_risk";
}

const STATUS_LABEL: Record<HealthStatus, string> = {
  strong: "Strong",
  healthy: "Healthy",
  stable: "Stable",
  improving: "Improving",
  needs_attention: "Needs attention",
  at_risk: "At risk",
  no_data: "Not enough data",
};

export function healthStatusLabel(s: HealthStatus): string {
  return STATUS_LABEL[s];
}

type Cat = Omit<CategoryHealth, "key" | "label">;

function revenueHealth(s: BusinessSnapshot): Cat {
  const change = windowChange(s.series.revenue, 7);
  const week = windowSum(s.series.revenue, 7);
  const score = trendScore(change, 78);
  return {
    score,
    status: statusFor(score),
    summary:
      change === null
        ? "Not enough revenue history to judge the trend yet."
        : change < -0.05
          ? `Revenue is ${fmtPct(change)} week over week — below the recent pattern.`
          : `Revenue is ${fmtPct(change)} week over week, ${fmtMoney(week)} in the last 7 days.`,
    evidence: [
      { label: "Revenue (7d)", value: fmtMoney(week) },
      ...(change !== null ? [{ label: "Week over week", value: fmtPct(change) }] : []),
    ],
  };
}

function growthHealth(s: BusinessSnapshot): Cat {
  const cust = windowChange(s.series.new_customers, 14);
  const traffic = windowChange(s.series.sessions, 14);
  const parts = [cust, traffic].filter((c): c is number => c !== null);
  const score =
    parts.length === 0
      ? null
      : trendScore(parts.reduce((t, c) => t + c, 0) / parts.length, 72);
  return {
    score,
    status: statusFor(score),
    summary:
      score === null
        ? "Not enough history on customers and traffic yet."
        : `New customers ${cust !== null ? fmtPct(cust) : "—"} and traffic ${traffic !== null ? fmtPct(traffic) : "—"} over two weeks.`,
    evidence: [
      ...(cust !== null ? [{ label: "New customers (14d)", value: fmtPct(cust) }] : []),
      ...(traffic !== null ? [{ label: "Traffic (14d)", value: fmtPct(traffic) }] : []),
    ],
  };
}

function cashHealth(s: BusinessSnapshot): Cat {
  const dailyNet = windowMean(s.series.revenue, 28) - windowMean(s.series.expenses, 28);
  const burning = dailyNet < 0;
  const runwayMonths = burning ? s.cash_on_hand / (-dailyNet * 30) : null;
  const score = burning
    ? clamp((runwayMonths ?? 0) * 8) // 12+ months ≈ healthy
    : clamp(80 + Math.min(15, (dailyNet * 30) / 1000));
  return {
    score,
    status: statusFor(score),
    summary: burning
      ? `Spending exceeds revenue; cash covers roughly ${(runwayMonths ?? 0).toFixed(0)} months at the current pace.`
      : `Cash-flow positive — about ${fmtMoney(Math.round(dailyNet * 30))}/month net at the recent pace.`,
    evidence: [
      { label: "Cash on hand", value: fmtMoney(s.cash_on_hand) },
      { label: "Net per month (4w pace)", value: fmtMoney(Math.round(dailyNet * 30)) },
    ],
  };
}

function customersHealth(s: BusinessSnapshot): Cat {
  const churn = windowChange(s.series.churned_customers, 14);
  const refunds = windowSum(s.series.refunds, 7);
  const revenue = windowSum(s.series.revenue, 7);
  const refundRate = revenue > 0 ? refunds / revenue : null;
  // Falling churn is good, so invert; a high refund rate drags the score.
  let score = churn === null ? null : trendScore(-churn, 72);
  if (score !== null && refundRate !== null && refundRate > 0.03) {
    score = clamp(score - (refundRate - 0.03) * 400);
  }
  const improving = churn !== null && churn < -0.05;
  return {
    score,
    status: statusFor(score, improving),
    summary:
      churn === null
        ? "Not enough retention history yet."
        : improving
          ? `Churn is falling (${fmtPct(churn)} over 14 days)${refundRate !== null && refundRate > 0.03 ? ", though refunds are elevated" : ""}.`
          : `Churn moved ${fmtPct(churn)} over 14 days.`,
    evidence: [
      ...(churn !== null ? [{ label: "Churn (14d)", value: fmtPct(churn) }] : []),
      ...(refundRate !== null
        ? [{ label: "Refund rate (7d)", value: `${(refundRate * 100).toFixed(1)}%` }]
        : []),
    ],
  };
}

function salesHealth(s: BusinessSnapshot): Cat {
  if (s.leads.length === 0) {
    return {
      score: null,
      status: "no_data",
      summary: "No sales pipeline connected yet.",
      evidence: [],
    };
  }
  const stale = s.leads.filter((l) => l.last_touch_days >= 7);
  const pipeline = s.leads.reduce((t, l) => t + l.value, 0);
  const staleShare = stale.length / s.leads.length;
  const score = clamp(90 - staleShare * 80);
  return {
    score,
    status: statusFor(score),
    summary:
      stale.length > 0
        ? `${stale.length} of ${s.leads.length} open opportunities are quiet a week or more.`
        : `All ${s.leads.length} open opportunities have been touched this week.`,
    evidence: [
      { label: "Open pipeline", value: fmtMoney(pipeline) },
      { label: "Quiet a week+", value: `${stale.length} of ${s.leads.length}` },
    ],
  };
}

function marketingHealth(s: BusinessSnapshot): Cat {
  const spend = windowSum(s.series.ad_spend, 7);
  const conv = windowSum(s.series.conversions, 7);
  const prevSpend = windowSum(s.series.ad_spend, 14) - spend;
  const prevConv = windowSum(s.series.conversions, 14) - conv;
  if (conv < 5 || prevConv < 5) {
    return {
      score: null,
      status: "no_data",
      summary: "Not enough paid-conversion volume to judge efficiency.",
      evidence: [],
    };
  }
  const cac = spend / conv;
  const prevCac = prevSpend / prevConv;
  const rise = (cac - prevCac) / prevCac;
  const score = trendScore(-rise, 72);
  return {
    score,
    status: statusFor(score),
    summary:
      rise > 0.1
        ? `Cost per conversion rose from ${fmtMoney(Math.round(prevCac))} to ${fmtMoney(Math.round(cac))} in a week.`
        : `Cost per conversion is steady around ${fmtMoney(Math.round(cac))}.`,
    evidence: [
      { label: "Cost per conversion", value: fmtMoney(Math.round(cac)) },
      { label: "Ad spend (7d)", value: fmtMoney(spend) },
    ],
  };
}

function operationsHealth(s: BusinessSnapshot): Cat {
  if (s.support.length === 0) {
    return {
      score: null,
      status: "no_data",
      summary: "No support source connected yet.",
      evidence: [],
    };
  }
  const now = s.support.reduce((t, x) => t + x.tickets_7d, 0);
  const prev = s.support.reduce((t, x) => t + x.tickets_prev_7d, 0);
  const change = prev > 0 ? (now - prev) / prev : null;
  const score = trendScore(change === null ? null : -change, 75, 100);
  return {
    score,
    status: statusFor(score),
    summary:
      change !== null && change > 0.2
        ? `Support volume is up ${fmtPct(change)} this week.`
        : "Support volume is within its normal range.",
    evidence: [
      { label: "Tickets (7d)", value: `${prev} → ${now}` },
    ],
  };
}

function teamHealth(): Cat {
  // No team data source exists yet — say so instead of inventing a score.
  return {
    score: null,
    status: "no_data",
    summary: "Connect a project or HR tool to track team load and delivery.",
    evidence: [],
  };
}

function riskHealth(s: BusinessSnapshot): Cat {
  const expChange = windowChange(s.series.expenses, 28);
  const revChange = windowChange(s.series.revenue, 28);
  const refundChange = windowChange(s.series.refunds, 7);
  let score = 80;
  const notes: string[] = [];
  if (expChange !== null && revChange !== null && expChange > revChange) {
    score -= Math.min(30, (expChange - revChange) * 200);
    notes.push("costs growing faster than revenue");
  }
  if (refundChange !== null && refundChange > 0.3) {
    score -= 15;
    notes.push("refunds rising");
  }
  const final = clamp(score);
  return {
    score: final,
    status: statusFor(final),
    summary:
      notes.length > 0
        ? `Watch items: ${notes.join("; ")}.`
        : "No elevated risk indicators right now.",
    evidence: [
      ...(expChange !== null ? [{ label: "Expense growth (4w)", value: fmtPct(expChange) }] : []),
      ...(revChange !== null ? [{ label: "Revenue growth (4w)", value: fmtPct(revChange) }] : []),
    ],
  };
}

const CATEGORIES: { key: HealthKey; label: string; weight: number; calc: (s: BusinessSnapshot) => Cat }[] = [
  { key: "revenue", label: "Revenue", weight: 1.5, calc: revenueHealth },
  { key: "growth", label: "Growth", weight: 1.2, calc: growthHealth },
  { key: "cash", label: "Cash", weight: 1.3, calc: cashHealth },
  { key: "customers", label: "Customers", weight: 1.0, calc: customersHealth },
  { key: "sales", label: "Sales", weight: 1.0, calc: salesHealth },
  { key: "marketing", label: "Marketing", weight: 1.0, calc: marketingHealth },
  { key: "operations", label: "Operations", weight: 0.8, calc: operationsHealth },
  { key: "team", label: "Team", weight: 0.5, calc: () => teamHealth() },
  { key: "risk", label: "Risk", weight: 1.2, calc: riskHealth },
];

export function computeHealth(s: BusinessSnapshot): BusinessHealth {
  const categories: CategoryHealth[] = CATEGORIES.map((c) => ({
    key: c.key,
    label: c.label,
    ...c.calc(s),
  }));

  let weighted = 0;
  let weightTotal = 0;
  for (const c of CATEGORIES) {
    const cat = categories.find((x) => x.key === c.key)!;
    if (cat.score !== null) {
      weighted += cat.score * c.weight;
      weightTotal += c.weight;
    }
  }
  const score = weightTotal > 0 ? Math.round(weighted / weightTotal) : null;
  return { score, label: STATUS_LABEL[statusFor(score)], categories };
}
