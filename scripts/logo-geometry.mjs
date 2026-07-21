// Single source of truth for the cosigno mark geometry (viewBox 0 0 100 100).
// The flat SVG (src/components/brand/Logo.tsx) mirrors these exact numbers.
//
// The mark: a thick ORANGE C opening to the right, and a chunky near-black
// check whose short tail overlaps inside the C's mouth and whose long arm
// extends up-right past the C's outer edge, visually completing the C. A
// small orange accent dot floats at the top-right of the opening — the same
// signal dot that sits over the "i" in the wordmark. On dark surfaces the
// check flips to cream; the C and the dot stay orange in every variant.

// Exact rebrand tokens (see BRAND.md / src/lib/brand.ts LOGO_*).
export const INK = "#171512"; // integrated check + wordmark (light)
export const SIGNAL = "#FF4B22"; // the C (and the i-dot)
export const CREAM = "#F7F0E5"; // check + wordmark on dark
export const WHITE = "#FFFFFF"; // wordmark on OLED
export const BLACK = "#090909"; // OLED background

// C — stroked arc, opening centered on the right (0deg), gap +/-33deg.
export const C = {
  cx: 50,
  cy: 50,
  r: 31,
  stroke: 26,
  // start (lower-right) -> end (upper-right), drawn the long way round the left
  d: "M 76.0 66.9 A 31 31 0 1 1 76.0 33.1",
};

// Check — a compact checkmark sitting INSIDE the C (not a swoosh past the
// edge): short tail low-left, vertex at the bottom, long arm rising to the
// C's top-right opening. Chunky rounded stroke.
export const CHECK = {
  stroke: 17,
  points: [
    [38, 51], // short tail, inside the C's lower-left
    [53, 65], // vertex (bottom corner)
    [83, 29], // long arm, rising up through the C's top-right opening
  ],
  d: "M 38 51 L 53 65 L 83 29",
};

// Accent dot — the signal dot, floating clear above the C's top-right
// opening (well above the check's long arm).
export const DOT = {
  cx: 72,
  cy: 18,
  r: 7,
};
