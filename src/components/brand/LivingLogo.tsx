"use client";

import { CosignoLogo, CosignoMark, CosignoWordmark } from "./Logo";
import { useBreathing } from "@/lib/useBreathing";

/**
 * A soft, low-opacity drop shadow that lifts the mark off a flat surface
 * (the cream page) without reading as skeuomorphic. Compositor-friendly and
 * static — it never animates. Applied to the mark only, never the wordmark.
 */
const LIFT = "[filter:drop-shadow(0_1.5px_1.5px_rgba(20,20,20,0.22))]";

/**
 * The mark, alive. Same geometry as CosignoMark, but it joins the living-logo
 * coordinator (useBreathing) so it breathes only when it's the topmost mark on
 * screen — and never under reduced motion or before first paint. Use this
 * anywhere the bare mark would otherwise sit; use plain CosignoMark for static
 * contexts (SVG assets, favicons, dense lists). `lift` adds the soft shadow.
 */
export function LivingMark({
  size = 28,
  className = "",
  lift = false,
}: {
  size?: number;
  className?: string;
  lift?: boolean;
}) {
  const { ref, active } = useBreathing<HTMLSpanElement>();
  return (
    <span
      ref={ref}
      className={`inline-flex [transform-origin:center] ${
        active ? "animate-logo-breath" : ""
      } ${lift ? LIFT : ""} ${className}`}
    >
      <CosignoMark size={size} markClassName={active ? "animate-logo-glow" : ""} />
    </span>
  );
}

/** Living mark + wordmark lockup. The breath (and optional lift) is on the mark only. */
export function LivingLockup({
  size = 28,
  textClass = "text-2xl",
  lift = false,
}: {
  size?: number;
  textClass?: string;
  lift?: boolean;
}) {
  const { ref, active } = useBreathing<HTMLSpanElement>();
  return (
    <span ref={ref} className="inline-flex items-center gap-2">
      <span
        className={`inline-flex [transform-origin:center] ${
          active ? "animate-logo-breath" : ""
        } ${lift ? LIFT : ""}`}
      >
        <CosignoMark size={size} markClassName={active ? "animate-logo-glow" : ""} />
      </span>
      <CosignoWordmark className={textClass} />
    </span>
  );
}

/**
 * The header brand: the lifted lockup as a home link with room to breathe and
 * a tasteful hover. Generous padding (offset by a negative margin so it never
 * shifts the header layout) gives a comfortable click target and a subtle
 * cream-deep pill on hover; the whole lockup lifts a hair and the mark keeps
 * its soft shadow — enough presence to feel like a brand, not body text.
 */
export function LogoHome({
  href = "/",
  size = 30,
  label = "Cosigno",
  variant = "full",
  textClass,
}: {
  href?: string;
  size?: number;
  /**
   * Legacy escape hatch: callers used `textClass="hidden"` to ask for a
   * mark-only lockup. That was silently ignored, so narrow containers (the
   * 76px desktop rail) rendered the full wordmark and clipped it. It now maps
   * to `variant="mark"`; prefer passing `variant` directly.
   */
  textClass?: string;
  /** "mark" renders the icon alone — correct for narrow rails and tight chrome. */
  variant?: "full" | "mark";
  label?: string;
  prefetch?: boolean;
}) {
  const resolved = textClass === "hidden" ? "mark" : variant;
  // Mark-only sits in a square target so it optically centers in a fixed-width
  // rail; the full lockup keeps the horizontal hover pill.
  const shell =
    resolved === "mark"
      ? "group grid h-11 w-11 place-items-center rounded-btn transition duration-fast ease-brand-out hover:bg-cream-deep/60"
      : "group -mx-2 -my-1 rounded-btn px-2 py-1 transition duration-fast ease-brand-out hover:-translate-y-px hover:bg-cream-deep/60";
  return (
    <CosignoLogo
      variant={resolved}
      href={href}
      size={size}
      label={label}
      className={`${shell} focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-signal focus-visible:ring-offset-2 focus-visible:ring-offset-cream`}
    />
  );
}
