/**
 * The 3D logo mark for the hero: soft settle on mount (scale 0.96→1 + fade,
 * once) then a gentle float idle. Both transform/opacity only; the float
 * stops under prefers-reduced-motion. A plain <img> with intrinsic
 * width/height (1200×352) — the asset is small and pre-optimized, so this
 * avoids the next/image client runtime and the /_next/image round-trip,
 * keeping TBT low, and the fixed ratio reserves space so there's no CLS.
 */
export function HeroMark() {
  return (
    <div className="animate-settle">
      <div className="motion-safe:animate-float">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/brand/logo-3d.png"
          alt="cosigno"
          width={1200}
          height={352}
          fetchPriority="high"
          decoding="async"
          className="h-auto w-full max-w-[440px] select-none"
          draggable={false}
        />
      </div>
    </div>
  );
}
