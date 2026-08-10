/**
 * The one time vocabulary — every human-readable time in the product is
 * formed here.
 *
 * This module exists for the same reason lib/status.ts does. The same moment
 * used to read five different ways depending on the surface: "3m ago" in the
 * feed, "3 min ago" in mission control, "3 minutes" in the briefing, "about 3
 * minutes" on a card, and a hand-rolled `Math.round((Date.now() - t) / 60000)`
 * in every one of them. Each was defensible alone; together they taught
 * people that cosigno's times are vibes — expensive for a product whose whole
 * pitch is that its words are exact — and every new surface re-implemented
 * the arithmetic, rounding, and edge cases from scratch.
 *
 * There are deliberately SEVERAL registers here, not one: a live-ops console
 * wants "3h 12m ago" where a feed wants "3h ago" and a briefing wants "3
 * hours". The point of the module is not that every surface says times
 * identically — it is that the registers are ENUMERATED, named, and defined
 * once, so choosing one is a design decision and inventing a sixth is a
 * code-review conversation. A sweep test (one-time-language.test.ts) keeps
 * hand-rolled formatting from growing back.
 *
 * Every function is pure and total: `now` is a parameter (components pass
 * Date.now(); pure libs pass the Date they were given), garbage input
 * returns "" rather than "NaN minutes ago", and nothing here reads a clock —
 * which is also what keeps these safe to call during SSR only when the
 * caller controls `now` (see components/ui/RelativeTime for the
 * hydration-safe client wrapper).
 */

type Now = number | Date;

function nowMs(now: Now): number {
  return typeof now === "number" ? now : now.getTime();
}

/** Signed minutes from `a` to `b`, or null when either fails to parse. */
export function minutesBetween(aIso: string, bIso: string): number | null {
  const a = Date.parse(aIso);
  const b = Date.parse(bIso);
  if (Number.isNaN(a) || Number.isNaN(b) || b < a) return null;
  return (b - a) / 60_000;
}

/** Elapsed whole minutes since `iso`, clamped at zero. Null on garbage. */
function minutesSince(iso: string, now: Now): number | null {
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return null;
  return Math.max(0, Math.round((nowMs(now) - t) / 60_000));
}

/* ------------------------------------------------------------- durations */

/**
 * A span of time as a noun: "12 minutes", "3 hours", "2 days".
 *
 * `approx` prefixes "about" — the register for a statistic ("you usually
 * decide within about 20 minutes"), where false precision would be read as
 * a measurement nobody took. Sub-minute spans are "under a minute" in both
 * registers: "0 minutes" reads as a recording failure, and a fast run is
 * the good case.
 */
export function duration(minutes: number, style: "plain" | "approx" = "plain"): string {
  const about = style === "approx" ? "about " : "";
  if (minutes < 1) return "under a minute";
  if (minutes < 90) {
    const m = Math.round(minutes);
    return `${about}${m} minute${m === 1 ? "" : "s"}`;
  }
  const hours = minutes / 60;
  if (hours < 36) {
    const h = Math.round(hours);
    return `${about}${h} hour${h === 1 ? "" : "s"}`;
  }
  const d = Math.round(hours / 24);
  return `${about}${d} day${d === 1 ? "" : "s"}`;
}

/* ------------------------------------------------------------------ ago */

/**
 * Compact past: "just now" / "3m ago" / "2h ago" / "4d ago", then the date.
 *
 * The register for feeds and timestamps in corners — dense surfaces where
 * the time is metadata, not the message. Beyond a week the relative form
 * stops being information ("9d ago" is homework) and the date takes over.
 */
export function agoCompact(iso: string, now: Now = Date.now()): string {
  const mins = minutesSince(iso, now);
  if (mins === null) return "";
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(Date.parse(iso)).toLocaleDateString([], { month: "short", day: "numeric" });
}

/**
 * Detailed past: "just now" / "5 min ago" / "3h 12m ago" / "2d ago".
 *
 * The live-ops register — mission control watches work in flight, where the
 * minutes inside an hour genuinely matter. Nothing else should want this.
 */
export function agoDetailed(iso: string, now: Now = Date.now()): string {
  const mins = minutesSince(iso, now);
  if (mins === null) return "";
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins} min ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ${mins % 60}m ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

/**
 * Long past, as a bare span: "20 minutes" / "3 hours" / "2 days".
 *
 * The prose register — the caller owns the sentence ("it has been 2 days",
 * "waiting 2 days"), so this deliberately carries no "ago".
 */
export function agoLong(iso: string, now: Now = Date.now()): string {
  const mins = minutesSince(iso, now);
  if (mins === null) return "";
  if (mins < 60) return `${mins} minute${mins === 1 ? "" : "s"}`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? "" : "s"}`;
  const days = Math.round(hours / 24);
  return `${days} day${days === 1 ? "" : "s"}`;
}

/**
 * Diagnostics past, from a millisecond DELTA: "never" / "45s ago" / "3m ago"
 * / "2h ago" / "4d ago".
 *
 * The only register with a seconds tier, for surfaces that watch machinery
 * (monitoring, health) where "just now" hides exactly the freshness being
 * checked. Takes a delta rather than an ISO because health endpoints report
 * ages, not timestamps.
 */
export function agoPrecise(deltaMs: number | null): string {
  if (deltaMs === null) return "never";
  const s = Math.round(deltaMs / 1000);
  if (s < 60) return `${s}s ago`;
  const m = Math.round(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  return h < 48 ? `${h}h ago` : `${Math.round(h / 24)}d ago`;
}

/* ---------------------------------------------------------------- until */

/**
 * Long future: "now" / "in 20 minutes" / "in 3 hours" / "tomorrow" / "in 3
 * days". The register for schedules in prose.
 */
export function untilLong(iso: string, now: Now = Date.now()): string {
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return "";
  const mins = Math.round((t - nowMs(now)) / 60_000);
  if (mins <= 0) return "now";
  if (mins < 60) return `in ${mins} minute${mins === 1 ? "" : "s"}`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `in ${hours} hour${hours === 1 ? "" : "s"}`;
  const days = Math.round(hours / 24);
  return days === 1 ? "tomorrow" : `in ${days} day${days === 1 ? "" : "s"}`;
}

/** Compact future: "due now" / "in 20m" / "in 3h" / "in 2d". For lanes. */
export function untilCompact(iso: string, now: Now = Date.now()): string {
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return "";
  const mins = Math.round((t - nowMs(now)) / 60_000);
  if (mins <= 0) return "due now";
  if (mins < 60) return `in ${mins}m`;
  const hours = Math.round(mins / 60);
  return hours < 24 ? `in ${hours}h` : `in ${Math.round(hours / 24)}d`;
}

/* ------------------------------------------------------------ composites */

/** "checked 3m ago" / "checked just now" / "not checked yet". */
export function checkedLabel(iso: string | null, now: Now = Date.now()): string {
  if (!iso || Number.isNaN(Date.parse(iso))) return "not checked yet";
  const label = agoCompact(iso, now);
  return label === "just now" ? "checked just now" : `checked ${label}`;
}
