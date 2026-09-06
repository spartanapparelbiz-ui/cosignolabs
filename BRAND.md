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
| `signal` | `#FF4B1F` | **only**: the Approve button, executed/success states, **the mark**, focus rings, active nav, progress fill |
| `ink-soft` | `#5C5650` | secondary text |
| `line` | `#E4D9C8` | the one hairline (orb track) — avoid; prefer shadow |

### Logo identity tokens (exact)

The mark renders with its own precise brand values (distinct from the product
palette so it's identical everywhere and flips cleanly per theme). Mirrored in
`src/lib/brand.ts` (`LOGO_*`), the `--logo-*` CSS vars, and
`scripts/logo-geometry.mjs`.

| Token | Hex |
|---|---|
| `--cosigno-orange` | `#FF4B22` — the mark, every theme |
| `--cosigno-ink` | `#171512` — wordmark, **light** |
| `--cosigno-cream` | `#F7F0E5` — wordmark, **dark** |
| `--cosigno-white` | `#FFFFFF` — wordmark, **OLED** |
| `--cosigno-black` | `#090909` — **OLED** background |

The symbol is a soft **orange triangle** with a soft triangular **counter**
knocked out of it. The counter is a real **hole**, not a second coloured shape:
the mark is one path filled with `fill-rule="evenodd"`, so it sits correctly on
cream, on ink, on OLED black and on the orange itself without ever needing a
matched backdrop. The mark is orange in **every** theme; only the wordmark
flips. Use the one shared component: `<Logo variant="full|mark"
theme="light|dark|oled|auto" size={30} />` (`src/components/brand/Logo.tsx`),
`theme="auto"` by default. Geometry is single-sourced (component ↔
`scripts/logo-geometry.mjs`), which also carries the wordmark as outlines so
generated SVGs render the real logotype with no webfont installed. Regenerate
assets with `node scripts/generate-assets.mjs`.

Rules:
- **Orange is the signature, not decoration.** If it isn't approval, success,
  focus, or the mark, it isn't orange.
- **Veto / destructive is ink outline** (`ring-1 ring-inset ring-ink`), never
  red. There is **no green and no red** anywhere — success is the orange
  check, not a green light.
- Contrast: ink (16.9:1) and ink-soft (7.0:1) on cream both pass WCAG AA.
- No dark mode. Do not add `dark:` variants.

## Typography

Four voices, each with exactly one job. All self-hosted by `next/font/google`
(no runtime request to Google), `display: "swap"` with `adjustFontFallback` on
→ no FOUT, no CLS. Wired once in `src/app/layout.tsx`; never import a face in
a component.

| Role | Face | Utility | Used for |
| --- | --- | --- | --- |
| Interface | **Inter** (variable) | `font-sans` | everything you read to operate the product |
| Display | **Source Serif 4** (variable, `opsz`) | `font-display` | headlines, prices, counters |
| Wordmark | **Libre Bodoni 500** | `--font-wordmark` | the logotype, and nothing else |
| Record | **IBM Plex Mono** 400/700 | `font-mono` | payloads, ids, amounts, timestamps |

- The display face carries a real optical-size axis, so a 96px headline gets the
  display cut and a 24px price gets the text cut with no code. Leave
  `font-optical-sizing` alone.
- Everything the product asserts as fact — an id, an amount, a recipient, a
  timestamp — is set in the mono. That is the difference between prose and a
  record, and it is why `font-mono` is a declared token rather than Tailwind's
  OS-dependent default stack.
- The wordmark is always lowercase **cosigno**, at 500, in the wordmark face's
  own letterforms — no substituted glyphs, no accent dot. It is the only place
  the wordmark face may appear.
- Product name is lowercase everywhere — UI, titles, metadata.
- Weights: 700/800 for headings, 600/700 for body emphasis, 400 for prose.

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
| `DURATION.entrance` / `duration-entrance` | 320ms | card slide-in, rise-in, word stagger |
| `DURATION.slow` / `duration-slow` | 500ms | hero settle, showpiece moments |
| `EASE.out` / `ease-brand-out` | `cubic-bezier(0.22,1,0.36,1)` | default UI easing |
| `EASE.spring` / `ease-spring` | `cubic-bezier(0.34,1.56,0.64,1)` | card entrance / modal overshoot |
| `STAGGER_MS.words` | 80ms | headline word stagger |
| `STAGGER_MS.cards` | 60ms | card-stack stagger |

Named animations (Tailwind `animate-*`): `settle`, `float`, `rise-in`,
`word-in`, `spring-in`, `ring-flash`, `chip-pulse`, `shake-x`, `check-draw`,
`check-pop`, `modal-in`, `fade-through`, `orb-*`, `toast-in`, `shimmer`,
`logo-breath`, `logo-glow`.

Rules: **transform/opacity only** (never animate layout properties), 60fps,
capped element counts, and everything collapses to an instant state change
under `prefers-reduced-motion` (globals.css + `useReveal` start-shown).

- Card propose: `animate-card-in` / `animate-spring-in` — slide + fade.
- Execute: `animate-check-pop` + `animate-check-draw` — the orange check
  draws itself once.
- Orb v3: an SVG core disc with two counter-orbiting blobs. State drives
  motion — idle drift (`orb-spin-slow`/`orb-spin-rev`), listening
  (`orb-breathe`), thinking (faster orbit), awaiting-approval (signal disc +
  drawn check + `orb-ring` pulse every 1.6s). Compositor-only, <1% idle CPU.
- Hero scene: the 3D mark with four depth-blurred action cards; subtle
  scroll parallax + ≤3° pointer tilt, both rAF-coalesced and gated behind
  `pointer:fine` + `prefers-reduced-motion` (static otherwise).

### Living logo

The cosigno mark is quietly alive everywhere it appears — one consistent
idle "breath," never a zoo of per-page effects. The token is
`LOGO_BREATH` (`src/lib/motion.ts`), mirrored by two Tailwind animations:

| animation | value | on |
| --- | --- | --- |
| `logo-breath` | `scale 1 → 1.015 → 1`, 5s `ease-in-out` | the whole mark |
| `logo-glow` | `opacity 0.92 → 1 → 0.92`, 5s `ease-in-out` | the mark path |

This is the **only** idle animation the logo may use — no per-placement
variants. Discipline (all enforced in `src/lib/useBreathing.ts`):

- **One breather per viewport.** Every living mark registers with a shared
  `IntersectionObserver`; the coordinator grants the breath to the single
  topmost mark on screen and holds the rest still, so a page never shows a
  chorus of pulsing logos. (`pickBreatherIndex` is the pure rule; unit-tested.)
- **Transform/opacity only**, 60fps, compositor-only — no layout thrash.
- **Static under `prefers-reduced-motion`**: the coordinator never activates,
  so the mark renders but does not breathe (asserted in the visual smoke).
- **Nothing before first paint**: registration defers to `requestIdleCallback`
  (setTimeout fallback), so the breath never competes with LCP.
- Tiny footprint: one shared Set + one observer, well under budget.

Components: `LivingMark` / `LivingLockup` (`src/components/brand/LivingLogo.tsx`)
are the coordinated marks; plain `CosignoMark` / `LogoLockup` stay static for
SVG assets, favicons, and dense lists. Placements: landing nav / hero / footer /
beta CTA, app header, checkout success.

Two spin-offs of the same idea:

- **`LogoLoader`** (`src/components/brand/LogoLoader.tsx`) replaces every
  spinner — the breathing mark with an optional label. It always breathes (it
  signals active work, so it's exempt from the single-breather rule) and is the
  route-level `loading.tsx` for `/app`.
- **Favicon status-swap** (`src/lib/useFaviconStatus.ts`): while the workspace
  holds actions awaiting a signature, the browser-tab icon gains a filled orange
  badge — the orb's "waiting for you" signal, carried to the tab. Cleared the
  moment the queue empties.
- The warming-up **503** page breathes too, via inline CSS (edge-safe, with its
  own reduced-motion guard) — the mark is alive even when the app isn't.

### Checkout card choreography (`CheckoutCard`)

The giant card reacts only to safe signals (focus, completion, brand
detection, post-confirm last4) — never card digits. Timings:

| stage | motion | timing |
| --- | --- | --- |
| idle | float ±4px + light-sweep | `card-float` 6s · `card-sweep` 8s |
| name focus | tilt toward viewer (rotateX 8°) | 600ms `ease-brand-out` |
| number fill | 16 dots fill by group | 160ms color per group |
| brand detected | network glyph coin-flips in | `coin-flip` 520ms |
| cvc focus | full 3D back-flip (rotateY 180°) + pulsing well | 600ms flip · `cvc-dot` 1.2s |
| pay | card slides into reader + orange scan line | 600ms slide · `reader-scan` 1s |
| success | pop back, orange check stamp + 20-particle confetti | `check-pop`/`check-draw` + `confetti-fall` 900ms |
| failure | slot shake + gentle eject (no red) | `shake-x` 220ms |

State-driven transforms carry a 600ms transition on an inner layer so the
idle `card-float` (outer layer) never fights them; all collapse to static
final states under `prefers-reduced-motion`.

## Surface language

- **Signature check motif**: `CheckDivider` (faint oversized section
  dividers), `.check-list` (mini orange-check bullets), and the drawn-in
  check on every executed surface (cards, orb, glyphs).
- **Card depth**: `shadow-depth` / `shadow-depth-lift` (1px inset top
  highlight over layered ambient shadows), `shadow-well` (recessed payload
  block), and `.tier3-texture` (faint diagonal hazard band on locked cards).
- **Empty states**: `EmptyIllustration` — flat ink line-work with one orange
  accent, no people (`workspace` / `activity` / `integrations`).
- **Mark**: a soft **orange triangle** with a soft triangular **counter**
  knocked out of it — one shape, one colour, the hole doing the work. The
  monochrome variant is the same silhouette in one ink colour. Geometry is the
  single source of truth in `scripts/logo-geometry.mjs`, mirrored by
  `CosignoMark`.
- **Favicon**: `favicon.svg` is the plain orange mark — one colour reads on a
  light or a dark tab bar and the counter is a hole, so it needs no
  `prefers-color-scheme` rule; home-screen/PWA icons sit on a cream plate;
  `.ico` is the fallback. Regenerate with `npm run assets`.
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
