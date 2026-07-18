import { fmtCount, fmtMoney, fmtPct, lastWindow, windowChange, windowSum } from "./metrics";
import type {
  BusinessSnapshot,
  ChangeItem,
  DailyBrief,
  Recommendation,
  RevenueForecast,
  Signal,
} from "./types";

/**
 * The narrative layers: "what changed", the recommendation shortlist, and
 * the daily brief. Everything is derived from the snapshot and the live
 * signal set — no generic advice, no filler lines.
 */

/* ------------------------------------------------------------ what changed */

/** Meaningful week-over-week movements — thresholded so noise stays out. */
export function computeChanges(s: BusinessSnapshot, signals: Signal[]): ChangeItem[] {
  const out: ChangeItem[] = [];

  const rev = windowChange(s.series.revenue, 7);
  if (rev !== null && Math.abs(rev) >= 0.05) {
    out.push({
      key: "revenue",
      text: `Revenue ${rev < 0 ? "down" : "up"} ${Math.abs(Math.round(rev * 100))}% this week (${fmtMoney(windowSum(s.series.revenue, 7))}).`,
      tone: rev < 0 ? "negative" : "positive",
    });
  }

  const spend = windowSum(s.series.ad_spend, 7);
  const conv = windowSum(s.series.conversions, 7);
  const prevSpend = windowSum(s.series.ad_spend, 14) - spend;
  const prevConv = windowSum(s.series.conversions, 14) - conv;
  if (conv >= 5 && prevConv >= 5) {
    const cacChange = (spend / conv - prevSpend / prevConv) / (prevSpend / prevConv);
    if (Math.abs(cacChange) >= 0.15) {
      out.push({
        key: "cac",
        text: `Paid campaigns are spending ${fmtPct(cacChange)} ${cacChange > 0 ? "more" : "less"} per conversion than last week.`,
        tone: cacChange > 0 ? "negative" : "positive",
      });
    }
  }

  const refunds = windowChange(s.series.refunds, 7);
  if (refunds !== null && refunds >= 0.3) {
    out.push({ key: "refunds", text: `Refund rate increased (${fmtPct(refunds)} week over week).`, tone: "negative" });
  }

  const stale = s.leads.filter((l) => l.last_touch_days >= 7);
  if (stale.length >= 3) {
    out.push({
      key: "leads",
      text: `${stale.length} high-value opportunities went quiet (${fmtMoney(stale.reduce((t, l) => t + l.value, 0))} combined).`,
      tone: "negative",
    });
  }

  for (const p of s.products) {
    if (p.units_prev_14d > 0) {
      const g = (p.units_14d - p.units_prev_14d) / p.units_prev_14d;
      if (g >= 0.3) {
        out.push({ key: `product_${p.id}`, text: `${p.name} sales up ${Math.round(g * 100)}% over two weeks.`, tone: "positive" });
      }
    }
  }

  const churn = windowChange(s.series.churned_customers, 14);
  if (churn !== null && churn <= -0.1) {
    out.push({ key: "churn", text: `Customer churn is down ${Math.abs(Math.round(churn * 100))}% over two weeks.`, tone: "positive" });
  }

  // Keep it focused — the five that matter, not everything that moved.
  return out.slice(0, 5).length > 0
    ? out.slice(0, 5)
    : signals.slice(0, 3).map((x) => ({
        key: x.key,
        text: x.title,
        tone: x.severity === "opportunity" || x.severity === "info" ? ("positive" as const) : ("negative" as const),
      }));
}

/* ---------------------------------------------------------- recommendations */

/** The strategic shortlist: highest-severity actionable signals first. */
export function computeRecommendations(
  signals: Signal[],
  forecast: RevenueForecast
): Recommendation[] {
  const out: Recommendation[] = [];

  for (const sig of signals) {
    if (!sig.action) continue;
    out.push({
      key: `rec_${sig.key}`,
      title: sig.action.label,
      reason: `${sig.title}. ${sig.why}`,
      impact: sig.impact,
      confidence: sig.confidence,
      action: sig.action,
    });
  }

  if (!forecast.on_track) {
    out.push({
      key: "rec_forecast_gap",
      title: "Close the revenue gap",
      reason: `The month is tracking about ${fmtMoney(Math.abs(forecast.gap))} short of target.`,
      impact: forecast.note,
      confidence: forecast.confidence,
      action: {
        label: "Plan the gap-close",
        command:
          "Given the current revenue pace versus this month's target, prepare a prioritized plan of the highest-impact actions available to close the gap, grounded in the connected business data.",
      },
    });
  }

  return out.slice(0, 5);
}

/* ------------------------------------------------------------- daily brief */

/** Short, CEO-style: what changed overnight and the one priority. */
export function computeBrief(
  s: BusinessSnapshot,
  signals: Signal[],
  attentionCount: number,
  firstName?: string | null
): DailyBrief {
  const asOf = new Date(s.as_of);
  const hour = asOf.getUTCHours();
  const daypart = hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";
  const greeting = firstName ? `${daypart}, ${firstName}.` : `${daypart}.`;

  const lines: DailyBrief["lines"] = [];

  const yesterday = lastWindow(s.series.revenue, 1)[0];
  if (yesterday) {
    lines.push({ kind: "metric", label: "Revenue", text: `${fmtMoney(yesterday.value)} yesterday` });
  }
  const newCust = lastWindow(s.series.new_customers, 1)[0];
  if (newCust) {
    lines.push({ kind: "metric", label: "New customers", text: fmtCount(newCust.value) });
  }

  const important = signals.find((x) => x.severity === "critical" || x.severity === "important");
  if (important) {
    lines.push({ kind: "signal", label: "Important signal", text: important.title });
  }
  const opportunity = signals.find((x) => x.severity === "opportunity");
  if (opportunity) {
    lines.push({ kind: "opportunity", label: "Opportunity", text: opportunity.title });
  }
  if (attentionCount > 0) {
    lines.push({
      kind: "attention",
      label: "Needs attention",
      text: `${attentionCount} item${attentionCount === 1 ? "" : "s"} in the priority queue`,
    });
  }

  // The one priority: the top actionable signal, phrased as a direction.
  const top = signals.find((x) => x.action && (x.severity === "critical" || x.severity === "important"));
  if (top?.action) {
    lines.push({ kind: "priority", label: "Recommended priority", text: `${top.action.label} — ${top.title.toLowerCase()}.` });
  }

  return {
    greeting,
    date: asOf.toISOString().slice(0, 10),
    lines,
  };
}
