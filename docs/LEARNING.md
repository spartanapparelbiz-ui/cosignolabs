# Learning from decisions

Cosigno already recorded every decision its user made: what they approved, what
they rewrote at the approval door before approving it, and what they vetoed and
why. Until now it read none of it back. The operator opened every session as a
stranger, and the user paid for that by correcting the same thing forever.

This is the layer that closes that loop. It reads the user's own decision
history, states the pattern back to the planner, and shows the user exactly
what it concluded and how many decisions each conclusion rests on.

It is a **prior on what to propose**. It is never permission.

## What it concludes

Four kinds, each derived from counting — never from a model.

| Kind | Derived from | What it changes |
|---|---|---|
| `avoid` | a category that gets vetoed more than it gets approved | propose it only when the command clearly asks, and say why |
| `revise` | a category the user keeps rewriting before approving | the default draft isn't landing — be more specific, state assumptions |
| `trusted` | a category approved unchanged, nearly always | keep proposing at this level of detail |
| `constraint` | a word the user reached for across two separate vetoes | treat it as a limit unless the command says otherwise |

Keys are stable and derived — `avoid:send_email`, `constraint:weekend` — so the
same behaviour produces the same key next month, and a mute set today still
applies to the same conclusion later.

## Thresholds

`src/lib/learning/preferences.ts` · `THRESHOLDS`

| | Value | Why |
|---|---|---|
| `minObservations` | 3 | one veto is a mood, not a habit |
| `dominance` | 0.6 | a split history means nothing has been learned yet |
| `trustedMinObservations` / `trustedDominance` | 4 / 0.8 | trust shapes confidence, so it needs more evidence and near-unanimity |
| `constraintMinVetoes` | 2 | a word must recur across *distinct* vetoes, not within one |

These are deliberately conservative. A missed preference costs the user one
more correction. A wrong one makes cosigno confidently do the wrong thing and
cite the user as the reason. The second is much worse, so the bar sits above
what the data alone would justify.

## Nothing is stored

There is no learned-preferences table. The verdict is recounted from the recent
decision window (`DECISION_WINDOW = 100`) every time it is needed. That buys
three things a stored verdict cannot:

- it cannot go stale, and it cannot survive the behaviour that created it — a
  user who changes their mind stops seeing the old conclusion;
- deleting the underlying actions deletes what was learned from them, with no
  second copy to hunt down;
- the count the user is shown ("4 of the last 6") is true when they read it,
  not true when it was cached.

The only persisted part is the user's **mute list**
(`user_prefs.muted_preferences`, migration `0025`) — because disagreement has
to survive, and correcting the operator's model of you must not require
destroying your own audit trail.

## Reads

Three narrow reads, gathered with the other planner context behind the one
multi-second model call:

1. `listActionHeads` — categories and statuses, no payloads;
2. `listActions({ status: "vetoed" })` — reason text, for the small slice that
   has one;
3. `listUserEditedActionIds` — ids only. An approval event's `detail` carries
   the authorization record, which can include a drawn signature image;
   fetching a hundred of those to count corrections would be a large transfer
   for one boolean per action, so the predicate and the projection are pushed
   to the database.

## The boundary

The thing that makes this safe is what it *cannot* reach.

- **No authority.** A preference is prose in the planner's system prompt. It is
  not an input to `resolveTier`, to the permission rules, to `holdBlocks`, or
  to any approval path. It cannot raise or lower a tier, authorize an action,
  or let an approval be skipped. `trusted` says so in the statement itself.
- **The command outranks it.** If the live command argues against an
  observation, the operator follows the command and notes the difference.
- **What the user wrote outranks it.** A note is the user speaking; an
  observation is a guess about them. On a conflict, the note wins — which is
  what the memory page has always promised.
- **A quoted reason is never an instruction.** Veto reasons are the user's
  text but not necessarily the user's words — people paste the sentence that
  annoyed them, and that sentence came from someone else's email. Reasons are
  flattened to one bounded line and dropped outright if they read as
  instructions (`sanitizeReason`, reusing the injection detector).
- **The master switch governs it.** The switch is the user saying cosigno
  should not carry context between sessions. An inferred preference is exactly
  that kind of context, so honouring the switch for hand-written notes while
  quietly keeping the inferred ones would make the control a lie.

## What the user sees

`/app/memory`, below their own notes: each observation in plain language, the
count it rests on ("3 of 4 decisions"), and a **that's not right** button that
drops it without touching the history behind it.

A system that quietly forms opinions about a person is a system that person
cannot correct. Showing the conclusion and its arithmetic is the feature, not
the packaging around it.

## Files

| Path | Role |
|---|---|
| `src/lib/learning/preferences.ts` | pure derivation: decisions → preferences. No I/O, no clock, no model |
| `src/lib/learning/index.ts` | store reads, master switch, mutes, prompt section |
| `src/lib/agent/systemPrompt.ts` | the fenced observations section and its precedence rules |
| `src/app/api/memory/route.ts` | serves observations alongside notes; mute/unmute |
| `src/components/app/MemoryPanel.tsx` | the visible half |
| `supabase/migrations/0025_learned_preferences.sql` | the mute list |
| `tests/learning.test.ts` | thresholds, forgetting, injection containment, and the authority boundary |
