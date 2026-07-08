"use client";

import { CosignoMark, CosignoWordmark } from "./Logo";
import { useBreathing } from "@/lib/useBreathing";

/**
 * The mark, alive. Same geometry as CosignoMark, but it joins the living-logo
 * coordinator (useBreathing) so it breathes only when it's the topmost mark on
 * screen — and never under reduced motion or before first paint. Use this
 * anywhere the bare mark would otherwise sit; use plain CosignoMark for static
 * contexts (SVG assets, favicons, dense lists).
 */
export function LivingMark({
  size = 28,
  className = "",
}: {
  size?: number;
  className?: string;
}) {
  const { ref, active } = useBreathing<HTMLSpanElement>();
  return (
    <span
      ref={ref}
      className={`inline-flex [transform-origin:center] ${
        active ? "animate-logo-breath" : ""
      } ${className}`}
    >
      <CosignoMark size={size} checkClassName={active ? "animate-logo-check" : ""} />
    </span>
  );
}

/** Living mark + wordmark lockup. The breath is on the mark only. */
export function LivingLockup({
  size = 28,
  textClass = "text-2xl",
}: {
  size?: number;
  textClass?: string;
}) {
  const { ref, active } = useBreathing<HTMLSpanElement>();
  return (
    <span ref={ref} className="inline-flex items-center gap-2">
      <span
        className={`inline-flex [transform-origin:center] ${
          active ? "animate-logo-breath" : ""
        }`}
      >
        <CosignoMark size={size} checkClassName={active ? "animate-logo-check" : ""} />
      </span>
      <CosignoWordmark className={textClass} />
    </span>
  );
}
