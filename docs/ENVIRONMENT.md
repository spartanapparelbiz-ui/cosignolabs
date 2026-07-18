# The Cosigno Operating Environment

Cosigno handles everything between your decisions. This layer turns the app
from pages-with-features into an environment that responds to intent: the
user expresses what they want, and the interface becomes the answer.

## Presence

The cosigno mark lives in the chrome (`src/components/presence/Presence.tsx`),
reflecting the REAL state of delegated work from `/api/state`:

- mark — available
- mark ··· — actively working (a mission is moving)
- mark N — N decisions need you

Clicking it (or ⌘K / ctrl+K) activates cosigno anywhere in the app.

## Adaptive UI (the interface becomes the answer)

`classifyIntent` (`src/lib/intent.ts`) is a deterministic, tested router —
no model call sits between the user and their own workspace:

| The user says | The workspace becomes |
|---|---|
| "What's waiting on me?" | Focus — only the decisions (`/app/focus`) |
| "What did you finish today?" | Today's completed work (activity, filtered) |
| "What's happening?" / "what changed" | Current State (home) |
| "What's blocked?" | Blocked missions, isolated |
| "Show me the launch" | That mission's environment (`/app/missions?q=launch`) |
| "Show my watches / missions / activity" | The matching surface |
| anything else | A delegation — prefilled into the understand→plan pipeline |

## State (no scores)

Business scores are gone from the core experience. `src/lib/state.ts`
assembles **Cosigno State** — pure functions over stored records:

- **Current State** — `7 Moving · 2 Need You · 3 Watching · 1 Blocked`:
  missions by momentum, open decisions, enabled watches. The actual state of
  delegated work, not vanity metrics.
- **Momentum** — every mission is Moving / Waiting / Needs you / Blocked /
  Complete (`momentumOf`), never a number.
- **State Stream** — a quiet chronological record of meaningful events
  (prepared, signed, completed, held, mission working), derived from the
  audit trail. Tier-1 auto approvals are mechanics, not meaning — excluded.
- **Operational memory** — honest observations counted from the record
  ("You've signed 3 external emails…"), shown during handoffs. Never hidden
  reasoning.

`GET /api/state` serves all of it; Presence polls it, Home renders it.

## Focus + Handoff (the Handshake)

`/app/focus` (`src/components/focus/FocusMode.tsx`) is where cosigno hands
work to the user. Everything irrelevant is gone. The user sees the ACTUAL
artifact — an email renders as an email (To / Subject / Body, editable in
place), other work as its exact scope — plus what cosigno recommends and
why, with a relevant operational note.

The handoff line (`COSIGNO ── ● ── YOU`) shows responsibility crossing to
the user; after Approve / Sign (the existing Cosigno Sign surface, hold-to-
sign included) or "Tell cosigno" (a logged veto), the work animates back to
cosigno's side and the next decision arrives. One at a time, as little
interruption as possible.

Approvals still travel the identical engine door — Focus is presentation
over the same state machine, rate limits, and authorization records.

## Environments (deterministic components, no generated frontend)

Mission environments are assembled from the tested component library — the
living progress track (one segment per action: done / waiting on you /
open / vetoed), momentum labels, and deep links into Focus. Adaptive-UI
queries (`?q=`, `?filter=blocked`) shape the missions surface into the
asked-for answer. No AI-generated frontend code, ever.

## Fallback navigation

home · missions · watch · approvals · activity · connections · settings
remains for discoverability and accessibility — but Presence + intent is the
primary interaction model.
