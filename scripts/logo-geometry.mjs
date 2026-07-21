// Single source of truth for the cosigno mark geometry (viewBox 0 0 160 160).
// The flat SVG (src/components/brand/Logo.tsx) mirrors these exact numbers.
//
// The mark: a bold open ORANGE C (opening on the right) with a real CHECK that
// rises through the opening. No dot on the icon — the orange dot lives over the
// "i" in the wordmark. On dark surfaces the check flips to cream; on OLED the
// check is orange. The C stays orange in every variant.

// Exact rebrand tokens (see BRAND.md / src/lib/brand.ts LOGO_*).
export const INK = "#171512"; // integrated check + wordmark (light)
export const SIGNAL = "#FF4B22"; // the C (and the i-dot)
export const CREAM = "#F7F0E5"; // check + wordmark on dark
export const WHITE = "#FFFFFF"; // wordmark on OLED
export const BLACK = "#090909"; // OLED background

export const VIEWBOX = 160;

// C — a bold open C, opening on the right. Cubic path, round caps.
export const C = {
  stroke: 22,
  d: "M112 35C91 17 59 17 37 37C13 59 13 101 37 123C59 143 91 143 112 125",
};

// Check — a real checkmark: short tail low-left, vertex at the bottom, long arm
// rising up-right through the C's opening. Chunky rounded stroke.
export const CHECK = {
  stroke: 20,
  points: [
    [44, 82], // short tail
    [68, 110], // vertex
    [126, 46], // long arm rising up-right through the opening
  ],
  d: "M44 82L68 110L126 46",
};
