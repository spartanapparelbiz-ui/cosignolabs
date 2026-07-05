// Single source of truth for the cosigno mark geometry (viewBox 0 0 100 100).
// The flat SVG (src/components/brand/Logo.tsx) mirrors these exact numbers.
//
// The mark: a thick near-black C opening to the right, and a chunky orange
// check whose short tail overlaps inside the C's mouth and whose long arm
// extends up-right past the C's outer edge, visually completing the C.

export const INK = "#141414";
export const SIGNAL = "#FF4B1F";

// C — stroked arc, opening centered on the right (0deg), gap +/-33deg.
export const C = {
  cx: 50,
  cy: 50,
  r: 31,
  stroke: 26,
  // start (lower-right) -> end (upper-right), drawn the long way round the left
  d: "M 76.0 66.9 A 31 31 0 1 1 76.0 33.1",
};

// Check — polyline shortTail -> vertex -> longArm, chunky rounded stroke.
export const CHECK = {
  stroke: 17,
  points: [
    [47, 53], // short tail, inside the C mouth
    [57, 63], // vertex (bottom corner)
    [88, 28], // long arm, past the outer edge
  ],
  d: "M 47 53 L 57 63 L 88 28",
};
