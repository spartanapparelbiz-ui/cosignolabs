# Cosigno — Data Flow

Where data enters, where it lives, what crosses each boundary, and what never
crosses. Diagrams are logical; every named module exists in `src/`.

## 1. The main loop (command → approval → execution → receipt)

```
┌─────────┐  1. command (strict schema, ≤2000 chars)
│ Browser │ ───────────────────────────────────────────► /api/command
└─────────┘                                                   │
     ▲                                                        ▼
     │                                        requireUser() · rate limits ·
     │                                        global planner budget
     │                                                        │
     │                                                        ▼
     │                                     planner (provider.ts, server-only)
     │                                     context: system prompt + user
     │                                     command + fenced UNTRUSTED content
     │                                     + enabled memories. NEVER: tokens,
     │                                     secrets, other users' data.
     │                                                        │
     │                              structured JSON proposals (zod-validated)
     │                                                        ▼
     │                                     policy engine: server tier
     │                                     (tierFor), rules (tighten-only),
     │                                     injection heuristics → cards
     │                                                        │
     │   4. proposed cards (realtime/poll)                    ▼
     │ ◄──────────────────────────────────────── actions table (status:
     │                                            proposed, RLS-scoped)
     │
     │   5. APPROVE / SIGN (+ typed confirmation for tier 3)
     └──────────────────────────────────────────► /api/actions/:id/approve
                                                              │
                                                              ▼
                                    engine re-checks: ownership · status ·
                                    expiry · injection flag · hold/emergency
                                    stop · rules · room policy · usage
                                                              │
                                                              ▼
                                    authorization record (sha-256 over
                                    canonical payload) → action_events
                                                              │
                                                              ▼
                                    atomic transition approved→executing
                                    (Postgres FOR UPDATE; no double exec)
                                                              │
                                                              ▼
                                    dispatcher (executor.ts): re-verify
                                    payload hash = approved hash; idempotency
                                    key per side effect; category allowlist
                                                              │
                                                              ▼
                                    verification → receipt (immutable row,
                                    correlation id) → executed/failed
```

## 2. External content (email, files, links, tool output)

```
Gmail/Calendar/Drive/MCP/HTTP ──► connector runtime (single door)
        │                          - SSRF guard on every URL
        │                          - response size + time caps
        ▼
  bounded extraction (text only) ──► marked UNTRUSTED (untrusted.ts)
        │                             injection heuristics → injection_flag
        ▼
  planner context (fenced, labeled "data, not instructions")
        │
        ▼
  proposals only — flagged proposals are unapprovable (engine + DB trigger)
```

Uploaded files (`/api/sources/file`): size-capped, parsed to text
(`pdf-parse`/`mammoth`/plain), stored as bounded summaries with
`injection_flag`; originals are not retained as executable objects.

## 3. Connections and credentials

```
User → /api/connections/:key/connect
        → provider consent screen (minimum scopes)
        → callback: state (single-use, expiring, bound to initiating user)
          + PKCE verified → tokens AES-256-GCM encrypted → connections row
Execution time only: decrypt → call provider → discard plaintext.
Never: client exposure, logs, planner context, receipts, exports.
Disconnect/account-delete: best-effort upstream revocation, then hard delete.
```

## 4. Billing

```
Browser → /api/billing/checkout (server builds session; price IDs from env
allowlist; client sends only plan/interval enum)
Stripe → /api/stripe/webhook (signature on raw body → dedup by event id →
out-of-order guard → subscriptions row)
Entitlements: read from subscriptions row only.
Card data: never touches Cosigno (Stripe-hosted fields/iframes).
```

## 5. Radar → CoSign → Proof (the expansion)

```
store state (missions, actions, automations, connections, subscriptions,
sources — the user's own rows only)
        │  deterministic detectors (radar/detect.ts) — no LLM, no fetch
        ▼
radar items: {observed facts + inference + recommendation, provenance,
confidence, category} → radar_items dispositions (dismiss/snooze)
        │  "Prepare Mission" (explicit user click)
        ▼
mission compiler (capability-bound) → prepared mission + CoSign Card
        │  fork selection (recommended/fastest/cheapest/safest) — still
        │  no execution; just a different prepared plan
        ▼
CoSign Card: goal, exact actions, recipients, destinations, apps, data
shared, timing, money, scope, reversibility, risk, expected result
        │  approve/sign (possibly multi-party via CoSign Room)
        ▼
approval gate (§1) → execution → PROOF RECEIPT (immutable)
```

Radar has **no execution path**: its only writes are radar dispositions and
prepared missions/cards that enter the same approval gate as everything else.

## 6. What is stored where

| Store | Data | Access path |
|---|---|---|
| Supabase (RLS) | sessions, messages, actions, events, missions, steps, sources, files, connections (encrypted creds), automations, memories, rules, objectives, holds, signatures, workspaces, rooms, room approvals, radar dispositions, receipts, security events, subscriptions, webhook event ids | server routes (service role); client SELECT-only on own rows |
| Clerk | identity, sessions, MFA factors | Clerk SDK server-side |
| Stripe | customers, subscriptions, payment methods | Stripe API server-side |
| Upstash | rate-limit counters | server-side REST |
| Browser | Clerk session cookie, theme, non-sensitive UI state | — |

## 7. What never crosses which boundary

- Secrets/env values → never to the client bundle (build-enforced), never to
  the planner, never into receipts/events/exports.
- OAuth tokens → never to the browser, never logged, never in model context.
- Model output → never executed directly; only schema-validated proposals.
- Client-supplied `user_id`/`status`/`tier` → rejected + logged as attack
  signal (privileged-field guard).
- Another user's rows → unreachable through every store method (userId-scoped)
  and RLS; proven by the isolation test matrix.
- Card numbers → never touch Cosigno servers.
