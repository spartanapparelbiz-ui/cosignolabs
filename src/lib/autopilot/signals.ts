import {
  fmtCount,
  fmtMoney,
  fmtPct,
  windowChange,
  windowMean,
  windowSum,
  prevWindowSum,
} from "./metrics";
import type { BusinessSnapshot, Signal } from "./types";

/**
 * Signal detection — every rule is a pure check against the snapshot that
 * either returns a Signal or null. Keys are stable per condition (not per
 * computation) so a user's "ignore" sticks while the condition persists.
 * Thresholds are deliberately conservative: Autopilot surfaces what MATTERS,
 * not every wiggle.
 */

const WEEK = 7;

function revenueDrop(s: BusinessSnapshot): Signal | null {
  const change = windowChange(s.series.revenue, WEEK);
  if (change === null || change > -0.08) return null;
  const now = windowSum(s.series.revenue, WEEK);
  const prev = prevWindowSum(s.series.revenue, WEEK);
  const monthlyImpact = Math.round(((prev - now) * 30) / 7 / 100) * 100;
  return {
    key: "revenue_week_drop",
    kind: "revenue",
    severity: change <= -0.15 ? "critical" : "important",
    title: `Revenue down ${Math.abs(Math.round(change * 100))}% this week`,
    body: `The last 7 days brought in ${fmtMoney(now)}, compared with ${fmtMoney(prev)} the week before — outside the normal weekly pattern.`,
    why: "A sustained pullback compounds quickly and usually has one or two identifiable causes worth finding early.",
    impact: `Roughly ${fmtMoney(monthlyImpact)}/month if the trend continues — an estimate, not a certainty.`,
    confidence: "high",
    metrics: [
      { label: "Last 7 days", value: fmtMoney(now) },
      { label: "Prior 7 days", value: fmtMoney(prev) },
      { label: "Change", value: fmtPct(change) },
    ],
    action: {
      label: "Investigate the drop",
      command:
        "Analyze the recent revenue decline: compare the last 7 days with the prior week across channels, products, and refunds, and prepare a summary of the most likely causes with supporting numbers.",
    },
  };
}

function acquisitionCost(s: BusinessSnapshot): Signal | null {
  const spend = windowSum(s.series.ad_spend, WEEK);
  const conv = windowSum(s.series.conversions, WEEK);
  const prevSpend = prevWindowSum(s.series.ad_spend, WEEK);
  const prevConv = prevWindowSum(s.series.conversions, WEEK);
  if (conv < 5 || prevConv < 5) return null;
  const cac = spend / conv;
  const prevCac = prevSpend / prevConv;
  const rise = (cac - prevCac) / prevCac;
  if (rise < 0.2) return null;
  const monthlyImpact = Math.round(((cac - prevCac) * conv * 30) / 7 / 100) * 100;
  const worst = [...s.campaigns]
    .filter((c) => c.conversions_7d > 0 && c.conversions_prev_7d > 0)
    .sort(
      (a, b) =>
        b.spend_7d / b.conversions_7d - b.spend_prev_7d / b.conversions_prev_7d -
        (a.spend_7d / a.conversions_7d - a.spend_prev_7d / a.conversions_prev_7d)
    )[0];
  return {
    key: "cac_rise",
    kind: "marketing",
    severity: rise >= 0.4 ? "critical" : "important",
    title: "Customer acquisition cost is rising",
    body: `Cost per paid conversion moved from ${fmtMoney(Math.round(prevCac))} to ${fmtMoney(Math.round(cac))} over the last 7 days${worst ? `, driven mostly by ${worst.name}` : ""}.`,
    why: "Paying more for the same customers erodes margin on every sale until the spend is rebalanced.",
    impact: `About ${fmtMoney(monthlyImpact)}/month in extra acquisition cost at the current pace, if nothing changes.`,
    confidence: "high",
    metrics: [
      { label: "Cost per conversion", value: `${fmtMoney(Math.round(prevCac))} → ${fmtMoney(Math.round(cac))}` },
      { label: "Ad spend (7d)", value: fmtMoney(spend) },
      { label: "Conversions (7d)", value: fmtCount(conv) },
    ],
    action: {
      label: "Rebalance ad spend",
      command:
        "Review paid campaign performance over the last 14 days, identify the underperforming ad sets, and prepare a recommendation to pause the weakest ones and reallocate budget to the strongest campaign.",
    },
  };
}

function refundsRising(s: BusinessSnapshot): Signal | null {
  const change = windowChange(s.series.refunds, WEEK);
  const refunds = windowSum(s.series.refunds, WEEK);
  const revenue = windowSum(s.series.revenue, WEEK);
  if (change === null || change < 0.3 || revenue <= 0) return null;
  const rate = refunds / revenue;
  if (rate < 0.02) return null;
  return {
    key: "refunds_rising",
    kind: "risk",
    severity: rate >= 0.06 ? "critical" : "important",
    title: "Refunds are rising",
    body: `Refunds reached ${fmtMoney(refunds)} in the last 7 days (${fmtPct(change)} vs the prior week) — ${(rate * 100).toFixed(1)}% of revenue.`,
    why: "Rising refunds usually point at a product, sizing, or fulfillment issue that also hurts repeat purchases.",
    impact: `${fmtMoney(refunds)} returned this week; the cause may also be suppressing new sales.`,
    confidence: "medium",
    metrics: [
      { label: "Refunds (7d)", value: fmtMoney(refunds) },
      { label: "Change", value: fmtPct(change) },
      { label: "Refund rate", value: `${(rate * 100).toFixed(1)}%` },
    ],
    action: {
      label: "Find the refund cause",
      command:
        "Review the refunds from the last 14 days, group them by product and stated reason, and prepare a summary of the leading causes with a recommended fix.",
    },
  };
}

function staleLeads(s: BusinessSnapshot): Signal | null {
  const stale = s.leads.filter((l) => l.last_touch_days >= 7);
  if (stale.length < 3) return null;
  const value = stale.reduce((t, l) => t + l.value, 0);
  return {
    key: "stale_leads",
    kind: "sales",
    severity: "important",
    title: `${stale.length} sales opportunities have gone quiet`,
    body: `${stale.length} open opportunities worth ${fmtMoney(value)} combined haven't been contacted in at least a week.`,
    why: "Deals cool fast — response time is one of the strongest predictors of whether an opportunity closes.",
    impact: `${fmtMoney(value)} of pipeline is at risk of going cold.`,
    confidence: "high",
    metrics: [
      { label: "Quiet opportunities", value: fmtCount(stale.length) },
      { label: "Combined value", value: fmtMoney(value) },
      {
        label: "Longest silence",
        value: `${Math.max(...stale.map((l) => l.last_touch_days))} days`,
      },
    ],
    action: {
      label: "Prepare follow-ups",
      command: `Draft personalized follow-up emails for the ${stale.length} sales opportunities that have been quiet for a week or more, using what we know about each, and prepare them all for my review.`,
    },
  };
}

function expenseCreep(s: BusinessSnapshot): Signal | null {
  const expChange = windowChange(s.series.expenses, 28);
  const revChange = windowChange(s.series.revenue, 28);
  if (expChange === null || revChange === null) return null;
  if (expChange - revChange < 0.04 || expChange <= 0) return null;
  const dailyBurn = windowMean(s.series.expenses, 28) - windowMean(s.series.revenue, 28);
  const runwayMonths = dailyBurn > 0 ? s.cash_on_hand / (dailyBurn * 30) : null;
  return {
    key: "expense_creep",
    kind: "finance",
    severity: runwayMonths !== null && runwayMonths < 6 ? "critical" : "important",
    title: "Expenses are growing faster than revenue",
    body: `Over the last 4 weeks expenses grew ${fmtPct(expChange)} while revenue moved ${fmtPct(revChange)}.`,
    why: "When cost growth outpaces revenue growth, margin and runway shrink even while sales look fine.",
    impact:
      runwayMonths !== null
        ? `At the current gap, cash covers roughly ${runwayMonths.toFixed(0)} months — a rough estimate.`
        : "Margin is compressing; cash is still covering costs.",
    confidence: "medium",
    metrics: [
      { label: "Expense growth (4w)", value: fmtPct(expChange) },
      { label: "Revenue growth (4w)", value: fmtPct(revChange) },
      { label: "Cash on hand", value: fmtMoney(s.cash_on_hand) },
    ],
    action: {
      label: "Review spending",
      command:
        "Review operating expenses from the last 60 days, identify the fastest-growing categories and any unusual charges, and prepare a cost-review summary with recommended cuts.",
    },
  };
}

function productSurge(s: BusinessSnapshot): Signal | null {
  const surging = [...s.products]
    .filter((p) => p.units_prev_14d > 0 && (p.units_14d - p.units_prev_14d) / p.units_prev_14d >= 0.3)
    .sort((a, b) => b.units_14d / b.units_prev_14d - a.units_14d / a.units_prev_14d)[0];
  if (!surging) return null;
  const growth = (surging.units_14d - surging.units_prev_14d) / surging.units_prev_14d;
  const organic = surging.organic_share_delta >= 0.15;
  return {
    key: `product_surge_${surging.id}`,
    kind: "opportunity",
    severity: "opportunity",
    title: `${surging.name} is accelerating`,
    body: `Sales are up ${Math.round(growth * 100)}% over the past 14 days (${fmtCount(surging.units_14d)} units, ${fmtMoney(surging.revenue_14d)})${organic ? ", with a clear rise in conversion from organic traffic" : ""}.`,
    why: "Momentum like this is cheapest to amplify while it's happening — inventory and landing pages matter now, not next month.",
    impact: `${fmtMoney(surging.revenue_14d)} in 14 days and climbing; a stock-out would cap it.`,
    confidence: "high",
    metrics: [
      { label: "Units (14d)", value: `${fmtCount(surging.units_prev_14d)} → ${fmtCount(surging.units_14d)}` },
      { label: "Revenue (14d)", value: fmtMoney(surging.revenue_14d) },
      ...(organic
        ? [{ label: "Organic share", value: fmtPct(surging.organic_share_delta) }]
        : []),
    ],
    action: {
      label: "Plan the push",
      command: `Prepare an opportunity plan for "${surging.name}": check inventory coverage against the current sales pace, and draft a dedicated landing page outline that leans on the organic traffic driving it.`,
    },
  };
}

function retentionImproving(s: BusinessSnapshot): Signal | null {
  const change = windowChange(s.series.churned_customers, 14);
  if (change === null || change > -0.1) return null;
  return {
    key: "retention_improving",
    kind: "customer",
    severity: "info",
    title: "Customer retention is improving",
    body: `Customer losses fell ${Math.abs(Math.round(change * 100))}% over the last two weeks compared with the two before.`,
    why: "Lower churn quietly raises the value of every new customer you acquire.",
    impact: "Positive — no action required; worth knowing what changed so it sticks.",
    confidence: "medium",
    metrics: [{ label: "Churn change (14d)", value: fmtPct(change) }],
    action: null,
  };
}

function supportRecurring(s: BusinessSnapshot): Signal | null {
  const hot = [...s.support]
    .filter((t) => t.tickets_7d >= 10 && t.tickets_prev_7d > 0 && t.tickets_7d / t.tickets_prev_7d >= 1.8)
    .sort((a, b) => b.tickets_7d / b.tickets_prev_7d - a.tickets_7d / a.tickets_prev_7d)[0];
  if (!hot) return null;
  return {
    key: `support_recurring_${hot.id}`,
    kind: "operations",
    severity: "important",
    title: `A support issue is becoming recurring: "${hot.topic}"`,
    body: `${hot.tickets_7d} tickets this week, up from ${hot.tickets_prev_7d} the week before.`,
    why: "A repeating complaint is usually one root cause showing up many times — and it often feeds the refund rate.",
    impact: "Growing support load and likely knock-on refunds until the root cause is fixed.",
    confidence: "high",
    metrics: [
      { label: "Tickets (7d)", value: `${hot.tickets_prev_7d} → ${hot.tickets_7d}` },
    ],
    action: {
      label: "Get to the root cause",
      command: `Summarize the recent support tickets about "${hot.topic}", identify the root cause, and prepare a recommended fix plus a draft macro reply for the support team.`,
    },
  };
}

function trafficShift(s: BusinessSnapshot): Signal | null {
  const change = windowChange(s.series.sessions, WEEK);
  if (change === null || Math.abs(change) < 0.15) return null;
  const up = change > 0;
  return {
    key: up ? "traffic_up" : "traffic_down",
    kind: up ? "opportunity" : "marketing",
    severity: up ? "opportunity" : "important",
    title: up ? "Site traffic is up sharply" : "Site traffic dropped this week",
    body: `Sessions moved ${fmtPct(change)} versus the prior week.`,
    why: up
      ? "More qualified attention is the cheapest growth there is — capture it while it lasts."
      : "Less traffic today is less revenue in two weeks; the source of the dip matters.",
    impact: up ? "Tailwind for every funnel stage." : "Leading indicator for a revenue slowdown.",
    confidence: "medium",
    metrics: [{ label: "Sessions (7d change)", value: fmtPct(change) }],
    action: {
      label: up ? "Capture the traffic" : "Trace the dip",
      command: up
        ? "Analyze where the recent traffic increase is coming from and prepare recommendations for converting it — landing pages, offers, or email capture."
        : "Analyze the recent traffic drop by source and prepare a summary of which channel fell and the most likely reason.",
    },
  };
}

const DETECTORS = [
  revenueDrop,
  acquisitionCost,
  refundsRising,
  staleLeads,
  expenseCreep,
  productSurge,
  supportRecurring,
  retentionImproving,
  trafficShift,
];

const SEVERITY_ORDER: Record<Signal["severity"], number> = {
  critical: 0,
  important: 1,
  opportunity: 2,
  info: 3,
};

/** Run every detector; sorted most severe first. */
export function detectSignals(s: BusinessSnapshot): Signal[] {
  const out: Signal[] = [];
  for (const d of DETECTORS) {
    const sig = d(s);
    if (sig) out.push(sig);
  }
  return out.sort((a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity]);
}
