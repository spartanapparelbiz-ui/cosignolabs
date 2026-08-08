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
| `signal` | `#FF4B1F` | **only**: the Approve button, executed/success states, the logo **C** and the wordmark **i-dot**, focus rings, active nav, progress fill |
| `ink-soft` | `#5C5650` | secondary text |
| `line` | `#E4D9C8` | the one hairline (orb track) — avoid; prefer shadow |

### Logo identity tokens (exact)

The mark renders with its own precise brand values (distinct from the product
palette so it's identical everywhere and flips cleanly per theme). Mirrored in
`src/lib/brand.ts` (`LOGO_*`), the `--logo-*` CSS vars, and
`scripts/logo-geometry.mjs`.

| Token | Hex |
|---|---|
| `--cosigno-orange` | `#FF4B22` — the C (and the i-dot), every theme |
| `--cosigno-ink` | `#171512` — integrated check + wordmark, **light** |
| `--cosigno-cream` | `#F7F0E5` — integrated check + wordmark, **dark** |
| `--cosigno-white` | `#FFFFFF` — wordmark, **OLED** |
| `--cosigno-black` | `#090909` — **OLED** background |

The symbol is a bold open **C** with an integrated **check** rising through the
opening — **no dot on the icon** (the orange dot lives over the wordmark "i").
Use the one shared component: `<Logo variant="full|icon" theme="light|dark|oled|auto"
size="sm|md|lg" />` (`src/components/brand/Logo.tsx`), `theme="auto"` by default.
Geometry is single-sourced (component ↔ `scripts/logo-geometry.mjs`); only colors
change between themes. Regenerate assets with `node scripts/generate-assets.mjs`.

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
| `DURATION.entrance` / `duration-entrance` | 320ms | card slide-in, rise-in, word stagger |
| `DURATION.slow` / `duration-slow` | 500ms | hero settle, showpiece moments |
| `EASE.out` / `ease-brand-out` | `cubic-bezier(0.22,1,0.36,1)` | default UI easing |
| `EASE.spring` / `ease-spring` | `cubic-bezier(0.34,1.56,0.64,1)` | card entrance / modal overshoot |
| `STAGGER_MS.words` | 80ms | headline word stagger |
| `STAGGER_MS.cards` | 60ms | card-stack stagger |

Named animations (Tailwind `animate-*`): `settle`, `float`, `rise-in`,
`word-in`, `spring-in`, `ring-flash`, `chip-pulse`, `shake-x`, `check-draw`,
`check-pop`, `modal-in`, `fade-through`, `orb-*`, `toast-in`, `shimmer`,
`logo-breath`, `logo-check`.

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
| `logo-check` | `opacity 0.92 → 1 → 0.92`, 5s `ease-in-out` | the orange check path |

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
  spinner. The mark **signs itself in**: a ghost of the symbol sits underneath,
  the real mark is revealed left-to-right the way a signature is written
  (`logo-sign`), and a bright edge travels with the reveal (`sign-edge`). That
  runs **once**; afterwards the mark simply breathes over a soft orange aura
  (`aura-breathe`), so a three-second wait and a fifteen-second wait are equally
  calm. `logo-sign` ends on the complete mark, so reduced motion renders the
  logo whole and still with no branch in the component.
- **`WorkingPip`** (`src/components/brand/WorkingPip.tsx`) is the inline
  "cosigno is doing this right now" mark — a signal dot with a ring that widens
  and clears. It replaced `Loader2` everywhere. The only glyph still permitted
  to rotate is `RefreshCw`, which is animating its own meaning.
### Waiting, arriving, and leaving

The three moments a product is most often judged on. All three are systemic —
adding a route or a modal inherits them rather than reinventing them.

**Loading.** Every route under `/app` has its own `loading.tsx`; a missing one
is a test failure (`tests/loading-experience.test.ts`), so no page can ever open
on a blank frame. Each renders that page's real geometry — including its **real
heading**, since we already know which page is opening, so the h1 never moves
when the content lands. Under the heading sits the contextual line from
`src/lib/loadingMessages.ts`: "Checking connected apps" appears if and only if
you are opening connections. Messages are derived from the route and are never
random — a wait that says something different every time says nothing.

**Skeletons.** The `.skeleton` class (globals.css) is the only placeholder:
a soft `cream-deep` fill with one light band travelling across it on a
transform-only overlay, so a screen full of them still composites. Tailwind's
default `animate-pulse` is not used anywhere.

**Transitions.** `src/app/app/template.tsx` lifts new content 8px into place
(`page-in`, 260ms) while the chrome — rail, header, footer — never moves. The
sequence is content → that route's skeleton → content, so there is no white
frame at either end. `NavProgress` draws a single hairline across the top while
a link is pending (`useLinkStatus`), so a click is acknowledged instantly even
when the route behind it is slow.

**Overlays.** One language: scrims fade (`overlay-in`) and blur what is behind
them; panels arrive from slightly above with a hair of scale (`command-in`,
`menu-in`). Toasts arrive with `toast-in` and leave with `toast-out` — a result
that blinks out of existence reads as a glitch.

### Microinteractions

Applied once, globally, in `globals.css` rather than decorated onto call sites
— which is how an app ends up with three different button feels:

| what | rule |
| --- | --- |
| press | every `button` compresses to `scale(0.97)` while held (opt out with `data-no-press`) |
| focus | text fields gain a soft signal halo on top of the focus ring; `.field-glow` does the same for a container whose input is chrome-less |
| card hover | `.card-lift` — 2px rise plus depth |
| new item | `row-in`, applied ONLY to genuinely new ids (`src/lib/useNewItems.ts`) so motion on a live surface always means something changed |
| success | `check-pop` / `check-draw` / `success-halo`, each a single pass |
| error | `shake-x`, once, lightly |

### Empty states

One component (`src/components/EmptyState.tsx`), three rules: say what IS true
rather than what is missing ("Everything waiting on you has been handled", not
"No approvals"); explain what would put something here; offer exactly one next
action. Illustrations live in `EmptyIllustration.tsx` — ink line work, one
orange accent, no people, no stock look.

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
- **Mark**: an **orange C** opening right, a **check** completing it (theme-ink
  → cream on dark), and a floating **orange accent dot** at the top of the
  opening. Monochrome variant = one ink color. Geometry is the single source
  of truth in `scripts/logo-geometry.mjs`, mirrored by `CosignoMark`.
- **Favicon**: `favicon.svg` keeps the C orange and repaints the check
  ink→cream on dark tabs via `prefers-color-scheme`; home-screen/PWA icons sit
  on a cream plate; `.ico` is the fallback. Regenerate with `npm run assets`.
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
