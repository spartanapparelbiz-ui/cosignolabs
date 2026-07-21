import type { CSSProperties } from "react";

/**
 * The cosigno mark — one unified, proprietary symbol: a thick ORANGE open C
 * (opening on the right) with an integrated CHECK that begins in the lower-left
 * interior and rises confidently up-right through the opening. The C is
 * cosigno; the check is approval, permission, completion, signing off. No dot
 * on the icon — the orange accent dot lives over the "i" in the wordmark.
 *
 * Colors are driven entirely by CSS custom properties so the mark flips with
 * the theme WITHOUT a flash (data-theme is set before paint) and stays
 * hydration-safe (no JS/state):
 *   --logo-orange  the C (and the i-dot)          — #FF4B22 in every theme
 *   --logo-fg      the integrated check           — #171512 light / #F7F0E5 dark
 *   --logo-word    the wordmark                    — #171512 light / #F7F0E5 dark
 * An explicit `theme` prop overrides these inline (used for OLED and for known
 * light/dark surfaces such as the OG image or a fixed-dark footer).
 *
 * Geometry mirrors scripts/logo-geometry.mjs (viewBox 0 0 100 100). The check
 * stays fully recognizable at 16px; the strokes never carry thin details.
 */

/* --- shared geometry (single source; mirrored in scripts/logo-geometry.mjs) */
export const LOGO_C_PATH = "M 76 66.9 A 31 31 0 1 1 76 33.1";
export const LOGO_CHECK_PATH = "M 38 51 L 53 65 L 83 29";
export const LOGO_C_WIDTH = 26;
export const LOGO_CHECK_WIDTH = 17;

export type LogoTheme = "light" | "dark" | "oled" | "auto";
export type LogoSize = "sm" | "md" | "lg";

/** Inline CSS-var overrides for an explicit theme; `auto` inherits the globals. */
const THEME_VARS: Record<Exclude<LogoTheme, "auto">, CSSProperties> = {
  light: { "--logo-orange": "#FF4B22", "--logo-fg": "#171512", "--logo-word": "#171512" } as CSSProperties,
  dark: { "--logo-orange": "#FF4B22", "--logo-fg": "#F7F0E5", "--logo-word": "#F7F0E5" } as CSSProperties,
  oled: { "--logo-orange": "#FF4B22", "--logo-fg": "#FF4B22", "--logo-word": "#FFFFFF" } as CSSProperties,
};

const ICON_PX: Record<LogoSize, number> = { sm: 20, md: 28, lg: 40 };
const TEXT_CLS: Record<LogoSize, string> = { sm: "text-lg", md: "text-2xl", lg: "text-4xl" };

/**
 * The bare icon (C + integrated check). `mono` renders it in a single color
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
  const cColor = mono ? "currentColor" : "var(--logo-orange)";
  const checkColor = mono ? "currentColor" : "var(--logo-fg)";
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" fill="none" aria-hidden="true">
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

/** Lowercase "cosigno" wordmark with the orange i-dot. */
export function CosignoWordmark({ className = "" }: { className?: string }) {
  return (
    <span
      className={`font-extrabold lowercase tracking-tight ${className}`}
      style={{ color: "var(--logo-word)" }}
    >
      cos
      <span className="relative inline-block">
        <span className="relative">
          ı
          <span
            aria-hidden="true"
            className="absolute left-1/2 top-[0.04em] h-[0.15em] w-[0.15em] -translate-x-1/2 rounded-full"
            style={{ backgroundColor: "var(--logo-orange)" }}
          />
        </span>
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

/**
 * The single canonical, theme-aware logo component. Prefer this everywhere.
 *
 *   <Logo variant="full" | "icon" theme="light" | "dark" | "oled" | "auto"
 *         size="sm" | "md" | "lg" label="cosigno" decorative animate />
 *
 * - theme defaults to "auto": it follows the app theme via CSS vars, with no
 *   hydration mismatch and no wrong-theme flash on load.
 * - Accessible by default (role="img" + label); pass `decorative` for
 *   aria-hidden when nearby text already names the brand.
 * - Never stretches: fixed aspect via the intrinsic SVG + inline-flex.
 */
export function Logo({
  variant = "full",
  theme = "auto",
  size = "md",
  className = "",
  label = "cosigno",
  decorative = false,
  animate = false,
}: {
  variant?: "full" | "icon";
  theme?: LogoTheme;
  size?: LogoSize;
  className?: string;
  label?: string;
  decorative?: boolean;
  animate?: boolean;
}) {
  const style = theme === "auto" ? undefined : THEME_VARS[theme];
  const a11y = decorative
    ? { "aria-hidden": true as const }
    : { role: "img" as const, "aria-label": label };
  const iconPx = ICON_PX[size];
  const checkAnim = animate ? "motion-safe:animate-logo-check" : "";

  if (variant === "icon") {
    return (
      <span className={`inline-flex ${className}`} style={style} {...a11y}>
        <CosignoMark size={iconPx} checkClassName={checkAnim} />
      </span>
    );
  }
  return (
    <span className={`inline-flex items-center gap-2 ${className}`} style={style} {...a11y}>
      <CosignoMark size={iconPx} checkClassName={checkAnim} />
      <CosignoWordmark className={`${TEXT_CLS[size]} ${animate ? "motion-safe:animate-word-in" : ""}`} />
    </span>
  );
}
