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
 *   --logo-c         the C                — #FF4B22 in every theme
 *   --logo-check     the checkmark        — #171512 light / #F7F0E5 dark / #FF4B22 oled
 *   --logo-wordmark  the wordmark         — #171512 light / #F7F0E5 dark / #FFFFFF oled
 *   --logo-dot       the i-dot            — #FF4B22 in every theme
 * An explicit `theme` prop overrides these inline (OLED, or a known fixed
 * light/dark surface such as the OG image or a dark footer).
 *
 * Geometry mirrors scripts/logo-geometry.mjs (viewBox 0 0 160 160). The check
 * stays fully recognizable at a 20px mark; strokes carry no thin details.
 */

/* --- shared geometry (single source; mirrored in scripts/logo-geometry.mjs) */
export const LOGO_VIEWBOX = "0 0 160 160";
export const LOGO_C_PATH =
  "M112 35C91 17 59 17 37 37C13 59 13 101 37 123C59 143 91 143 112 125";
export const LOGO_CHECK_PATH = "M44 82L68 110L126 46";
export const LOGO_C_WIDTH = 22;
export const LOGO_CHECK_WIDTH = 20;

export type LogoTheme = "light" | "dark" | "oled" | "auto";

/** Inline CSS-var overrides for an explicit theme; `auto` inherits the globals. */
const THEME_VARS: Record<Exclude<LogoTheme, "auto">, CSSProperties> = {
  light: { "--logo-c": "#FF4B22", "--logo-check": "#171512", "--logo-wordmark": "#171512", "--logo-dot": "#FF4B22" } as CSSProperties,
  dark: { "--logo-c": "#FF4B22", "--logo-check": "#F7F0E5", "--logo-wordmark": "#F7F0E5", "--logo-dot": "#FF4B22" } as CSSProperties,
  oled: { "--logo-c": "#FF4B22", "--logo-check": "#FF4B22", "--logo-wordmark": "#FFFFFF", "--logo-dot": "#FF4B22" } as CSSProperties,
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
      <path
        d={LOGO_C_PATH}
        stroke={cColor}
        strokeWidth={LOGO_C_WIDTH}
        strokeLinecap="round"
      />
      <path
        d={LOGO_CHECK_PATH}
        stroke={checkColor}
        strokeWidth={LOGO_CHECK_WIDTH}
        strokeLinecap="round"
        strokeLinejoin="round"
        className={checkClassName}
      />
    </svg>
  );
}

/** Lowercase "cosigno" wordmark with the orange i-dot over a dotless "ı". */
export function CosignoWordmark({ className = "" }: { className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={`font-extrabold lowercase tracking-tight ${className}`}
      style={{
        color: "var(--logo-wordmark)",
        fontFamily: "var(--font-wordmark), system-ui, sans-serif",
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
