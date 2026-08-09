# cosigno

**Give it responsibility. Keep the authority.** Cosigno takes delegated
outcomes, handles the work between your decisions across your tools, and
returns to you only when your authority is actually required — nothing
important crosses the boundary without your approval or signature.
(See `docs/CONTINUATION.md`, `docs/OBJECTIVES_HOLD.md`, `docs/FLUID_CONTROL.md`,
`docs/RESPONSIBILITY.md`, `docs/ENVIRONMENT.md`, `docs/SIGN.md`,
`docs/CONNECT_ANYTHING.md`.)

Live at [cosignolabs.com](https://cosignolabs.com).

## The core loop

1. You give the operator a command in natural language.
2. The agent plans and produces **action cards** — structured proposals, never
   executed actions. Each card shows what it will do in one plain-English
   sentence, the exact payload it would execute, and a risk-tier badge.
3. **Approve, Sign, or Veto.** Nothing executes until you decide. Routine
   writes are one-click approvals; important actions (external email,
   publishing, spend, and everything locked) use **Cosigno Sign** — you draw
   or apply your signature, the card seals, and a tamper-evident
   authorization record lands in the audit trail (see `docs/SIGN.md`). Veto
   kills the card with a logged reason.
4. Everything — proposed, approved, vetoed, executed, failed, blocked,
   flagged — is permanently logged in the Activity timeline.

## Two layers: Operator + Autopilot

Cosigno is two connected layers over the same approval engine:

- **Operator** carries out approved tasks and workflows ("what should I do?").
- **Autopilot** continuously reads the business — what changed, what's going
  wrong, what's going well, what should happen next — and turns its findings
  into signals, health scores, a forecast, a business map, and recommended
  actions ("what is happening, and what should change?"). Every "take action"
  routes back through the Operator pipeline, so Autopilot can never execute
  anything on its own. See `docs/AUTOPILOT.md`.

## Three-tier permission model

| Tier | Name    | Behavior |
|------|---------|----------|
| 1    | Auto    | Read-only / reversible (search, summarize, draft). Executes without approval, still logged. |
| 2    | Approve | Anything that sends, posts, modifies, or spends. Requires explicit card approval; outward-facing categories (external email, publishing, spend, webhooks) use the SIGN interaction. |
| 3    | Sign (locked) | Destructive or financial (delete, refund, payment). Deliberate signature authorization on top of the server confirmation contract. Pinned — cannot be lowered. |

Tiers are enforced server-side from the action **category**; the client cannot
escalate and the agent cannot self-escalate. If the model requests a different
tier than the server assigns, the server's tier wins and the mismatch is noted
on the card (`tier_note`).

## Prompt-injection resistance

All external content the agent reads is wrapped in a labeled
`<untrusted_external_data>` envelope before entering model context and scanned
for instruction patterns. Instructions inside external content never create or
approve actions. Suspected injection sets `injection_flag`, which:

- surfaces the warning chip *"External content attempted to direct the agent"*
  on affected cards,
- disables auto-execution even for tier-1 actions,
- writes a `flagged` row to the audit log.

The operator's system prompt is server-side only and versioned
(`src/lib/agent/systemPrompt.ts`).

## Stack

- **Next.js 15** (App Router, TypeScript) + Tailwind CSS
- **Supabase** — Postgres with RLS on every table, realtime card updates
- **Supabase Auth** — auth (single user beta; orgs later)
- **Hosted LLM planner** — the operator agent (server-side only; the model is
  configured via `PLANNER_API_KEY` / `PLANNER_MODEL_*`, never hardcoded)
- **Stripe** — subscriptions + server-enforced plan limits

### Demo mode

With no env vars set, the app runs fully offline: single demo user, in-memory
store, deterministic planner. Same state machine, same guarantees — ideal for
local development and for exercising the acceptance tests.

```bash
npm install
npm run dev        # http://localhost:3000 (landing) and /app (workspace)
npm test           # acceptance tests
npm run build
```

Copy `.env.example` to `.env.local` and fill in keys to go from demo mode to
production behavior (Supabase auth + persistence + realtime, the hosted
planner).

### Supabase setup

Apply `supabase/migrations/0001_init.sql`. Highlights:

- RLS on every table; users see only their own rows.
- `actions.status` can never be set by a client: no insert policy, update
  policy restricted to `proposed` rows, **column-level grant** limited to
  `payload, summary`, and a trigger that validates every status transition.
- `transition_action()` / `increment_usage()` are `security definer` RPCs
  callable only by the service role.

### Auth setup

Sign-in is Supabase Auth driven headlessly — the engine is theirs, every screen
is ours. Beyond the three Supabase keys it needs dashboard configuration (Site
URL, Redirect URLs, and **custom email templates**, since the defaults are
incompatible with `/auth/confirm`). All of it, plus the failure modes and a
clean-project walkthrough, is in [`AUTH_SETUP.md`](./AUTH_SETUP.md).

## Acceptance guarantees (tested in `tests/acceptance.test.ts`)

- A tier-2 action can never reach `executed` without a logged approval row.
- A client request attempting to set `status` directly is rejected (HTTP 403
  at the API, revoked at the database).
- An injected instruction in external content produces a flagged card, not an
  action.
- At the usage limit, execution is blocked with an upgrade prompt while
  proposals still work.
- The landing page is a static, dependency-light render with a CSS demo loop
  that autoplays above the fold on mobile.

## Repository layout

```
src/lib/types.ts            categories, tiers, status state machine
src/lib/tiers.ts            server-side tier resolution (pinned tier 3)
src/lib/actions/engine.ts   approval state machine (approve/veto/edit/execute)
src/lib/agent/              planner (hosted LLM + offline mock), untrusted-content
                            wrapping, injection detection, versioned prompt
src/lib/store/              storage boundary: Supabase + in-memory backends
src/app/api/                server routes — the only writers
src/app/page.tsx            landing page
src/app/app/                workspace, activity, settings
supabase/migrations/        schema + RLS + transition functions
```

---

cosignolabs.com · [@aethric.hq](https://instagram.com/aethric.hq)
