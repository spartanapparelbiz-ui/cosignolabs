"use client";

import { LOGO_COUNTER_PATH, LOGO_MARK_PATH, LOGO_VIEWBOX } from "@/components/brand/Logo";

/**
 * The Cosigno mark as the auth centerpiece — the same geometry as CosignoMark
 * (see components/brand/Logo.tsx), but wired to progressively activate as the
 * fields fill. The mark completes itself: it starts as a dim solid slab and
 * ends as the logo exactly as it ships.
 *
 *   - The mark is ALWAYS present, faint (~30%) at rest, so the page reads as
 *     cosigno before a key is pressed.
 *   - It brightens to full signal-orange as the email fills (email → 0..1).
 *   - The counter opens as the password fills (pass → 0..1): it is painted in
 *     the page surface and fades away, so the hole appears and the mark
 *     resolves into the finished logo.
 *   - When both are ready the whole mark takes one soft, continuous breath.
 *   - On submit (`stamped`) the finished mark does a pop + settle.
 *
 * Progress is handed to CSS as the custom properties `--email-progress` and
 * `--pass-progress` (0..1); the opacities are derived from them with a CSS
 * transition so the fill eases and never jumps.
 *
 * Reduced motion: the mark simply appears fully lit — no progressive fill, no
 * transition, no breath, no stamp.
 */

function clamp01(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(1, n));
}

export function AuthMark({
  size = 132,
  emailProgress,
  passProgress,
  ready,
  stamped = false,
  reducedMotion = false,
  className = "",
}: {
  size?: number;
  emailProgress: number;
  passProgress: number;
  ready: boolean;
  /** Set briefly on successful submit to trigger the check stamp. */
  stamped?: boolean;
  reducedMotion?: boolean;
  className?: string;
}) {
  // Reduced motion (or a completed stamp) shows the fully lit end-state.
  const email = reducedMotion || stamped ? 1 : clamp01(emailProgress);
  const pass = reducedMotion || stamped ? 1 : clamp01(passProgress);
  const breathe = !reducedMotion && (ready || stamped);

  const transition = reducedMotion
    ? undefined
    : "stroke-dashoffset 520ms cubic-bezier(0.22,1,0.36,1), opacity 520ms ease";

  return (
    <span
      className={`inline-flex [transform-origin:center] ${
        breathe ? "animate-logo-breath" : ""
      } ${className}`}
      style={
        {
          "--email-progress": email,
          "--pass-progress": pass,
        } as React.CSSProperties
      }
    >
      <svg
        width={size}
        height={size}
        viewBox={LOGO_VIEWBOX}
        fill="none"
        aria-hidden="true"
        className={`overflow-visible ${
          stamped && !reducedMotion
            ? "animate-check-pop [transform-box:fill-box] [transform-origin:center]"
            : ""
        }`}
      >
        {/* Always present so the mark reads clearly as cosigno even before
            typing — it then brightens to full as the email fills. */}
        <path
          d={LOGO_MARK_PATH}
          fillRule="evenodd"
          clipRule="evenodd"
          fill="var(--logo-mark)"
          style={{
            opacity: reducedMotion
              ? 1
              : "calc(0.3 + 0.7 * var(--email-progress))",
            transition,
          }}
        />

        {/* The counter, plugged with the mark's own orange so the shape starts
            as a solid slab and OPENS as the password fills — painting it in the
            page colour would have made "closed" and "open" look identical. It
            reaches zero, and the mark lands on the finished logo, at exactly
            the moment the form is ready. */}
        <path
          d={LOGO_COUNTER_PATH}
          fill="var(--logo-mark)"
          style={{
            opacity: reducedMotion
              ? 0
              : "calc((1 - var(--pass-progress)) * (0.3 + 0.7 * var(--email-progress)))",
            transition,
          }}
        />
      </svg>
    </span>
  );
}
