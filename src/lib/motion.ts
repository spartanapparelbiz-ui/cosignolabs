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
export const STAGGER_MS = {
  words: 80,
  cards: 60,
  /** Dashboard tiles in a grid — tighter, because there are more of them. */
  tiles: 45,
  /** Rows in a feed or list. Tighter still; a long list must not crawl in. */
  rows: 32,
} as const;

/**
 * How long a stagger is allowed to run in total.
 *
 * A per-item delay is only pleasant while the last item still arrives
 * promptly: 45ms across eight tiles is a flourish, the same 45ms across
 * forty rows is a page that takes two seconds to finish appearing. Every
 * staggered surface caps its index against this, so a grid's entrance costs
 * the same whether it holds six items or six hundred.
 */
export const STAGGER_CAP_MS = 400;

/** Inline-style helper for stagger delays, capped so long lists stay fast. */
export function staggerDelay(index: number, step: number = STAGGER_MS.cards): React.CSSProperties {
  return { animationDelay: `${Math.min(index * step, STAGGER_CAP_MS)}ms` };
}

/**
 * The elevation ladder, named. Mirrors the `shadow-e1..e4` tokens in the
 * Tailwind theme (see BRAND.md → "Shape & depth"). Components reach for a
 * *height* — resting, raised, lifted, overlay — rather than picking a
 * shadow, which is what kept surfaces at four subtly different heights.
 */
export const ELEVATION = {
  /** A tile at rest inside a grid. */
  resting: "shadow-e1",
  /** A card you can pick up: the default for anything interactive. */
  raised: "shadow-e2",
  /** Mid-lift — hover, or a card that needs a decision. */
  lifted: "shadow-e3",
  /** Above the page: menus, popovers, dialogs. */
  overlay: "shadow-e4",
} as const;

/**
 * The one hover gesture for an interactive surface: rise 2px and gain a
 * step of elevation, over `fast`. Declared once so every card in the
 * product lifts by the same amount at the same speed — the difference
 * between a system and a pile of cards that each move slightly differently.
 */
export const HOVER_LIFT =
  "transition-[transform,box-shadow] duration-fast ease-brand-out hover:-translate-y-0.5 hover:shadow-e3 motion-reduce:hover:translate-y-0";

/**
 * The press gesture. Paired with HOVER_LIFT on anything clickable — a
 * surface that lifts to meet the pointer must also give way under it, or
 * the click has no physical answer.
 */
export const PRESS = "active:translate-y-0 active:scale-[0.99]";
