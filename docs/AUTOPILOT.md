# Business Autopilot

Autopilot is Cosigno's intelligence layer. Where the Operator asks *"what
should I do?"*, Autopilot asks *"what is happening in this business, what is
going wrong, and what should change?"* — and answers with conclusions,
evidence, and recommended actions instead of dashboards.

It does **not** replace the approval-first Operator. Every action Autopilot
recommends routes through the exact same pipeline as a typed command: the same
rate limits, the same planner, the same tier system, the same approval state
machine. Autopilot has no faster door.

## What the page shows (`/app/autopilot`)

| Section | Answers | Source |
|---|---|---|
| Daily Brief | what changed overnight, the one priority | engine + signals |
| Business Health | one honest score per category, each explained | `health.ts` |
| What changed | meaningful movements only (max 5) | `insights.ts` |
| Needs attention | priority queue: what happened, why it matters, impact, confidence, recommended step, Review / Ignore / Ask | `signals.ts` |
| Going well | positive signals (opportunities) | `signals.ts` |
| Forecast | monthly projection vs target with an honest range | `forecast.ts` |
| What should we do next | grounded recommendation shortlist (max 5) | `insights.ts` |
| Signals | the full feed with severity + user dispositions | `signals.ts` |
| Business Map | funnel (traffic → leads → customers → revenue → retention) + six areas with their systems and health | `map.ts` |
| Ask about your business | grounded Q&A: answer, evidence, metrics, confidence, next step | `ask.ts` |

## Architecture

Everything is computed by **pure functions** over one `BusinessSnapshot`
(`src/lib/autopilot/types.ts`): daily series (revenue, orders, refunds,
customers, churn, sessions, ad spend, conversions, expenses) plus entities
(leads, campaigns, products, support topics). The engine modules —
`signals.ts`, `health.ts`, `forecast.ts`, `map.ts`, `insights.ts`, `ask.ts` —
are deterministic and unit-tested (`tests/autopilot.test.ts`).

`overview.ts` is the only impure layer: it builds the snapshot, joins the
user's stored signal dispositions, and assembles the payload the page renders.

### Data honesty (the no-fake-metrics rule)

Until live metric readers exist for revenue/ads/CRM providers, the snapshot is
the **sample business** (`sample.ts`) — a deterministic 90-day dataset that is
labeled `data_source: "sample"` in every payload and rendered with a "Sample
data" chip everywhere. It never impersonates the user's real numbers. The
user's real *connections* do flow into the Business Map's systems lists, so
the map reflects their actual stack. `buildSnapshot()` in `overview.ts` is the
single seam where live readers plug in later; the engine, API, and UI need no
changes when they do.

Categories without a data source say **"Not enough data"** rather than
inventing a score, and the forecast always states its range and uncertainty.

### Signals and persistence

Signals are recomputed from data on every read; their **keys are stable per
condition** (e.g. `revenue_week_drop`), so the only persistence is the user's
side of the story:

- `autopilot_signal_states` — disposition per signal key: `new` → `seen`
  (stamped when the user views the page, via `POST /api/autopilot/seen`),
  `ignored`, or `actioned`. Ignored signals leave the priority queue but stay
  visible (dimmed) in the feed.
- `autopilot_meta` — when the user last opened Autopilot.

Both are RLS-protected, service-role-write-only, like every other table
(migration `0016_autopilot.sql`).

### API

- `GET  /api/autopilot` — the full overview (read-only).
- `POST /api/autopilot/seen` — mark the visit; flips `new` signals to `seen`.
- `POST /api/autopilot/signals/[key]` — set one disposition.
- `POST /api/autopilot/ask` — grounded Q&A (deterministic, no model call).
- `POST /api/autopilot/act` — run a recommended command **through the normal
  Operator pipeline**; optionally marks the source signal `actioned`. This is
  the only bridge between the layers, and it preserves approval-first.

## Automation modes

Recurring rules (`/app/automations`) now declare what a run may do with what
it finds:

- **monitor** — watch and report only. Any tier-2+ proposal a run creates is
  auto-vetoed with an honest reason; nothing waits on the user.
- **prepare** — the default and the previous behavior: runs propose action
  cards that wait for approval.
- **execute** — an explicit, per-automation grant: routine **tier-2**
  proposals from this rule's runs are approved through the normal engine door
  (usage caps, injection containment, and the state machine still apply).
  Locked tier-3 actions (payments, refunds, deletes) are never auto-approved.

The mode is enforced server-side in `src/lib/automations.ts`, covered by the
existing automation security tests plus `tests/autopilot.test.ts`.
