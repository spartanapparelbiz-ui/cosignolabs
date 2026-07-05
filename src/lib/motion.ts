/**
 * Motion tokens — the single source of truth for durations and easings
 * (see BRAND.md). Components never hard-code timing numbers; they use these
 * or the matching Tailwind `animate-*` / `duration-*` utilities that mirror
 * them. All motion is transform/opacity only and respects
 * prefers-reduced-motion (globals.css collapses every animation to instant).
 */

export const DURATION = {
  /** micro-interactions: button press, hover lift, focus ring */
  fast: 160,
  /** standard UI transitions: fades, slides, nav indicator */
  base: 220,
  /** entrances: card slide-in, settle */
  entrance: 320,
  /** deliberate showpieces: hero settle, check draw */
  slow: 500,
} as const;

export const EASE = {
  /** default UI easing — soft, confident (cubic-bezier) */
  out: "cubic-bezier(0.22, 1, 0.36, 1)",
  /** gentle spring with slight overshoot for card entrances */
  spring: "cubic-bezier(0.34, 1.56, 0.64, 1)",
  inOut: "cubic-bezier(0.65, 0, 0.35, 1)",
} as const;

/** Stagger step between sequential items (headline words, card stacks). */
export const STAGGER_MS = { words: 80, cards: 60 } as const;

/** Inline-style helper for stagger delays. */
export function staggerDelay(index: number, step = STAGGER_MS.cards): React.CSSProperties {
  return { animationDelay: `${index * step}ms` };
}
