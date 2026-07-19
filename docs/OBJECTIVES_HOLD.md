# Objectives, Cosigno Hold & Trust Receipts

The sixth evolution adds the layer *above* delegations, the authority brake
*over* execution, and a transparent chain of responsibility on every
completed action. As with every prior layer, it is built entirely on the
existing engine — no schema broken, no secrets or integrations touched, and
all hard authority guarantees enforced server-side unchanged.

## Objectives — outcomes owned over time

`COMMANDS → TASKS → DELEGATIONS → OBJECTIVES`. An **Objective** is a
destination the user wants over time (e.g. "Launch the company by August 1").
Delegations link to it; cosigno derives everything — what's complete, what's
blocked, what needs you, what can happen next — from the **real state** of
those linked delegations. Nothing is stored as "progress"; it's computed
(`objectiveProgress`, `src/lib/objectives.ts`) from action statuses, so it
can never drift from reality.

- Tables `objectives` + `objective_links` (migration 0019, RLS, both store
  backends). Deleting an objective removes only its links — the delegations
  themselves survive.
- `GET/POST /api/objectives`, `GET/PATCH/DELETE /api/objectives/[id]`,
  `POST/DELETE /api/objectives/[id]/link`.
- `/app/objectives` (list with rolled-up momentum + progress bars) and
  `/app/objectives/[id]` (link/unlink delegations, mark achieved, delete).
  A compact summary rides on NOW; new nav entry between `now` and
  `delegations`.
- Rolled-up momentum uses the same reading as delegations — your attention
  first (needs you), then blockers, then motion — never a score.

## Cosigno Hold — the authority brake

A user-level pause, **enforced in the engine before any execution**
(`src/lib/actions/engine.ts` via `holdBlocks`, `src/lib/hold.ts`):

- `external` — anything requiring approval or signature (tier ≥ 2) waits at
  the boundary; tier-1 read-only work still runs.
- `all` — everything waits, including tier-1 auto-execution.

While held, `approveAction` throws `on_hold` (HTTP 423) and the card **stays
proposed**; `autoExecute` returns the action un-executed. The block is
recorded as an audit event, so it's traceable. Crucially, **base permissions
are never changed** — Resume (`scope: none`) lets the exact same action
through unchanged. This is the strongest expression of "keep the authority":
one control that halts everything new at the boundary, instantly and
reversibly.

- Table `user_hold` (migration 0019). `GET/POST /api/hold`.
- A slim global banner (`HoldBanner`) appears only while held, with Resume;
  the full control lives on NOW. Toggling anywhere broadcasts
  `cosigno:hold-changed` so every surface updates at once.
- The State (`/api/state`) now carries the hold scope, so Presence and NOW
  reflect it.

## Trust Receipts + Trace

Receipts are upgraded to the full trust record the spec describes, all from
data already stored:

- **What / Why** (the delegation the action belonged to), **Prepared by**
  (Cosigno), **Authorized by**, **Authorization** (signed / approved / auto),
  **Permission used** (plain language from category + tier — "external,
  signature required" / "approval required" / "auto"), **Executed**,
  **Status**, **Result**, **Outcome** (verified vs executed — never faked).
- **Trace** — an expandable chain of responsibility built only from the
  action's own audit events + result: prepared → authorized (with permission)
  → executed → outcome. No hidden reasoning; just the operational record. The
  tamper-evident record hash remains the seal.

## Already delivered in prior evolutions (not rebuilt)

Much of this expansion's wish-list already ships and was intentionally not
duplicated: the **Decision Queue** and **Cosigno Recommends** (Focus),
**Return Points** (`returnCondition`), **Authority Budgets/Expiration**
(Temporary Authority, migration 0018), **Reversibility awareness**
(reversibility chips), **Human Fallback** (failed cards → take over →
continue), **Impact/why** (`whyMe`), **Replay** (`/api/replay`), and
**outcome verification**. This evolution adds the genuinely missing layers
rather than inflating the feature count.
