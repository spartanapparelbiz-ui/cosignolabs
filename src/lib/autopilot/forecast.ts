import {
  daysInMonth,
  fmtMoney,
  monthToDate,
  sum,
  windowMean,
  windowStdDev,
} from "./metrics";
import type { BusinessSnapshot, RevenueForecast, Signal } from "./types";

/**
 * Lightweight revenue forecasting: month-to-date actuals plus the remaining
 * days at a blended recent daily pace (recent week weighted over the recent
 * month so a fresh trend moves the projection). The band comes from observed
 * daily variability — the forecast always states its uncertainty and never
 * presents the projection as a guarantee.
 */
export function computeForecast(s: BusinessSnapshot, signals: Signal[]): RevenueForecast {
  const asOf = new Date(s.as_of);
  const mtdPoints = monthToDate(s.series.revenue, asOf);
  const mtd = sum(mtdPoints);
  const daysGone = mtdPoints.length;
  const daysLeft = Math.max(0, daysInMonth(asOf) - daysGone);

  // Recent pace: the last 7 days carry more weight than the last 28.
  const pace = windowMean(s.series.revenue, 7) * 0.6 + windowMean(s.series.revenue, 28) * 0.4;
  const projection = Math.round(mtd + pace * daysLeft);

  // Uncertainty grows with the remaining days: ±1 stddev per remaining day.
  const spread = Math.round(windowStdDev(s.series.revenue, 28) * Math.sqrt(daysLeft) * 1.2);
  const low = Math.max(mtd, projection - spread);
  const high = projection + spread;

  const target = s.monthly_target;
  const gap = projection - target;
  const onTrack = gap >= 0;

  // Causes come from the live signal set — never generic filler.
  const causes = signals
    .filter((x) => x.severity === "critical" || x.severity === "important")
    .filter((x) => ["revenue", "marketing", "risk", "sales", "finance"].includes(x.kind))
    .slice(0, 3)
    .map((x) => x.title);

  const confidence = daysLeft <= 7 ? "high" : daysLeft <= 18 ? "medium" : "low";

  return {
    month: asOf.toISOString().slice(0, 7),
    month_to_date: Math.round(mtd),
    projection,
    low,
    high,
    target,
    gap,
    on_track: onTrack,
    confidence,
    causes,
    note: onTrack
      ? `Projection ${fmtMoney(projection)} vs target ${fmtMoney(target)} — currently on track, with a realistic range of ${fmtMoney(low)}–${fmtMoney(high)}. This is an estimate from the recent pace, not a guarantee.`
      : `Projection ${fmtMoney(projection)} vs target ${fmtMoney(target)} — likely to miss by about ${fmtMoney(Math.abs(gap))} on the current pace (realistic range ${fmtMoney(low)}–${fmtMoney(high)}). This is an estimate, not a certainty.`,
  };
}
