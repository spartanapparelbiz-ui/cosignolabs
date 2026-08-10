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

Four voices, each with exactly one job. All self-hosted by `next/font/google`
(no runtime request to Google), `display: "swap"` with `adjustFontFallback` on
→ no FOUT, no CLS. Wired once in `src/app/layout.tsx`; never import a face in
a component.

| Role | Face | Utility | Used for |
| --- | --- | --- | --- |
| Interface | **Inter** (variable) | `font-sans` | everything you read to operate the product |
| Display | **Source Serif 4** (variable, `opsz`) | `font-display` | headlines, prices, counters |
| Wordmark | **Manrope 800** | `--font-wordmark` | the logotype, and nothing else |
| Record | **IBM Plex Mono** 400/700 | `font-mono` | payloads, ids, amounts, timestamps |

- The display face carries a real optical-size axis, so a 96px headline gets the
  display cut and a 24px price gets the text cut with no code. Leave
  `font-optical-sizing` alone.
- Everything the product asserts as fact — an id, an amount, a recipient, a
  timestamp — is set in the mono. That is the difference between prose and a
  record, and it is why `font-mono` is a declared token rather than Tailwind's
  OS-dependent default stack.
- The wordmark is always lowercase **cosigno**, with the signal i-dot, at 800.
  It is the only place the wordmark face may appear.
- Product name is lowercase everywhere — UI, titles, metadata.
- Weights: 700/800 for headings, 600/700 for body emphasis, 400 for prose.

## Shape & depth

- Radius: **14px** cards (`rounded-card`), **10px** buttons/inputs/wells
  (`rounded-btn`), pills for badges (`rounded-pill`).
- **Soft shadows only** — low opacity, large blur, to match the logo's soft
  3D weight. No hard borders except the veto outline.
- One icon set: **lucide-react**, default stroke width.

### The elevation ladder

Surfaces pick a **height**, not a shadow. Four steps, each keeping the same
1px inset top highlight so a surface reads as the same material wherever it
sits, and each blur roughly double the last so the ladder is legible without
anything looking heavy. Named in `ELEVATION` (`src/lib/motion.ts`).

| token | height | use |
| --- | --- | --- |
| `shadow-e1` | resting | a tile inside a grid |
| `shadow-e2` | raised | the default for anything interactive |
| `shadow-e3` | lifted | hover, and a card that needs a decision |
| `shadow-e4` | overlay | menus, popovers, dialogs |

Two more, for jobs a height can't do: `shadow-hairline` (a 1px ring in the
theme's line colour, for chrome that must not resize by a pixel when it gains
one) and `shadow-signal-glow` (the ONE sanctioned glow — an approval surface
asking to be looked at).

**One hover gesture.** Interactive surfaces rise 2px and gain one step of
elevation over `fast`, and give way under the press (`HOVER_LIFT` + `PRESS`).
Declared once so every card in the product moves the same amount at the same
speed. The lift collapses under `prefers-reduced-motion`.

**Glass is for chrome only** (`.glass`): the app header, the command bar, the
mobile nav — surfaces that float OVER content and must stay legible while the
page moves underneath. Never a card in the page flow, where it only makes text
harder to read. It ships an opaque fallback first, so a browser without
`backdrop-filter` gets a solid surface rather than a transparent one.

### The display type ladder

Each size ships with the leading and tracking it actually wants, so a heading
is one token rather than a size plus two guesses: `text-display-xl` / `-lg` /
`-md` / `-sm`, and `text-eyebrow` for the uppercase section labels. Page
titles are `display-md`; the home headline is `display-lg`.

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

**The operator surface** adds the motion a live workspace needs. All
transform/opacity/filter only, so every one composites on the GPU:

| animation | what it's for |
| --- | --- |
| `tile-in` | panels and tiles arriving, meant to be staggered across a grid |
| `blur-in` | real data resolving out of a blur, replacing a skeleton |
| `feed-in` | a line landing in a feed, from the side the timeline flows |
| `bar-grow` / `bar-travel` | determinate fill / indeterminate travel |
| `step-live` | the step currently executing |
| `rail-mark` | the nav's selected indicator growing into place |
| `pop-in` | popovers, menus, autocomplete |
| `skeleton-wave` | the travelling highlight inside a skeleton |
| `status-ping` | a live status dot's halo (box-shadow — layout-stable) |
| `sheen` | a light sweep across a surface that just changed |

**Staggers are capped.** `staggerDelay(i, step)` clamps against
`STAGGER_CAP_MS` (400ms): 45ms across eight tiles is a flourish, the same 45ms
across forty rows is a page that takes two seconds to finish appearing. Steps:
`words` 80 · `cards` 60 · `tiles` 45 · `rows` 32.

Rules: **transform/opacity only** (never animate layout properties), 60fps,
capped element counts, and everything collapses to an instant state change
under `prefers-reduced-motion` (globals.css + `useReveal` start-shown) —
including inline `animation-delay`, so a reduced-motion visitor never waits
out a stagger in front of a blank grid.

### Progress bars tell the truth

`ProgressBar` is determinate ONLY when the value comes from something counted
— steps completed, items processed. Everything else is indeterminate, which
says "running" honestly and says nothing about how long. A bar that advances
because time passed is a claim about work that isn't happening, and it is the
fastest way to lose trust in a screen. The fill is a `scaleX` transform, not a
width, so a bar animating never reflows its row.

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
- **Empty states**: `EmptyState` wraps `EmptyIllustration` (flat ink line-work
  with one orange accent, no people — `workspace` / `activity` /
  `integrations`). The rule: **never report an absence and stop.** "No
  missions running" is a fact the reader already had; what they don't have is
  the next move, so every empty state carries a real one — a button that fills
  the ask box, a link to the apps that would put something here.
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

## What a surface may assert

Two rules decide what is allowed to appear as a fact. Both are enforced by
pure, unit-tested modules rather than by review — `src/lib/home/model.ts` and
`src/lib/approvals/brief.ts`.

**An unconnected source produces an invitation, never a metric.** "Unread
email 0" is a measurement of an inbox cosigno cannot see; it reads as a fact
and is not one. A tile with no source says what to connect. A tile whose
answer needs a live API call (inbox, calendar) offers the one-tap mission that
would answer it, rather than printing a number nobody measured.

**A count is only shown when something counted it.** Mission progress comes
from step states, "completed today" from completion timestamps, "waiting on
you" from the real proposal queue. Nothing is estimated and then displayed as
though it were measured.

### The briefing

Home opens on what happened while you were away, not on a greeting. Built by
`src/lib/home/briefing.ts` — derived, ordered, and capped at five lines.

- **Ordered by what it costs to miss**: a hold, then decisions waiting on you,
  then a connector that stopped responding, then work in flight, then what
  finished. A briefing that buries the blocking item under a status update
  *is* a status update.
- **Every line names a real cost** and carries its own way out. A briefing
  that says something is waiting and then makes you go find it has spent your
  attention without saving you any.
- **A percentage is only ever counted** from completed steps. It is the most
  quotable thing on the screen — "the launch is 82% complete" gets repeated to
  other people — so it is never produced from elapsed time or step position,
  and never quoted at all for a mission whose steps aren't loaded.
- **A quiet morning says so.** With nothing to report the briefing yields the
  positioning line back rather than manufacturing a line to fill the space.

There is no productivity score, no "you saved 42 minutes", no revenue trend.
cosigno cannot measure those, and a number on this screen is read as a
measurement.

### The operator graph

A mission's plan, drawn as the dependency graph it already is
(`src/lib/missions/graph.ts`, rendered by `OperatorGraph`). A numbered list
renders "these three run at once" and "these three run in order" identically,
and those are different plans with different durations.

- Edges are **read** from each step's `depends_on` — never inferred.
- A step sits at the rank of its **longest** dependency chain, so horizontal
  position is honestly "how early this can start". The shortest path would
  show work starting before it possibly could.
- An edge is solid only when its upstream step actually finished, so you can
  see where work has reached.
- The **critical path** is highlighted: the chain that sets the duration, where
  a delay costs you and delays elsewhere are free.
- Layout is deterministic — same plan, same picture — which is what lets it
  animate between states instead of reshuffling on every completion.

SVG note that cost a real bug: on an SVG element a CSS `transform` **replaces**
the `transform` attribute rather than composing with it. Position and motion
therefore live on separate nested `<g>` elements, and anything animated inside
the diagram sets `transform-box: fill-box`.

### The command palette

⌘K composes and navigates. **It never authorises.** Typing a goal offers to
delegate it — which means filling the ask box, where the normal
understanding-and-confirm flow runs. A decision found by search is opened, not
signed: a "quick approve" shortcut would let someone sign an outward-facing
action from a text field without reading it, which is the exact failure this
product exists to prevent. The footer says so on every render.

Results are grouped in a fixed order (waiting on you → missions → files → apps
→ pages) so the palette's shape is predictable enough to use without looking.

### The decision brief

Every approval carries six derived facts, in a fixed order, so the fifth
approval of the day is read in the same places as the first: **why you're
being asked · risk · rollback · confidence · affects · takes**. All are
deterministic and pure — nothing comes from model prose, for the same reason
the authorization engine is not a model call: a brief a model could word
differently on a second pass is a brief that can be talked into understating
an effect.

- **The irreversible line is the only one allowed to be loud.** Rollback
  prints at full ink weight when the answer is no, and drops to muted when
  it's yes. Everything else stays quiet so that line carries.
- **Rollback takes the pessimistic reading of every tie.** An update whose
  previous values were never captured says exactly that, rather than implying
  a restore that would silently fail.
- **Confidence measures specification, never success.** cosigno cannot know
  whether an email will bounce. It can check whether the proposal contains
  everything its category requires. The caption saying so ships with the
  number every time and is never dropped for space.
- **Affected apps are never guessed.** Only what the payload names, plus the
  category's unambiguous surface ("your email"). A wrong connector here makes
  the whole brief untrustworthy.

**Simulate first** (`src/lib/approvals/simulate.ts`) does not model the
boundary, it RUNS it — `applyRules` → `applyRequirementToTier` → `holdBlocks`,
the same path a real approval takes, then stops. It calls no provider,
decrypts no credential, writes nothing. It opens with the sentence that
nothing happened, in the same place every time, and marks the exact step where
the action stops being recoverable.

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
