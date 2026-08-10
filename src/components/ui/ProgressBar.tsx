/**
 * The one progress bar — determinate when the work has countable parts,
 * indeterminate when it genuinely doesn't.
 *
 * The distinction is the whole point. A determinate bar is a promise about
 * how much is left, and a bar that fills to 90% on a timer while the work has
 * not started is the most common lie in software. So: pass `value` only when
 * it comes from something counted (steps completed, items processed).
 * Everything else is indeterminate, which says "running" honestly and says
 * nothing about how long.
 *
 * The fill is a scaleX transform rather than a width, so a bar animating from
 * 40% to 60% composites on the GPU and never reflows the row it sits in.
 */
export function ProgressBar({
  value,
  label,
  size = "md",
  tone = "signal",
}: {
  /** 0..1. Omit (or pass null) for indeterminate. */
  value?: number | null;
  /** Accessible name — required, since a bare bar tells a screen reader nothing. */
  label: string;
  size?: "sm" | "md";
  tone?: "signal" | "ink";
}) {
  const determinate = typeof value === "number" && Number.isFinite(value);
  const p = determinate ? Math.min(1, Math.max(0, value as number)) : 0;
  const track = size === "sm" ? "h-1" : "h-1.5";
  const fill = tone === "signal" ? "bg-signal" : "bg-ink";

  return (
    <div
      role="progressbar"
      aria-label={label}
      aria-valuemin={determinate ? 0 : undefined}
      aria-valuemax={determinate ? 100 : undefined}
      aria-valuenow={determinate ? Math.round(p * 100) : undefined}
      className={`relative w-full overflow-hidden rounded-pill bg-cream-deep ${track}`}
    >
      {determinate ? (
        <span
          className={`absolute inset-y-0 left-0 w-full origin-left rounded-pill ${fill} transition-transform duration-slow ease-brand-out`}
          style={{ transform: `scaleX(${p})` }}
          aria-hidden="true"
        />
      ) : (
        <span
          className={`absolute inset-y-0 left-0 w-1/3 animate-bar-travel rounded-pill ${fill}`}
          aria-hidden="true"
        />
      )}
    </div>
  );
}
