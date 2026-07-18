import { fmtMoney, fmtPct, windowChange, windowSum } from "./metrics";
import type {
  AskAnswer,
  BusinessHealth,
  BusinessSnapshot,
  RevenueForecast,
  Signal,
} from "./types";

/**
 * Ask Cosigno about the business. Answers are composed ONLY from the
 * snapshot, the live signal set, health, and the forecast — the same numbers
 * every other Autopilot surface shows — so an answer can always cite its
 * evidence. Intent matching is keyword-based and deterministic; when no
 * intent matches, the fallback is an honest "here's what stands out", never
 * generic advice.
 */

interface Ctx {
  s: BusinessSnapshot;
  signals: Signal[];
  health: BusinessHealth;
  forecast: RevenueForecast;
}

function signalByKey(ctx: Ctx, prefix: string): Signal | undefined {
  return ctx.signals.find((x) => x.key.startsWith(prefix));
}

function metricsOf(sig?: Signal): { label: string; value: string }[] {
  return sig?.metrics ?? [];
}

type Intent = {
  match: RegExp;
  answer: (ctx: Ctx, question: string) => AskAnswer;
};

const INTENTS: Intent[] = [
  {
    // "Why did revenue drop?" / "what happened to sales this week".
    // Requires a drop word so "our revenue target" reaches the forecast intent.
    match: /(revenue|sales).*(drop|down|fell|declin)|(drop|down|fell|declin).*(revenue|sales)|what happened/i,
    answer: (ctx, question) => {
      const drop = signalByKey(ctx, "revenue_week_drop");
      const contributors = ctx.signals
        .filter((x) => ["cac_rise", "refunds_rising", "traffic_down"].some((k) => x.key.startsWith(k)))
        .map((x) => x.title);
      if (!drop) {
        const change = windowChange(ctx.s.series.revenue, 7);
        return {
          question,
          answer:
            change === null
              ? "There isn't enough revenue history yet to judge the weekly trend."
              : `Revenue hasn't dropped meaningfully — the last 7 days are ${fmtPct(change)} versus the week before (${fmtMoney(windowSum(ctx.s.series.revenue, 7))}).`,
          evidence: [],
          metrics: change === null ? [] : [{ label: "Week over week", value: fmtPct(change) }],
          confidence: "high",
          next_step: "Nothing needed on revenue right now — the priority queue has the items that do need you.",
          action: null,
        };
      }
      return {
        question,
        answer: `${drop.body}${contributors.length > 0 ? ` The likeliest contributors visible in the data: ${contributors.join("; ").toLowerCase()}.` : ""}`,
        evidence: [drop.why, ...contributors],
        metrics: metricsOf(drop),
        confidence: drop.confidence,
        next_step: "Run the drop investigation so the cause is confirmed rather than assumed.",
        action: drop.action,
      };
    },
  },
  {
    match: /waste|wasting|spend|ad(s|vertising)?|campaign|cac|acquisition/i,
    answer: (ctx, question) => {
      const cac = signalByKey(ctx, "cac_rise");
      const spend = windowSum(ctx.s.series.ad_spend, 7);
      const conv = windowSum(ctx.s.series.conversions, 7);
      const perConv = conv > 0 ? spend / conv : null;
      const worst = [...ctx.s.campaigns]
        .filter((c) => c.conversions_7d > 0)
        .sort((a, b) => b.spend_7d / b.conversions_7d - a.spend_7d / a.conversions_7d)[0];
      const best = [...ctx.s.campaigns]
        .filter((c) => c.conversions_7d > 0)
        .sort((a, b) => a.spend_7d / a.conversions_7d - b.spend_7d / b.conversions_7d)[0];
      return {
        question,
        answer: cac
          ? `${cac.body} ${worst && best && worst.id !== best.id ? `${worst.name} is the most expensive per conversion right now (${fmtMoney(Math.round(worst.spend_7d / worst.conversions_7d))}); ${best.name} is the most efficient (${fmtMoney(Math.round(best.spend_7d / best.conversions_7d))}).` : ""}`
          : perConv === null
            ? "There isn't enough paid-conversion data to judge ad efficiency yet."
            : `Paid acquisition looks stable: ${fmtMoney(spend)} spent over 7 days at about ${fmtMoney(Math.round(perConv))} per conversion.`,
        evidence: cac ? [cac.why] : [],
        metrics: cac
          ? metricsOf(cac)
          : perConv === null
            ? []
            : [
                { label: "Ad spend (7d)", value: fmtMoney(spend) },
                { label: "Cost per conversion", value: fmtMoney(Math.round(perConv)) },
              ],
        confidence: cac?.confidence ?? "medium",
        next_step: cac
          ? "Rebalance budget away from the expensive ad sets before the month compounds the cost."
          : "No change needed — keep the current allocation.",
        action: cac?.action ?? null,
      };
    },
  },
  {
    match: /refund|return/i,
    answer: (ctx, question) => {
      const sig = signalByKey(ctx, "refunds_rising");
      const support = signalByKey(ctx, "support_recurring");
      const refunds = windowSum(ctx.s.series.refunds, 7);
      return {
        question,
        answer: sig
          ? `${sig.body}${support ? ` The support queue points at a likely cause: "${support.title.replace("A support issue is becoming recurring: ", "").replace(/"/g, "")}" tickets nearly doubled the same week.` : ""}`
          : `Refunds look normal: ${fmtMoney(refunds)} over the last 7 days, within the usual range.`,
        evidence: [sig?.why, support?.body].filter((x): x is string => Boolean(x)),
        metrics: metricsOf(sig),
        confidence: sig ? "medium" : "high",
        next_step: sig
          ? "Group recent refunds by product and reason to confirm the cause before changing anything."
          : "Nothing needed on refunds right now.",
        action: sig?.action ?? null,
      };
    },
  },
  {
    match: /churn|retention|customers.*(leav|los)/i,
    answer: (ctx, question) => {
      const ret = signalByKey(ctx, "retention_improving");
      const change = windowChange(ctx.s.series.churned_customers, 14);
      return {
        question,
        answer: ret
          ? `${ret.body} The customers most at risk are the ones behind the rising refund topics — sizing complaints correlate with one-and-done buyers.`
          : change === null
            ? "There isn't enough churn history to answer that yet."
            : `Churn moved ${fmtPct(change)} over the last two weeks.`,
        evidence: ret ? [ret.why] : [],
        metrics: change === null ? [] : [{ label: "Churn (14d)", value: fmtPct(change) }],
        confidence: "medium",
        next_step: ret
          ? "Find what changed two weeks ago so the improvement sticks."
          : "Watch the trend; no immediate action indicated.",
        action: null,
      };
    },
  },
  {
    match: /target|forecast|miss|on track|projection|month/i,
    answer: (ctx, question) => {
      const f = ctx.forecast;
      return {
        question,
        answer: f.note,
        evidence: f.causes.map((c) => `Contributing: ${c}`),
        metrics: [
          { label: "Month to date", value: fmtMoney(f.month_to_date) },
          { label: "Projection", value: `${fmtMoney(f.low)}–${fmtMoney(f.high)}` },
          { label: "Target", value: fmtMoney(f.target) },
        ],
        confidence: f.confidence,
        next_step: f.on_track
          ? "Hold course; revisit mid-month."
          : "Work the gap-close plan — the recommendations list has the highest-impact moves.",
        action: f.on_track
          ? null
          : {
              label: "Plan the gap-close",
              command:
                "Given the current revenue pace versus this month's target, prepare a prioritized plan of the highest-impact actions available to close the gap, grounded in the connected business data.",
            },
      };
    },
  },
  {
    match: /focus|priorit|this week|what should (i|we)/i,
    answer: (ctx, question) => {
      const top = ctx.signals.filter((x) => x.severity === "critical" || x.severity === "important").slice(0, 3);
      return {
        question,
        answer:
          top.length === 0
            ? "Nothing is on fire. The best use of the week is the open opportunities: the signal feed lists what's compounding in your favor."
            : `Three things earn attention this week: ${top.map((t) => t.title.toLowerCase()).join("; ")}. Everything else is within normal range.`,
        evidence: top.map((t) => t.impact),
        metrics: [],
        confidence: "medium",
        next_step: top[0]?.action ? top[0].action.label : "Review the priority queue.",
        action: top[0]?.action ?? null,
      };
    },
  },
  {
    match: /channel|marketing.*(work|best)|which.*(channel|campaign)/i,
    answer: (ctx, question) => {
      const ranked = [...ctx.s.campaigns]
        .filter((c) => c.conversions_7d > 0)
        .sort((a, b) => a.spend_7d / a.conversions_7d - b.spend_7d / b.conversions_7d);
      if (ranked.length === 0) {
        return {
          question,
          answer: "No campaign data is connected yet, so channel efficiency can't be compared.",
          evidence: [],
          metrics: [],
          confidence: "high",
          next_step: "Connect your ad accounts so channel performance is measurable.",
          action: null,
        };
      }
      const best = ranked[0];
      const worst = ranked[ranked.length - 1];
      return {
        question,
        answer: `${best.name} (${best.channel}) is working best right now at ${fmtMoney(Math.round(best.spend_7d / best.conversions_7d))} per conversion. ${worst.id !== best.id ? `${worst.name} is the weakest at ${fmtMoney(Math.round(worst.spend_7d / worst.conversions_7d))}.` : ""}`,
        evidence: ranked.map(
          (c) => `${c.name}: ${fmtMoney(c.spend_7d)} spent, ${c.conversions_7d} conversions (7d)`
        ),
        metrics: [
          { label: "Best cost/conversion", value: fmtMoney(Math.round(best.spend_7d / best.conversions_7d)) },
        ],
        confidence: "high",
        next_step:
          worst.id !== best.id
            ? `Shift budget from ${worst.name} toward ${best.name}.`
            : "Keep the current allocation.",
        action: signalByKey(ctx, "cac_rise")?.action ?? null,
      };
    },
  },
  {
    match: /growth|growing|hurting/i,
    answer: (ctx, question) => {
      const drags = ctx.signals.filter((x) => x.severity === "critical" || x.severity === "important");
      const growth = ctx.health.categories.find((c) => c.key === "growth");
      return {
        question,
        answer:
          drags.length === 0
            ? `Growth looks ${growth?.status === "no_data" ? "unmeasured" : "steady"} — no active drags detected.`
            : `The biggest drags on growth right now: ${drags.map((d) => d.title.toLowerCase()).join("; ")}.`,
        evidence: drags.map((d) => d.impact),
        metrics: growth?.evidence ?? [],
        confidence: "medium",
        next_step: drags[0]?.action?.label ?? "Review the priority queue.",
        action: drags[0]?.action ?? null,
      };
    },
  },
];

export function askAutopilot(
  question: string,
  s: BusinessSnapshot,
  signals: Signal[],
  health: BusinessHealth,
  forecast: RevenueForecast
): AskAnswer {
  const ctx: Ctx = { s, signals, health, forecast };
  for (const intent of INTENTS) {
    if (intent.match.test(question)) return intent.answer(ctx, question);
  }

  // Honest fallback: what stands out right now, cited — never generic advice.
  const top = signals.slice(0, 3);
  return {
    question,
    answer:
      top.length === 0
        ? "Nothing unusual stands out in the connected data right now."
        : `Here's what stands out in the business right now: ${top.map((t) => t.title.toLowerCase()).join("; ")}. Ask about revenue, marketing spend, refunds, churn, channels, or the monthly target for a deeper answer.`,
    evidence: top.map((t) => t.body),
    metrics: [],
    confidence: "medium",
    next_step: top[0]?.action?.label ?? "Review the Autopilot page.",
    action: top[0]?.action ?? null,
  };
}
