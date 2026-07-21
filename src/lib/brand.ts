/**
 * Brand color constants for inline SVG marks and generated assets.
 * Mirrors tailwind.config.ts — change both together (see BRAND.md).
 */
export const INK = "#141414";
export const CREAM = "#FBF4EA";
export const CREAM_DEEP = "#F3E9DA";
export const SIGNAL = "#FF4B1F";
export const INK_SOFT = "#5C5650";
export const LINE = "#E4D9C8";

/**
 * Exact LOGO identity tokens (the rebrand palette). Kept distinct from the
 * product palette above so the mark renders with its precise brand values
 * everywhere and can flip per theme. Used by the Logo component (via the
 * --logo-* CSS vars) and the deterministic SVG asset generator.
 */
export const LOGO_ORANGE = "#FF4B22";
export const LOGO_INK = "#171512"; // check + wordmark, light
export const LOGO_CREAM = "#F7F0E5"; // check + wordmark, dark
export const LOGO_WHITE = "#FFFFFF"; // wordmark, OLED
export const LOGO_BLACK = "#090909"; // OLED background
