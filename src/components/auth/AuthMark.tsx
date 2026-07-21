"use client";


/**
 * The Cosigno mark as the auth centerpiece — the same geometry as CosignoMark
 * (see components/brand/Logo.tsx), but wired to progressively activate as the
 * fields fill.
 *
 *   - Two faint outlines are ALWAYS present (~30% presence at rest): a dim ink
 *     C and an empty orange check.
 *   - The bright ink C draws along its arc as the email fills (email → 0..1),
 *     charging like a battery (stroke-dashoffset off `--email-progress`).
 *   - The bright orange check draws in as the password fills (pass → 0..1),
 *     brightening to full signal-orange (off `--pass-progress`).
 *   - When both are ready the whole mark takes one soft, continuous breath.
 *   - On submit (`stamped`) the check does a stroke-draw stamp + settle.
 *
 * Progress is handed to CSS as the custom properties `--email-progress` and
 * `--pass-progress` (0..1); stroke-dashoffset and opacity are derived from them
 * with a CSS transition so the fill eases and never jumps.
 *
 * Reduced motion: the mark simply appears fully lit — no progressive fill, no
 * transition, no breath, no stamp.
 */

const C_PATH = "M112 35C91 17 59 17 37 37C13 59 13 101 37 123C59 143 91 143 112 125";
const CHECK_PATH = "M42 83L68 111L136 42";

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
        viewBox="0 0 160 160"
        fill="none"
        aria-hidden="true"
        className="overflow-visible"
      >
        {/* Always-present outlines so the mark reads clearly as cosigno even
            before typing — it then brightens to full as the fields fill. */}
        <path
          d={C_PATH}
          stroke="var(--logo-c)"
          strokeWidth={22}
          strokeLinecap="round"
          opacity={0.32}
        />
        <path
          d={CHECK_PATH}
          stroke="var(--logo-check)"
          strokeWidth={20}
          strokeLinecap="round"
          strokeLinejoin="round"
          opacity={0.28}
        />

        {/* the C fills along its arc as the email fills */}
        <path
          d={C_PATH}
          stroke="var(--logo-c)"
          strokeWidth={22}
          strokeLinecap="round"
          pathLength={1}
          strokeDasharray={1}
          style={{
            strokeDashoffset: reducedMotion
              ? 0
              : "calc(1 - var(--email-progress))",
            opacity: reducedMotion
              ? 1
              : "calc(0.55 + 0.45 * var(--email-progress))",
            transition,
          }}
        />

        {/* the orange check draws in as the password fills; stamps on submit */}
        <path
          d={CHECK_PATH}
          stroke="var(--logo-check)"
          strokeWidth={20}
          strokeLinecap="round"
          strokeLinejoin="round"
          pathLength={1}
          strokeDasharray={1}
          className={
            stamped && !reducedMotion
              ? "animate-check-pop [transform-box:fill-box] [transform-origin:center]"
              : ""
          }
          style={{
            strokeDashoffset: reducedMotion
              ? 0
              : "calc(1 - var(--pass-progress))",
            opacity: reducedMotion
              ? 1
              : "calc(0.5 + 0.5 * var(--pass-progress))",
            transition,
          }}
        />
      </svg>
    </span>
  );
}
