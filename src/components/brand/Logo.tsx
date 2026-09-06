import type { CSSProperties } from "react";
import Link from "next/link";

/**
 * The cosigno mark — one unified, proprietary symbol: a soft ORANGE triangle
 * with a soft triangular counter knocked out of it. The counter is a real HOLE,
 * not a second coloured shape, so the mark sits correctly on cream, on ink, on
 * OLED black and on the orange itself without ever needing a matched backdrop.
 * No circle, no shield, no signature, no gradient/shadow/glow.
 *
 * Colours are driven entirely by CSS custom properties so the mark flips with
 * the theme WITHOUT a flash (data-theme is set before paint) and stays
 * hydration-safe (no JS/state):
 *   --logo-mark      the mark      — #FB4C20 in every theme
 *   --logo-counter   the counter   — transparent everywhere, so the surface
 *                                    shows through. Surfaces that need a
 *                                    painted counter (the progressive auth
 *                                    mark, the status light) set it locally.
 *   --logo-wordmark  the wordmark  — #171512 light / #F7F0E5 dark / #FFFFFF oled
 * An explicit `theme` prop overrides these inline (OLED, or a known fixed
 * light/dark surface such as the OG image or a dark footer).
 *
 * Geometry mirrors scripts/logo-geometry.mjs (viewBox 0 0 160 160). The mark is
 * a single closed band with no thin details, so it survives down to the 11px
 * uses inside receipts and file rows.
 */

/* --- shared geometry (single source; mirrored in scripts/logo-geometry.mjs) */
export const LOGO_VIEWBOX = "0 0 160 160";
/** Outer soft triangle. */
export const LOGO_SHELL_PATH =
  "M 125.357 28.491 A 36.9 36.9 0 0 0 70.982 16.933 A 221.401 221.401 0 0 0 13.797 80.443 A 36.9 36.9 0 0 0 30.976 133.312 A 221.401 221.401 0 0 0 114.569 151.08 A 36.9 36.9 0 0 0 151.765 109.769 A 221.401 221.401 0 0 0 125.357 28.491 Z";
/** The counter, knocked out of the shell. */
export const LOGO_COUNTER_PATH =
  "M 71.687 50.014 A 22.14 22.14 0 0 0 49.358 74.813 A 126.515 126.515 0 0 0 64.406 121.125 A 22.14 22.14 0 0 0 97.047 128.063 A 126.515 126.515 0 0 0 129.63 91.875 A 22.14 22.14 0 0 0 119.318 60.138 A 126.515 126.515 0 0 0 71.687 50.014 Z";
/** The mark as shipped. MUST be filled with fill-rule="evenodd" — that is what
 *  turns the counter into a hole instead of a second stacked shape. */
export const LOGO_MARK_PATH = `${LOGO_SHELL_PATH} ${LOGO_COUNTER_PATH}`;

export type LogoTheme = "light" | "dark" | "oled" | "auto";

/** Inline CSS-var overrides for an explicit theme; `auto` inherits the globals. */
const THEME_VARS: Record<Exclude<LogoTheme, "auto">, CSSProperties> = {
  light: { "--logo-mark": "#FB4C20", "--logo-wordmark": "#171512" } as CSSProperties,
  dark: { "--logo-mark": "#FB4C20", "--logo-wordmark": "#F7F0E5" } as CSSProperties,
  oled: { "--logo-mark": "#FB4C20", "--logo-wordmark": "#FFFFFF" } as CSSProperties,
};

/**
 * The bare icon. `mono` renders it in currentColor for one-colour contexts;
 * otherwise it is the brand orange. The counter stays a hole either way.
 * `markClassName` lets the living logo drive the mark's idle opacity drift.
 */
export function CosignoMark({
  size = 28,
  markClassName = "",
  mono = false,
}: {
  size?: number;
  markClassName?: string;
  mono?: boolean;
}) {
  return (
    <svg width={size} height={size} viewBox={LOGO_VIEWBOX} fill="none" aria-hidden="true">
      <path
        d={LOGO_MARK_PATH}
        fillRule="evenodd"
        clipRule="evenodd"
        fill={mono ? "currentColor" : "var(--logo-mark)"}
        className={markClassName}
      />
      {/*
       * The counter is transparent by default, so this paints nothing and the
       * surface behind the mark shows through the hole. It exists so contexts
       * that DO want a filled counter — the auth mark completing itself as the
       * form fills, the status light pulsing — have a real element to animate
       * by setting --logo-counter locally.
       */}
      <path d={LOGO_COUNTER_PATH} fill="var(--logo-counter)" />
    </svg>
  );
}

/** Lowercase "cosigno" wordmark, set in the brand face. */
export function CosignoWordmark({ className = "" }: { className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={`whitespace-nowrap lowercase ${className}`}
      style={{
        color: "var(--logo-wordmark)",
        fontFamily: "var(--font-wordmark), Georgia, serif",
        // 500 is the only wordmark weight shipped; naming it here rather than
        // via a utility class keeps the lockup identical wherever it lands,
        // including inside prose that sets its own weight.
        fontWeight: 500,
        letterSpacing: "-0.005em",
      }}
    >
      cosigno
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
      <Link href={href} prefetch className={`${shell} ${className}`} style={style}>
        {/*
         * The accessible name comes from this text node, not from an
         * aria-label: naming a link from hidden content keeps axe's
         * label-content-name-mismatch rule satisfied however the wordmark is
         * drawn, and announces exactly what it always did.
         */}
        <span className="sr-only">{`${label} home`}</span>
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
