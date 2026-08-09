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

/**
 * SIX PURPOSES OF MOTION.
 *
 * Every animation in cosigno belongs to exactly one of these, and the purpose
 * decides the timing — not the taste of whoever wrote the component. A button
 * and a page cannot move at the same speed and both feel right, and a status
 * change that borrows the celebration timing tells the user something finished
 * when it didn't.
 *
 * · MICRO       buttons, icons, toggles — under the threshold of noticing
 * · TRANSITION  pages, panels, cards moving between places
 * · STATE       working / waiting / done — motion that IS the information
 * · EXPLORATION dashboards and account surfaces the user browses
 * · AMBIENT     background life; must never compete with content
 * · CELEBRATION the rare moment something real completed
 *
 * The rule the tokens encode: the more a motion asks of attention, the more it
 * has to have earned it.
 */
export const MOTION = {
  micro: { duration: DURATION.fast, ease: EASE.out },
  transition: { duration: DURATION.base, ease: EASE.out },
  state: { duration: DURATION.entrance, ease: EASE.spring },
  exploration: { duration: DURATION.entrance, ease: EASE.out },
  ambient: { duration: 6000, ease: "ease-in-out" },
  celebration: { duration: DURATION.slow, ease: EASE.spring },
} as const;

export type MotionPurpose = keyof typeof MOTION;

/** A ready-to-use CSS transition string for a purpose. */
export function transitionFor(
  purpose: MotionPurpose,
  properties = "transform, opacity"
): string {
  const { duration, ease } = MOTION[purpose];
  return properties
    .split(",")
    .map((p) => `${p.trim()} ${duration}ms ${ease}`)
    .join(", ");
}

/**
 * The living-logo "breath" — the ONE idle animation the cosigno mark may use
 * anywhere (see BRAND.md → "Living logo"). A slow 5s scale oscillation on the
 * whole mark, paired with the check's opacity drifting so the tick feels like
 * it's the thing that's alive. Transform/opacity only; mirrored by the
 * `logo-breath` / `logo-check` Tailwind animations. Exactly one mark breathes
 * per viewport (see useBreathing) and it holds still under
 * prefers-reduced-motion. This is the only variant — no per-page breaths.
 */
export const LOGO_BREATH = {
  durationMs: 5000,
  ease: "ease-in-out",
  scale: { rest: 1, peak: 1.015 },
  checkOpacity: { low: 0.92, high: 1 },
} as const;

/** Stagger step between sequential items (headline words, card stacks). */
export const STAGGER_MS = { words: 80, cards: 60 } as const;

/** Inline-style helper for stagger delays. */
export function staggerDelay(index: number, step = STAGGER_MS.cards): React.CSSProperties {
  return { animationDelay: `${index * step}ms` };
}

/**
 * Depth tokens for the 3D layer (see components/motion/Depth.tsx).
 *
 * cosigno's 3D is perspective and light on real surfaces — a card that tilts
 * toward the cursor, a stack whose layers separate — never floating objects.
 * Keeping the numbers here is what stops "3D" from becoming a per-component
 * guess: one perspective distance, one tilt ceiling, one lift.
 */
export const DEPTH = {
  /** Scene perspective. Shorter = more dramatic; this is deliberately gentle. */
  perspective: 900,
  /** Maximum tilt in degrees at the far edge of a surface. */
  maxTiltDeg: 6,
  /** How far the top layer floats above the card face, in px. */
  layerLift: 26,
} as const;
