import type { MetricPoint } from "./types";

/**
 * Small, dependency-free series math the whole engine shares. Every function
 * is pure; windows are counted back from the END of the series (most recent
 * day last), so callers never index by date.
 */

export function sum(points: MetricPoint[]): number {
  return points.reduce((t, p) => t + p.value, 0);
}

/** The last `days` points. */
export function lastWindow(points: MetricPoint[], days: number): MetricPoint[] {
  return points.slice(-days);
}

/** The `days` points immediately before the last `days` points. */
export function prevWindow(points: MetricPoint[], days: number): MetricPoint[] {
  return points.slice(-days * 2, -days);
}

export function windowSum(points: MetricPoint[], days: number): number {
  return sum(lastWindow(points, days));
}

export function prevWindowSum(points: MetricPoint[], days: number): number {
  return sum(prevWindow(points, days));
}

/**
 * Fractional change between the trailing window and the one before it.
 * Returns null when the prior window is empty or zero (no honest baseline).
 */
export function windowChange(points: MetricPoint[], days: number): number | null {
  const prev = prevWindowSum(points, days);
  if (prev <= 0 || points.length < days * 2) return null;
  return (windowSum(points, days) - prev) / prev;
}

/** Mean of the last `days` values. */
export function windowMean(points: MetricPoint[], days: number): number {
  const w = lastWindow(points, days);
  return w.length === 0 ? 0 : sum(w) / w.length;
}

/** Population standard deviation of the last `days` values. */
export function windowStdDev(points: MetricPoint[], days: number): number {
  const w = lastWindow(points, days);
  if (w.length === 0) return 0;
  const mean = sum(w) / w.length;
  const variance = w.reduce((t, p) => t + (p.value - mean) ** 2, 0) / w.length;
  return Math.sqrt(variance);
}

/** Points that fall inside the calendar month of `asOf` (UTC). */
export function monthToDate(points: MetricPoint[], asOf: Date): MetricPoint[] {
  const prefix = asOf.toISOString().slice(0, 7); // YYYY-MM
  return points.filter((p) => p.date.startsWith(prefix));
}

export function daysInMonth(asOf: Date): number {
  return new Date(Date.UTC(asOf.getUTCFullYear(), asOf.getUTCMonth() + 1, 0)).getUTCDate();
}

/* ------------------------------------------------------------ formatting */

export function fmtMoney(n: number): string {
  const abs = Math.abs(n);
  const body =
    abs >= 1000
      ? Math.round(abs).toLocaleString("en-US")
      : abs.toFixed(abs % 1 === 0 ? 0 : 2);
  return `${n < 0 ? "-" : ""}$${body}`;
}

export function fmtCount(n: number): string {
  return Math.round(n).toLocaleString("en-US");
}

/** "+12%" / "-8%" — input is a fraction. */
export function fmtPct(fraction: number): string {
  const pct = Math.round(fraction * 100);
  return `${pct > 0 ? "+" : ""}${pct}%`;
}
