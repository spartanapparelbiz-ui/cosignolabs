"use client";

import { useEffect, useState } from "react";
import { agoCompact, checkedLabel } from "@/lib/time";

/**
 * "3m ago", rendered without breaking hydration.
 *
 * The formatting itself lives in lib/time — the one time vocabulary. This
 * component solves the OTHER half of the problem, which bites every app that
 * shows relative times: the server renders "2m ago", the browser hydrates a
 * moment later and computes "3m ago", and React throws a hydration mismatch
 * and regenerates the whole subtree. Invisible when it works, expensive when
 * it doesn't — and it only reproduces once there is real data on the page,
 * which is exactly when nobody is looking for it.
 *
 * The fix is to make the first client render agree with the server by
 * construction: both render the empty string, and the label arrives in an
 * effect, which only ever runs in the browser. One frame later than ideal,
 * and correct in every timezone.
 *
 * It also keeps ticking. A feed left open for ten minutes should not still
 * say "just now" — the interval is coarse (30s) because these labels are.
 */

export function RelativeTime({
  iso,
  className = "",
  /** Wrap the label, e.g. checkedFormat. Defaults to the feed register. */
  format = agoCompact,
}: {
  iso: string | null;
  className?: string;
  format?: (iso: string, now: number) => string;
}) {
  const [label, setLabel] = useState("");

  useEffect(() => {
    if (!iso) {
      setLabel(format === agoCompact ? "" : format("", Date.now()));
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

/** Back-compat aliases — the vocabulary itself lives in lib/time. */
export { agoCompact as relativeLabel, checkedLabel } from "@/lib/time";
