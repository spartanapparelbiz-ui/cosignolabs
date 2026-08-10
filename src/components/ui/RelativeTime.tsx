"use client";

import { useEffect, useState } from "react";

/**
 * "3m ago", rendered without breaking hydration.
 *
 * The problem this exists to solve is subtle and bites every app that shows
 * relative times: the server renders "2m ago", the browser hydrates a moment
 * later and computes "3m ago", and React throws a hydration mismatch and
 * regenerates the whole subtree on the client. It is invisible when it works
 * and expensive when it doesn't — and it only reproduces once there is real
 * data on the page, which is exactly when nobody is looking for it.
 *
 * The fix is to make the first client render agree with the server by
 * construction: both render the empty string, and the relative text arrives in
 * an effect, which only ever runs in the browser. One frame later than ideal,
 * and correct in every timezone.
 *
 * It also keeps ticking. A feed left open for ten minutes should not still say
 * "just now" — the interval is coarse (30s) because these labels are coarse.
 */

export function relativeLabel(iso: string, now = Date.now()): string {
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return "";
  const mins = Math.round((now - t) / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(t).toLocaleDateString([], { month: "short", day: "numeric" });
}

/** "checked 3m ago" / "not checked yet" — the health-line variant. */
export function checkedLabel(iso: string | null, now = Date.now()): string {
  if (!iso || Number.isNaN(Date.parse(iso))) return "not checked yet";
  const label = relativeLabel(iso, now);
  return label === "just now" ? "checked just now" : `checked ${label}`;
}

export function RelativeTime({
  iso,
  className = "",
  /** Wrap the label, e.g. checkedLabel. Defaults to the bare relative form. */
  format = relativeLabel,
}: {
  iso: string | null;
  className?: string;
  format?: (iso: string, now: number) => string;
}) {
  const [label, setLabel] = useState("");

  useEffect(() => {
    if (!iso) {
      setLabel(format === relativeLabel ? "" : format("", Date.now()));
      return;
    }
    const tick = () => setLabel(format(iso, Date.now()));
    tick();
    const id = setInterval(tick, 30_000);
    return () => clearInterval(id);
  }, [iso, format]);

  return (
    <time dateTime={iso ?? undefined} className={className}>
      {label}
    </time>
  );
}

/** The `format` for a connector's last health check. Stable identity. */
export function checkedFormat(iso: string, now: number): string {
  return checkedLabel(iso || null, now);
}
