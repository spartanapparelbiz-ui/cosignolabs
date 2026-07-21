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

const C_PATH = "M 70.5 16.44 C 57.77 18.37, 48.31 22.33, 38.54 29.81 C 21.17 43.11, 11 66.97, 13.93 87.6 C 15.73 100.3, 20.58 111.26, 28.77 121.1 C 36.28 130.12, 45.93 136.74, 57.35 140.71 C 63.74 142.94, 68.73 143.86, 76.25 144.19 C 98.96 145.2, 120.62 134.14, 133.15 115.13 C 136.96 109.34, 137.35 108.43, 137.09 105.75 C 136.93 104.12, 136.53 103.08, 135.73 102.31 C 134.56 101.17, 120.58 94.48, 119.35 94.48 C 117.11 94.48, 115.46 95.92, 112.37 100.55 C 108.24 106.77, 103.78 110.86, 97.8 113.91 C 91.25 117.27, 87.7 118.24, 80.92 118.55 C 71.49 118.99, 63.88 116.93, 56.43 111.95 C 50.48 107.97, 46.21 103.19, 43.25 97.2 C 40.26 91.14, 39.38 87.93, 39.07 81.86 C 38.53 71.6, 42.24 61.96, 49.83 53.95 C 61.7 41.4, 80.68 37.99, 96.16 45.6 C 98.26 46.63, 100.14 47.48, 100.35 47.48 C 100.55 47.48, 103.39 45.56, 106.65 43.22 C 109.91 40.88, 114.7 37.64, 117.3 36.02 C 119.89 34.4, 122.02 32.92, 122.02 32.72 C 122.02 31.8, 113.87 25.97, 109.22 23.56 C 103.29 20.47, 101.83 19.91, 94.72 17.97 C 89.97 16.68, 88.7 16.54, 80.71 16.39 C 75.88 16.3, 71.29 16.32, 70.5 16.44";
const CHECK_PATH = "M 141.25 35.34 C 124.28 41.92, 104.95 55.37, 86.12 73.71 C 82.43 77.3, 79.24 80.24, 79.03 80.24 C 78.82 80.24, 75.74 77.39, 72.2 73.9 C 65.01 66.83, 63.97 66.25, 59.07 66.56 C 56.67 66.71, 55.63 67.04, 54.02 68.17 C 51.22 70.13, 49.65 73.11, 49.63 76.47 C 49.61 79.78, 50.62 81.43, 57.24 88.87 C 59.87 91.83, 64.17 96.82, 66.8 99.97 C 69.43 103.12, 72.14 106.06, 72.82 106.5 C 75.05 107.97, 78.47 108.48, 81.49 107.8 C 84.76 107.07, 85.83 106.06, 99.03 91.16 C 114.24 73.98, 131.81 54.32, 139.69 45.63 C 143.81 41.08, 147.18 37, 147.18 36.56 C 147.18 35.6, 145.72 34.17, 144.77 34.21 C 144.4 34.22, 142.81 34.73, 141.25 35.34";

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
        {/* the orange C brightens in as the email fills */}
        <path
          d={C_PATH}
          fill="var(--logo-c)"
          style={{
            opacity: reducedMotion
              ? 1
              : "calc(0.3 + 0.7 * var(--email-progress))",
            transition,
          }}
        />

        {/* the check brightens in as the password fills; stamps on submit */}
        <path
          d={CHECK_PATH}
          fill="var(--logo-check)"
          className={
            stamped && !reducedMotion
              ? "animate-check-pop [transform-box:fill-box] [transform-origin:center]"
              : ""
          }
          style={{
            opacity: reducedMotion
              ? 1
              : "calc(0.28 + 0.72 * var(--pass-progress))",
            transition,
          }}
        />
      </svg>
    </span>
  );
}
