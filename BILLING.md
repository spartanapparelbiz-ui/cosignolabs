# cosigno — billing

Stripe subscriptions with server-enforced, plan-aware limits. Everything
fails closed: if plan status is unknown or the store errors, the user is
treated as **free**. With Stripe env vars absent, the app runs with everyone
on free and the billing UI hidden — it never crashes.

## Plans (single source of truth: `src/lib/plans.ts`)

| Plan | Price | Actions/mo | Integrations | Extras |
|---|---|---|---|---|
| free | $0 | 25 | 1 | live preview, activity log |
| pro | $29/mo · $290/yr | 1,000 | unlimited | CSV export, priority planning |
| max | $99/mo · $990/yr | 10,000 | unlimited | stronger-model routing, webhook/API, priority support |

"Actions" = planning calls **plus** executions, counted by the usage meter.
Annual = 2 months free. UI, enforcement, and the Stripe setup script all read
from `plans.ts` — nothing is hand-written elsewhere, so it can't drift.

## Webhook events handled (`/api/stripe/webhook`)

The webhook is **signature-verified** (unsigned/forged → 400, nothing written)
and is the **only** writer of subscription state.

| Event | Effect |
|---|---|
| `checkout.session.completed` | create/update the `subscriptions` row from the new subscription |
| `customer.subscription.created/updated` | sync plan, interval, status, period end, cancel-at-period-end |
| `customer.subscription.deleted` | mark canceled (access continues to period end, then free) |
| `invoice.payment_failed` | mark `past_due`, stamp `past_due_since` (starts the 7-day grace clock) |

**Payment failure**: `past_due` keeps paid access for 7 days
(`PAST_DUE_GRACE_DAYS`) with a "payment failed — update your card" banner,
then enforcement drops to free until resolved. **Cancellation**: access
continues to `current_period_end`, then free.

## Enforcement points (all read `getUserPlan(userId)`, server-side only)

- **Usage limit** — `src/lib/agent/pipeline.ts` (planning) and
  `src/lib/actions/engine.ts` (execution + auto-execute) compare the meter
  against the plan's `actionLimit`. Over limit → **402** with plan-aware copy;
  proposals already on screen may still resolve, new commands are blocked.
- **Integrations** — `POST /api/integrations` rejects a free user's 2nd
  connection with **402**.
- **Model routing** — `chooseModel()` gives the **max** plan the stronger
  planner (`PLANNER_MODEL_PREMIUM`) only for complex commands (tier-3
  categories / multi-step); free/pro always use the default fast planner
  (`PLANNER_MODEL_DEFAULT`). Logged per call by tier, never the model id.
- **CSV export** — `GET /api/activity?format=csv` requires pro+ → else 402.

Plan is never read from client input. The `subscriptions` table has no client
write policy; RLS lets a user read only their own row.

## Owner override (`OWNER_IDS`)

Internal accounts get full access with no Stripe subscription. `getUserPlan`
checks it **first**, before any store read (`src/lib/billing.ts`), so all the
enforcement points above inherit it and none can disagree about who an owner
is. `src/lib/owner.ts` is the whole implementation.

- **Keyed on the Supabase Auth user id, never an email.** `OWNER_IDS` is a
  comma-separated list of UUIDs. An entry that is not a user id — an email, a
  leftover Clerk `user_...` id, `demo-user`, a `guest_...` id — is **dropped
  during parsing rather than compared**, and logged as `owner_id_rejected` by
  position (never by value). An address therefore cannot match even if the
  signed-in user's address is exactly that string.
  Why: this app deliberately frees an email for re-signup on account deletion
  (`src/app/api/account/route.ts`) and supports email change
  (`src/app/auth/confirm/route.ts`) — both silently move an email-keyed
  override to a different person. A user id is minted once and never reissued.
- **Unset = no owners.** Fails closed in the same direction as everything else.
- **Not purchasable, not storable.** The `owner` tier is absent from
  `PLAN_ORDER` and `PAID_PLANS`, the checkout routes hard-enumerate
  `["pro","max"]`, the Stripe webhook coerces anything else to `free`, and a
  subscription row claiming `plan: "owner"` resolves to **free**. `OWNER_IDS`
  is the only grant.
- **Hidden from the UI.** `publicFace()` (`src/lib/plans.ts`) maps `owner` →
  `max` in `GET /api/usage`, the only payload that carries a plan id to a
  browser, so an owner's account page is identical to a max subscriber's. This
  also keeps the response serializable — the owner plan's `actionLimit` is
  `Infinity`, which `JSON.stringify` would emit as `null`.
- **Attribution.** Owner activity is still metered and recorded: the
  `ai_usage` ledger stores `plan: "owner"` per planner call, so
  `GET /api/internal/costs` separates internal spend from customer spend.
- **No id-discovery route.** There is deliberately no endpoint that reports
  your own user id or owner status. Read the UID from Supabase →
  Authentication → Users. An endpoint answering "are you an owner?" would be
  a permanent hint that owners exist, in exchange for a value you need once.

### Every enforcement point an owner bypasses

`getUserPlan` covers everything that reads a plan — but three ceilings are
enforced *outside* the plan and each needed its own bypass. All four read the
same `isOwner(userId)`; there is no second owner check anywhere.

| Ceiling | Where | How the owner clears it |
| --- | --- | --- |
| AI operations, connected apps, custom MCP, CSV export, model routing | `getUserPlan()` → `src/lib/billing.ts` | resolves to the `owner` plan before any store read: `actionLimit`/`integrationLimit` are `Infinity`, `customMcp`/`canExportCsv`/`strongerModel` are `true` |
| Per-user rate windows (minute + day) | `enforceLimit()` → `src/lib/ratelimit.ts` | returns before the limiter when the window's key is an owner id |
| Shared daily planner cap | `enforceGlobalPlanningBudget(userId)` → `src/lib/ratelimit.ts` | returns **before the counter increments**, so owner traffic neither hits the beta cap nor consumes it on behalf of customers |
| Mission action budget | `missionBudget()` → `src/lib/missions/missionBudget.ts` | limit becomes `UNLIMITED`; the counter still runs, so the receipt stays honest |

Windows keyed by something other than a user id — client IP on the anonymous
sandbox (`/api/preview`), the beta form, `authz:<org>` on the token routes —
are **not** bypassable: `ownerIds()` admits only UUID-shaped entries, so an IP
or an org string can never be in the set. Those surfaces stay limited by
construction rather than by remembering to exclude them.

Proved by `tests/security/owner.test.ts`.

## Data model

`subscriptions(user_id PK, stripe_customer_id, stripe_subscription_id, plan,
interval, status, current_period_end, cancel_at_period_end, past_due_since,
updated_at)` — migration `supabase/migrations/0003_billing.sql`.
`integrations(user_id, key)` — migration `0004_integrations.sql`.

## Which tests prove it (`tests/security/billing.test.ts`)

- plan resolution fails closed (no row → free; incomplete `max` → free;
  past-due grace then free; canceled until period end then free)
- free user's 26th action → 402 with the `$29` upgrade copy
- free user's 2nd integration → 402; pro unlimited
- CSV export: free → 402, pro → 200
- model routing: free/pro default planner, max+complex → premium planner
- webhook bad signature → 400 and nothing written; valid `payment_failed` →
  `past_due`

## Env vars

| Var | Purpose |
|---|---|
| `STRIPE_SECRET_KEY` | server Stripe client; absent → billing disabled, everyone free |
| `STRIPE_WEBHOOK_SECRET` | webhook signature verification |
| `STRIPE_PRICE_PRO_MONTHLY` / `_ANNUAL` | pro price IDs |
| `STRIPE_PRICE_MAX_MONTHLY` / `_ANNUAL` | max price IDs |
| `NEXT_PUBLIC_APP_URL` | checkout/portal return URLs (defaults to cosignolabs.com) |
| `PLANNER_MODEL_DEFAULT` / `PLANNER_MODEL_PREMIUM` | planner model ids (config only, never hardcoded) |

## Test-mode setup

1. `STRIPE_SECRET_KEY=sk_test_... npx tsx scripts/stripe-setup.ts` — creates
   the products/prices idempotently and prints the `STRIPE_PRICE_*` values.
   Paste them into your env.
2. Configure the **Billing Portal** at
   `https://dashboard.stripe.com/test/settings/billing/portal` (enable plan
   switching, cancellation, and payment-method updates).
3. Forward webhooks locally with the Stripe CLI:
   `stripe listen --forward-to localhost:3000/api/stripe/webhook`
   and copy the printed `whsec_...` into `STRIPE_WEBHOOK_SECRET`.
4. Test cards: `4242 4242 4242 4242` (success),
   `4000 0000 0000 0341` (attaches then fails → payment_failed).

## Go-live checklist

1. Swap to **live** keys (`sk_live_...`, live `whsec_...`), re-run
   `stripe-setup.ts` against live mode, set the live `STRIPE_PRICE_*` env vars.
2. Configure the **live** Billing Portal (same settings as test).
3. Register the production webhook endpoint
   (`https://cosignolabs.com/api/stripe/webhook`) and subscribe to the four
   events above.
4. Set a **Stripe billing spend/volume alert** and, separately, the
   **planner provider spend cap** (see SECURITY.md).
5. Apply migrations `0003` and `0004`; confirm RLS blocks anon writes to
   `subscriptions` and `integrations`.
6. Verify a full test purchase in live mode with a real card, then refund it.
