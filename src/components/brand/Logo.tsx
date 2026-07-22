import type { CSSProperties } from "react";
import Link from "next/link";

/**
 * The cosigno mark — one unified, proprietary symbol: a bold open ORANGE C
 * (opening on the right) with a real CHECK rising through the opening. The C is
 * cosigno; the check is approval / permission / completion / signing off. No
 * circle, no shield, no signature, no gradient/shadow/glow. No dot on the icon
 * — the orange dot lives over the "i" in the wordmark.
 *
 * Colors are driven entirely by CSS custom properties so the mark flips with
 * the theme WITHOUT a flash (data-theme is set before paint) and stays
 * hydration-safe (no JS/state):
 *   --logo-c         the C                — #FB4C20 in every theme
 *   --logo-check     the checkmark        — #171512 light / #F7F0E5 dark / #FB4C20 oled
 *   --logo-wordmark  the wordmark         — #171512 light / #F7F0E5 dark / #FFFFFF oled
 *   --logo-dot       the i-dot            — #FB4C20 in every theme
 * An explicit `theme` prop overrides these inline (OLED, or a known fixed
 * light/dark surface such as the OG image or a dark footer).
 *
 * Geometry mirrors scripts/logo-geometry.mjs (viewBox 0 0 160 160). The check
 * stays fully recognizable at a 20px mark; strokes carry no thin details.
 */

/* --- shared geometry (single source; mirrored in scripts/logo-geometry.mjs) */
export const LOGO_VIEWBOX = "0 0 160 160";
export const LOGO_C_PATH =
  "M 70.5 16.44 C 57.77 18.37, 48.31 22.33, 38.54 29.81 C 21.17 43.11, 11 66.97, 13.93 87.6 C 15.73 100.3, 20.58 111.26, 28.77 121.1 C 36.28 130.12, 45.93 136.74, 57.35 140.71 C 63.74 142.94, 68.73 143.86, 76.25 144.19 C 98.96 145.2, 120.62 134.14, 133.15 115.13 C 136.96 109.34, 137.35 108.43, 137.09 105.75 C 136.93 104.12, 136.53 103.08, 135.73 102.31 C 134.56 101.17, 120.58 94.48, 119.35 94.48 C 117.11 94.48, 115.46 95.92, 112.37 100.55 C 108.24 106.77, 103.78 110.86, 97.8 113.91 C 91.25 117.27, 87.7 118.24, 80.92 118.55 C 71.49 118.99, 63.88 116.93, 56.43 111.95 C 50.48 107.97, 46.21 103.19, 43.25 97.2 C 40.26 91.14, 39.38 87.93, 39.07 81.86 C 38.53 71.6, 42.24 61.96, 49.83 53.95 C 61.7 41.4, 80.68 37.99, 96.16 45.6 C 98.26 46.63, 100.14 47.48, 100.35 47.48 C 100.55 47.48, 103.39 45.56, 106.65 43.22 C 109.91 40.88, 114.7 37.64, 117.3 36.02 C 119.89 34.4, 122.02 32.92, 122.02 32.72 C 122.02 31.8, 113.87 25.97, 109.22 23.56 C 103.29 20.47, 101.83 19.91, 94.72 17.97 C 89.97 16.68, 88.7 16.54, 80.71 16.39 C 75.88 16.3, 71.29 16.32, 70.5 16.44";
export const LOGO_CHECK_PATH = "M 141.25 35.34 C 124.28 41.92, 104.95 55.37, 86.12 73.71 C 82.43 77.3, 79.24 80.24, 79.03 80.24 C 78.82 80.24, 75.74 77.39, 72.2 73.9 C 65.01 66.83, 63.97 66.25, 59.07 66.56 C 56.67 66.71, 55.63 67.04, 54.02 68.17 C 51.22 70.13, 49.65 73.11, 49.63 76.47 C 49.61 79.78, 50.62 81.43, 57.24 88.87 C 59.87 91.83, 64.17 96.82, 66.8 99.97 C 69.43 103.12, 72.14 106.06, 72.82 106.5 C 75.05 107.97, 78.47 108.48, 81.49 107.8 C 84.76 107.07, 85.83 106.06, 99.03 91.16 C 114.24 73.98, 131.81 54.32, 139.69 45.63 C 143.81 41.08, 147.18 37, 147.18 36.56 C 147.18 35.6, 145.72 34.17, 144.77 34.21 C 144.4 34.22, 142.81 34.73, 141.25 35.34";
export const LOGO_C_WIDTH = 22;
export const LOGO_CHECK_WIDTH = 20;

export type LogoTheme = "light" | "dark" | "oled" | "auto";

/** Inline CSS-var overrides for an explicit theme; `auto` inherits the globals. */
const THEME_VARS: Record<Exclude<LogoTheme, "auto">, CSSProperties> = {
  light: { "--logo-c": "#FB4C20", "--logo-check": "#171512", "--logo-wordmark": "#171512", "--logo-dot": "#FB4C20" } as CSSProperties,
  dark: { "--logo-c": "#FB4C20", "--logo-check": "#F7F0E5", "--logo-wordmark": "#F7F0E5", "--logo-dot": "#FB4C20" } as CSSProperties,
  oled: { "--logo-c": "#FB4C20", "--logo-check": "#FB4C20", "--logo-wordmark": "#FFFFFF", "--logo-dot": "#FB4C20" } as CSSProperties,
};

/**
 * The bare icon (C + real checkmark). `mono` renders it in a single color
 * (currentColor) for one-color contexts; otherwise the C is orange and the
 * check is theme-aware. `checkClassName` lets the living-logo drive the check.
 */
export function CosignoMark({
  size = 28,
  checkClassName = "",
  mono = false,
}: {
  size?: number;
  checkClassName?: string;
  mono?: boolean;
}) {
  const cColor = mono ? "currentColor" : "var(--logo-c)";
  const checkColor = mono ? "currentColor" : "var(--logo-check)";
  return (
    <svg width={size} height={size} viewBox={LOGO_VIEWBOX} fill="none" aria-hidden="true">
      <path d={LOGO_C_PATH} fill={cColor} />
      <path d={LOGO_CHECK_PATH} fill={checkColor} className={checkClassName} />
    </svg>
  );
}

/** Lowercase "cosigno" wordmark with the orange i-dot over a dotless "ı". */
export function CosignoWordmark({ className = "" }: { className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={`font-bold lowercase ${className}`}
      style={{
        color: "var(--logo-wordmark)",
        fontFamily: "var(--font-wordmark), system-ui, sans-serif",
        fontWeight: 700,
        letterSpacing: "-0.01em",
      }}
    >
      cos
      <span className="cosigno-i">
        ı
        <span className="cosigno-dot" />
      </span>
      gno
    </span>
  );
}

export function LogoLockup({
  size = 28,
  textClass = "text-2xl",
}: {
  size?: number;
  textClass?: string;
}) {
  return (
    <span className="inline-flex items-center gap-2">
      <CosignoMark size={size} />
      <CosignoWordmark className={textClass} />
    </span>
  );
}

/** Pick a wordmark text size that optically balances the given mark height. */
function wordClassFor(size: number): string {
  if (size <= 22) return "text-lg";
  if (size <= 30) return "text-2xl";
  if (size <= 40) return "text-3xl";
  return "text-4xl";
}

/**
 * The single canonical, theme-aware logo. Prefer this everywhere.
 *
 *   <CosignoLogo variant="full" | "mark" theme="auto" size={30} className href />
 *
 * - theme "auto" (default) follows the app theme via CSS vars — no hydration
 *   mismatch, no wrong-theme flash on load.
 * - `href` renders a home link with a single accessible label "Cosigno home"
 *   (the visual pieces are aria-hidden — no duplicate text). Without `href` the
 *   whole mark carries role="img" + aria-label="Cosigno".
 * - Fixed aspect, inline-flex, 8px gap; never stretches or shrinks.
 */
export function CosignoLogo({
  variant = "full",
  theme = "auto",
  size = 30,
  className = "",
  href,
  label = "Cosigno",
}: {
  variant?: "full" | "mark";
  theme?: LogoTheme;
  size?: number;
  className?: string;
  href?: string;
  label?: string;
}) {
  const style = theme === "auto" ? undefined : THEME_VARS[theme];
  const inner = (
    <>
      <CosignoMark size={size} />
      {variant === "full" && <CosignoWordmark className={wordClassFor(size)} />}
    </>
  );
  const shell = "inline-flex shrink-0 items-center gap-2 [&>svg]:shrink-0";

  if (href) {
    return (
      <Link
        href={href}
        aria-label={`${label} home`}
        prefetch
        className={`${shell} ${className}`}
        style={style}
      >
        {inner}
      </Link>
    );
  }
  return (
    <span role="img" aria-label={label} className={`${shell} ${className}`} style={style}>
      {inner}
    </span>
  );
}

/** Back-compat alias for earlier call sites. */
export const Logo = CosignoLogo;
