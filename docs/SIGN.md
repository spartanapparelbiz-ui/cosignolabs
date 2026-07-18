# Cosigno Sign™

The defining interaction: when something important needs authorization, the
background dims, the action card moves into focus, and the user draws (or
holds to apply) their signature. The card seals — AWAITING SIGNATURE →
SIGNED → Executing… → Completed ✓ — in about 1–2 seconds. Premium, precise,
no confetti.

## Authorization levels

| Level | Tier | Interaction | Examples |
|---|---|---|---|
| **Auto** | 1 | Runs automatically, still logged | search, summarize, draft |
| **Approve** | 2 (internal) | One click | update a record, archive email |
| **Sign** | 3 always, plus outward-facing tier 2 | Draw or hold-to-apply a signature | send external email, publish, spend, webhooks; delete/refund/payment |

`signRequired(category, tier)` in `src/lib/sign.ts` is the single mapping.
It is **presentation + audit only** — the server state machine is unchanged:
tier-2/3 still execute only through `approveAction`, and tier 3 keeps its
confirmation contract (the SIGN dialog supplies it after a completed
signature, replacing the old typed-name field as the deliberate human step).
Users still control category↔tier placement in settings; injection-flagged
cards can never be signed into execution.

## Security model — the signature is not the proof

A visual signature is never treated as the security mechanism. Every
approval (auto, one-click, or signed) seals a **tamper-evident authorization
record** into the `approved` audit event (`src/lib/signRecord.ts`):

```
authorization: {
  method: "auto" | "approved" | "signed",
  signed_name, authorized_at,
  record_hash,          // sha256 over user, action, category/tier, method,
                        // the EXACT approved payload, and the timestamp
  signature_image?      // the drawn PNG, bounded, audit context only
}
```

Recomputing the hash against the stored fields exposes any after-the-fact
edit (covered in `tests/sign.test.ts`). Authorization is tied to the
authenticated account through the same `requireUser` gate as everything
else.

## Saved signature (Hold to Sign)

Users may save their signature (`signatures` table, migration `0017_sign.sql`;
`GET/PUT/DELETE /api/signature`, PNG data URI ≤ 80 KB). Future SIGN dialogs
then offer **Hold to Sign**: hold ~1s and the saved signature animates onto
the card. The saved signature is a product interaction representing approval
inside cosigno — **not** automatically a legally binding e-signature. Flows
that legally require one belong with dedicated e-signature providers.

## Receipts

Every executed action offers **View receipt** (approvals cards + the
activity ledger): what was proposed, who authorized it and how, when it
executed, the result, and the record hash — rendered by
`src/components/sign/ReceiptModal.tsx` from the stored action + events.

## The rest of the evolution (same release)

- **Live Operator home** — "What should cosigno handle?" over four live
  sections: Working (step x of y), Needs You (Sign → / Approve →), Watching,
  Completed.
- **Delegation** — `classifyDelegation` (`src/lib/delegate.ts`): "watch
  for…" becomes a monitor-mode watch, "every monday…" a prepare-mode
  recurring rule, everything else a mission. The user never picks the
  workflow.
- **Watch** (`/app/watch`, replaces the automations nav item; the old route
  redirects) — standing rules in three modes: monitor (notify), prepare
  (propose for approval), act (explicit per-rule execute grant; tier 3 always
  stays manual).
- **Skills** (`/app/skills`) — installable packs (Inbox / Meeting / Founder /
  Sales Operator). Installing creates a named set of watches + prepare
  rules; uninstalling removes exactly those. Nothing a skill prepares runs
  without approval.
- **Navigation** — home · missions · watch · approvals · activity ·
  connections · settings. Cosigno itself is the operator; there is no
  separate operator page.
