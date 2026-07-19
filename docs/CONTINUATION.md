# Continuation Intelligence — Finish This, Rescue, Brief Me, What Can You Do

The seventh evolution makes Cosigno smarter **with what it already has** — no
new APIs, keys, or integrations. Every capability here is built on the
existing planner pipeline, state, permissions, and audit record, and honors
the hard rule: **never fake capability**. If Cosigno can't do something with
existing infrastructure, it says so rather than showing a button that does
nothing.

## Finish This / Do Everything You Can / Rescue

Contextual actions on any delegation (`src/components/app/DelegationActions.tsx`,
shown on delegation rows) that continue it toward its outcome using the
**exact same planner pipeline** (`runCommand`) as a typed command:

- `POST /api/delegations/[id]/continue` `{ mode: "finish" | "everything" | "rescue" }`
- `buildContinuationCommand` (`src/lib/continue.ts`) reads the delegation's
  **real state** — what's executed, what's waiting, what failed — and composes
  an honest instruction that **names completed work so it isn't redone** and
  asks only for what remains, stopping at the boundary.
- It runs **in the same session**, so the delegation continues rather than
  spawning a sibling. New proposals flow through the unchanged boundary —
  nothing executes beyond tier-1 without approval or signature.
- **Rescue** names the failures, forbids retrying failed irreversible actions
  and looping, and if the planner finds no safe next step, the route returns
  an honest *"I couldn't move this forward safely — take it from here."* No
  fake success, ever.
- On success the UI says **"I have it."** — the Cosigno responsibility moment.

Verified live: clicking Finish This on a delegation runs the planner and
prepares the next step, which lands at the boundary (the presence badge
increments) — visible in the State Stream.

## Brief Me / Why Is This Waiting

`GET /api/delegations/[id]/brief` → `delegationBrief` (`src/lib/continue.ts`):
a **deterministic** read of one delegation's real state — momentum, counts,
one-sentence *why it's waiting/blocked/moving*, and the single most useful
*next* step, plus the linked objective if any. No model call, no invented
progress: every line maps to an actual action status. Opened from the "brief
me" action on each delegation.

## What Can You Do Right Now?

`GET /api/capabilities` → `capabilityReport` (`src/lib/capabilities.ts`): an
honest report from the user's **real** connected apps + permission (tier)
settings. It never advertises an integration that isn't connected, always
lists what it can do read-only, and is explicit about what needs one-click
approval vs. a signature. Surfaced as a collapsible "What cosigno can do"
card on NOW (`src/components/app/CapabilitiesCard.tsx`). This is the
never-fake-capability rule turned into a feature (#14 + #22).

## Already delivered — connected, not rebuilt

Much of this expansion's list already ships and was intentionally reused
rather than duplicated: **Continue From Here / Live Takeover** and **Batch My
Decisions** (Focus's takeover + approval bundles), **What Changed / Today /
Pick Up Where We Left Off** (Autopilot brief + State stream + `autopilot_meta`
last-viewed), **Handle Similar Things / Don't Ask Again** (Earned Autonomy),
**Ask Me Every Time / Only If It Matters** (My Rules + Standing-Order modes),
**Return Only If** (Return Points), **Snapshots/Time Travel/Trace** (Replay +
Trust Receipts). This evolution adds the genuinely missing continuation and
honesty layers on top.

## Design

Per the design principle, these are **contextual actions**, not new sidebar
pages — brief/finish/rescue appear on delegations only where they make sense
(rescue on blocked, finish on continuable), and the capability report is one
calm collapsible card. The interface stays minimal; the intelligence sits
underneath.
