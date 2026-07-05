# cosigno — brand system

The single source of truth for how cosigno looks and speaks. Tokens live in
`tailwind.config.ts` (and mirror to `src/lib/brand.ts` for inline SVG marks).
Never hard-code a hex value in a component — use a token.

## Color

| Token | Hex | Use |
|---|---|---|
| `ink` | `#141414` | text, primary surfaces (dark buttons, header) |
| `cream` | `#FBF4EA` | page background |
| `cream-deep` | `#F3E9DA` | cards / wells / payload blocks on cream |
| `signal` | `#FF4B1F` | **only**: the Approve button, executed/success states, the logo check, the i-dot, focus rings, active nav, progress fill |
| `ink-soft` | `#5C5650` | secondary text |
| `line` | `#E4D9C8` | the one hairline (orb track) — avoid; prefer shadow |

Rules:
- **Orange is the signature, not decoration.** If it isn't approval, success,
  focus, or the mark, it isn't orange.
- **Veto / destructive is ink outline** (`ring-1 ring-inset ring-ink`), never
  red. There is **no green and no red** anywhere — success is the orange
  check, not a green light.
- Contrast: ink (16.9:1) and ink-soft (7.0:1) on cream both pass WCAG AA.
- No dark mode. Do not add `dark:` variants.

## Typography

- **Nunito Sans** via `next/font/google`, self-hosted, `display: "swap"`,
  `adjustFontFallback` on → no FOUT, no CLS.
- The wordmark is always lowercase **cosigno**, with the signal i-dot.
- Product name is lowercase everywhere — UI, titles, metadata.
- Weights: 800/900 for headings and the wordmark, 600/700 for body emphasis.

## Shape & depth

- Radius: **14px** cards (`rounded-card`), **10px** buttons/inputs/wells
  (`rounded-btn`), pills for badges (`rounded-pill`).
- **Soft shadows only** — `shadow-soft` (resting) and `shadow-lift` (raised:
  pending cards, hero panels). Low opacity, large blur, to match the logo's
  soft 3D weight. No hard borders except the veto outline.
- One icon set: **lucide-react**, default stroke width.

## Motion

**Tokens** (`src/lib/motion.ts` + Tailwind theme) — never hard-code timing:

| Token | Value | Use |
|---|---|---|
| `DURATION.fast` / `duration-fast` | 160ms | button press, hover lift, focus ring, filter fade |
| `DURATION.base` / `duration-base` | 220ms | fades, slides, nav indicator, modal-in, shake |
| `DURATION.entrance` | 320ms | card slide-in, rise-in, word stagger |
| `DURATION.slow` | 500ms | hero settle, showpiece moments |
| `EASE.out` / `ease-brand-out` | `cubic-bezier(0.22,1,0.36,1)` | default UI easing |
| `EASE.spring` / `ease-spring` | `cubic-bezier(0.34,1.56,0.64,1)` | card entrance / modal overshoot |
| `STAGGER_MS.words` | 80ms | headline word stagger |
| `STAGGER_MS.cards` | 60ms | card-stack stagger |

Named animations (Tailwind `animate-*`): `settle`, `float`, `rise-in`,
`word-in`, `spring-in`, `ring-flash`, `chip-pulse`, `shake-x`, `check-draw`,
`check-pop`, `modal-in`, `fade-through`, `orb-*`, `toast-in`, `shimmer`.

Rules: **transform/opacity only** (never animate layout properties), 60fps,
capped element counts, and everything collapses to an instant state change
under `prefers-reduced-motion` (globals.css + `useReveal` start-shown).

- Card propose: `animate-card-in` / `animate-spring-in` — slide + fade.
- Execute: `animate-check-pop` + `animate-check-draw` — the orange check
  draws itself once.
- Orb: transform/opacity only (`animate-orb-pulse`, `orb-listen`,
  `animate-orb-think`) — 60fps, never animates layout properties.
- Toasts: `animate-toast-in`, bottom-right, auto-dismiss, `aria-live`.
- **`prefers-reduced-motion`**: globals.css collapses every animation and
  transition to an instant state change.
- Easing: `cubic-bezier(0.22, 1, 0.36, 1)`. Nothing linear except spinners.

## Voice

Calm, confident, plain. One voice across UI copy, errors, and toasts.

- Lowercase product name, always. Sentence-case or lowercase UI labels.
- **No exclamation marks. No "oops". No robot-speak.**
- Errors say what happened **and** what to do:
  *"couldn't reach the planner. try again in a moment."*
- Rate limit: *"you're moving fast — planning is limited to 10 commands a minute."*
- Usage cap: *"you've used your plan's actions for this cycle."* + upgrade.
- Tier-3 confirm: *"this is a locked action. type its name to approve."*
- Injection chip: *"external content attempted to direct the agent — held for your review."*
- Success is understated: *"signed & executed."*, *"vetoed — nothing was executed."*

## The Approve button

The most prominent element in the product: solid `signal` fill, `ink` text,
`rounded-btn`, subtle scale on hover/active, the check glyph to its left. The
orange check is the brand — protect it. Everything else defers to it.
