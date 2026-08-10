/**
 * Layout-matching loading placeholders — never a full-screen spinner.
 *
 * A skeleton is a promise about the shape of what's coming, so each of these
 * matches the real thing it stands in for: same radii, same row heights, same
 * number of lines. The highlight travels across the block rather than pulsing
 * the whole thing, which reads as work in progress instead of a broken tile,
 * and it is a transform on an overlay so nothing here costs a layout pass.
 */
export function SkeletonBlock({ className = "" }: { className?: string }) {
  return (
    <div
      aria-hidden="true"
      className={`skeleton-sheen relative overflow-hidden rounded-btn bg-cream-deep ${className}`}
    />
  );
}

export function SkeletonCard() {
  return (
    <div
      className="rounded-card bg-surface/60 p-4 shadow-e1 ring-1 ring-inset ring-line/50"
      aria-hidden="true"
    >
      <div className="flex gap-2">
        <SkeletonBlock className="h-5 w-24" />
        <SkeletonBlock className="h-5 w-28" />
      </div>
      <SkeletonBlock className="mt-3 h-4 w-3/4" />
      <SkeletonBlock className="mt-2 h-4 w-1/2" />
      <div className="mt-4 flex gap-2">
        <SkeletonBlock className="h-9 w-28" />
        <SkeletonBlock className="h-9 w-20" />
      </div>
    </div>
  );
}

export function SkeletonRows({ rows = 4 }: { rows?: number }) {
  return (
    <div className="flex flex-col gap-2" aria-hidden="true">
      {Array.from({ length: rows }).map((_, i) => (
        <SkeletonBlock key={i} className="h-14 w-full" />
      ))}
    </div>
  );
}

/** The overview grid, mid-load. Matches StatTile's box so nothing shifts. */
export function SkeletonTiles({ tiles = 4 }: { tiles?: number }) {
  return (
    <div
      className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4"
      aria-hidden="true"
    >
      {Array.from({ length: tiles }).map((_, i) => (
        <div
          key={i}
          className="flex flex-col gap-2 rounded-card bg-surface/60 p-4 shadow-e1 ring-1 ring-inset ring-line/50"
        >
          <div className="flex items-center gap-2">
            <SkeletonBlock className="h-7 w-7" />
            <SkeletonBlock className="h-3 w-16" />
          </div>
          <SkeletonBlock className="h-8 w-14" />
          <SkeletonBlock className="h-3 w-20" />
        </div>
      ))}
    </div>
  );
}
