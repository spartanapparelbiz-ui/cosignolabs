# Fluid Control — responsibility can move

> YOU → COSIGNO → YOU → COSIGNO

The fifth evolution: control moves naturally between the user and cosigno,
in both directions, without restarting work. Every feature below is built on
the existing engine — no schema was broken, no working system replaced, and
the hard authority guarantees (tiers, SIGN, locked actions, injection
containment) are enforced server-side exactly as before.

## Live takeover ("I'll take it from here")

On any handoff (`/app/focus`), the artifact is cosigno's until the user
takes it: **I'll take it from here** pauses cosigno's side and makes the
actual work directly editable (the email fields, or the exact payload). The
control chip flips to **YOU HAVE CONTROL**. Then:

- **Cosigno, continue** — hands it back with the user's changes kept
  (PATCHed into the proposal). Nothing restarts, nothing is overwritten,
  nothing completed is repeated.
- **Finish myself** — the user keeps the work; the card closes with a
  logged reason ("took over — finishing this myself").

## Approval bundles

When several decisions wait, **Review all N together** lists every one —
nothing is ever hidden inside a bundle. Each row shows its summary and
whether it's one-click or signature; flagged (injection-held) actions are
excluded and can't be selected. One signature authorizes exactly the
checked actions — the SignDialog lists all of them, and **each action still
gets its own authorization record and (for tier 3) its own confirmation.**

## Why me?

Every handoff answers "why do you need me?" in one sentence derived from
the action's real category/tier/flags (`whyMe`, `src/lib/clarity.ts`):
locked actions, external sends, routine approvals, and injection-held cards
each get their honest reason. The boundary is never arbitrary.

## Temporary authority

Scoped, time-limited grants (`temporary_authority`, migration 0018):
"for the next two hours, handle record updates without asking."

- Enforced in `resolveTier` at proposal time — the one place tiers are
  assigned — so it's real behavior, not a label.
- Eligible: unpinned tier-2 categories that never require SIGN
  (`temporaryAuthorityAllowed`). The API refuses the rest, and the resolver
  ignores ineligible rows even if they existed (defense in depth).
- Base settings are never touched: expiry or revocation simply means the
  previous level applies again. Every grant/revoke is audited.
- Visible + revocable on Home ("Temporary authority" card);
  `GET/POST/DELETE /api/authority`.

## Delegation replay

**Replay** on any delegation shows its ordered operational history from the
audit record: accepted → prepared → *Boundary reached* → signed → executed
(`replayOf`, `/api/replay?session_id=`). Concise operational evidence, never
hidden chain-of-thought.

## Outcome verification

Receipts distinguish **Executed** ("the action ran; the outcome has not
been independently verified") from **Verified** (the result record actually
claims delivery/confirmation), plus Failed and Waiting. Never faked — the
row reads only what the integration reported. The same honesty applies to
Undo: no undo button is shown anywhere, because no current integration
supports safe reversal; when one does, the seam is this same result record.

## The rest

- **Drop Zone** — drop files, links, or text onto the delegation box;
  files upload through the existing sources pipeline, links open the
  link-attach flow, text lands in the objective ("What should I do with
  this?").
- **Ownership language** — delegation rows read as the control model:
  *cosigno owns it · at the boundary · blocked · complete*.
- **Learn from success** — completed delegations offer "handle this the
  same way next time," prefilling a standing order (nothing exists until
  the user confirms it).
- **My Rules** — the memory surface is the rules book: plain-language
  operating principles the planner reads on every delegation; explicit
  rules override inferred preferences, and hard boundaries hold regardless.
- **Continue anywhere** — delegations, decisions, and signatures already
  live in the user's account, not a device: any signed-in session (desktop
  or phone) sees the same boundary queue and can sign; execution continues
  server-side. Native apps/extensions are future surfaces on the same APIs.
