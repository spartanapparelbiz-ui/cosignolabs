# Cosigno — Responsibility × Authority

> Give cosigno responsibility. Keep the authority.

The product is built around one relationship: the user hands cosigno
responsibility for OUTCOMES; cosigno handles the work between decisions;
when it reaches the boundary of its authority, the work returns to the user.
This layer names and completes that model on top of the operating
environment (`docs/ENVIRONMENT.md`) and Cosigno Sign (`docs/SIGN.md`).

## The vocabulary (and where it lives)

| Concept | What it is | Where |
|---|---|---|
| **NOW** | The live state of the relationship: briefing, what cosigno is handling, where you're needed, watching, completed | `/app` |
| **Delegations** | Outcomes handed to cosigno (missions, reframed) — active until done, canceled, or blocked on you | `/app/missions`, nav "delegations" |
| **Delegation Agreement** | "I'll handle this / I'll handle / I'll ask before / I'll return when" — the compile preview reframed as accepted responsibility, with `Delegate →` | `SourceComposer` |
| **Return to me** | User-defined handback conditions ("…and return to me when X"), extracted by `returnCondition()` and shown in the agreement; the full text still reaches the planner | `src/lib/delegate.ts` |
| **The Boundary** | The line between what cosigno can handle and what only the user can authorize — drawn literally on the handoff line (`COSIGNO ─┼ BOUNDARY ┼─ YOU`) | `/app/focus`, nav "boundary" |
| **Handoff / Handshake** | Work crosses to the user (the actual artifact), gets approved/signed/changed/declined, and visibly returns | `FocusMode` |
| **Cosigno Seal** | Signed actions carry a seal in their receipt: SIGNED BY {name}, the drawn signature, "Authorized through Cosigno" + time | `ReceiptModal` |
| **Take this** | Hand responsibility for the thing you're looking at (files v1; extension/desktop later) — prefills a delegation, never starts without the agreement | `FilesPanel` |
| **Briefings** | "Good morning — while you were away…" from the real state stream since your last visit, then straight into decisions (`Start briefing →`) | Home `BriefingCard` |
| **Standing Orders** | Ongoing responsibilities (recurring rules), each showing its trust mode | `/app/watch` |
| **Trust modes** | OBSERVE (watch + report) / PREPARE (ready for approval) / OPERATE (explicit per-order grant). Stored as monitor/prepare/execute — labels only | `AutomationsPanel` |

## Earned autonomy

Cosigno becomes more capable over time **without ever expanding its own
authority**. `autonomyOffers()` (`src/lib/state.ts`) notices ≥5 one-click
approvals of the same category and offers — explicitly — to take it over:

- only categories currently at APPROVE (tier 2),
- never SIGN categories (external email, publishing, spend, webhooks),
- never pinned tier-3 categories,
- signed approvals don't count — only routine one-clicks.

Accepting routes through the existing tier-settings door (`POST
/api/settings/tiers`, reversible in settings → permissions). Declining is
remembered and never re-asked. Covered in `tests/responsibility.test.ts`.

## What deliberately did NOT change

The approval engine, tier contracts, injection containment, authorization
records, and rate limits are untouched. Every concept above is presentation
and assembly over the same server state machine — responsibility language on
top of the exact same authority guarantees.
