/**
 * Brand color constants for inline SVG marks and generated assets.
 * Mirrors tailwind.config.ts — change both together (see BRAND.md).
 */
export const INK = "#141414";
export const CREAM = "#F8F0E8";
export const CREAM_DEEP = "#EFE5D7";
export const SIGNAL = "#FB4C20";
export const INK_SOFT = "#5C5650";
export const LINE = "#E4D9C8";

/**
 * Exact LOGO identity tokens (the rebrand palette). Kept distinct from the
 * product palette above so the mark renders with its precise brand values
 * everywhere and can flip per theme. Used by the Logo component (via the
 * --logo-* CSS vars) and the deterministic SVG asset generator.
 */
export const LOGO_ORANGE = "#FB4C20";
export const LOGO_INK = "#171512"; // check + wordmark, light
export const LOGO_CREAM = "#F7F0E5"; // check + wordmark, dark
export const LOGO_WHITE = "#FFFFFF"; // wordmark, OLED
export const LOGO_BLACK = "#090909"; // OLED background

/* ------------------------------------------------------------------ contact */

/**
 * How to reach cosigno, in one place.
 *
 * These were hardcoded in eight files — the footer, the marketing shell, the
 * app chrome, the legal layout, terms, privacy, pricing and the README — which
 * is exactly how a stale address survives a rebrand. Anything that shows a way
 * to contact us reads it from here.
 */
export const CONTACT_EMAIL = "cosignolabs@gmail.com";
export const INSTAGRAM_HANDLE = "cosignolabs";
export const INSTAGRAM_URL = `https://instagram.com/${INSTAGRAM_HANDLE}`;
/** The operating entity, as it must appear in the legal pages. */
export const LEGAL_ENTITY = "aethric llc";
