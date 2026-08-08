/**
 * Loading placeholders shaped like the thing that is coming.
 *
 * A spinner says "wait"; a skeleton says "this is what you're about to get",
 * and the page doesn't jump when it arrives. They shimmer rather than pulse —
 * the size never changes, so nothing reflows while you're reading around it.
 */
export function SkeletonBlock({
  className = "",
  style,
}: {
  className?: string;
  style?: React.CSSProperties;
}) {
  return (
    <div
      aria-hidden="true"
      style={style}
      className={`animate-shimmer rounded-btn bg-ink/[0.055] ${className}`}
    />
  );
}

export function SkeletonCard() {
  return (
    <div className="rounded-card bg-surface p-5 shadow-rest" aria-hidden="true">
      <SkeletonBlock className="h-4 w-2/3" />
      <SkeletonBlock className="mt-3 h-3 w-1/2" />
      <div className="mt-5 flex gap-2">
        <SkeletonBlock className="h-4 w-16 rounded-pill" />
        <SkeletonBlock className="h-4 w-20 rounded-pill" />
      </div>
      <div className="mt-6 flex gap-1.5">
        <SkeletonBlock className="h-[38px] w-24" />
        <SkeletonBlock className="h-[38px] w-16" />
      </div>
    </div>
  );
}

export function SkeletonRows({ rows = 4 }: { rows?: number }) {
  return (
    <div className="flex flex-col gap-1" aria-hidden="true">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="flex items-center gap-3 px-3 py-3">
          <SkeletonBlock className="h-[7px] w-[7px] rounded-pill" />
          <SkeletonBlock className="h-3.5" style={{ width: `${68 - i * 9}%` }} />
        </div>
      ))}
    </div>
  );
}
