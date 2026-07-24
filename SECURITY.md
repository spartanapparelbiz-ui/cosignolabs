# cosigno — security posture

Threat model for the beta: an attacker who has the site URL, the public JS
bundle, and the Supabase **anon** key must be able to spend **$0** of our
planner/API money, read **0** rows of other users' data, and execute
**0** unauthorized actions.

Every section below states how the control is enforced and which automated
test proves it. The full suite runs in CI (`.github/workflows/ci.yml`):
build + bundle secret scan, `npm audit --audit-level=critical`, then
`npm test` (acceptance + security suites).

---

## 1. Authentication — fail closed

- **Every `/api/*` route** calls `requireUser()` (`src/lib/api.ts`) before
  doing anything — including read-only routes. No session → 401. Middleware
  (`src/middleware.ts`) enforces the same at the edge with the Supabase session; routes
  re-check it, so a middleware bypass still hits the 401.
- **Public allowlist, nothing else**: `/` (landing), `/pricing`,
  `POST /api/beta` (Turnstile + IP-limited), `GET /api/health`,
  `POST /api/stripe/webhook` (Stripe-signature-verified; unsigned → 400).
- **Demo mode is unreachable in production.** `servingAllowed()`
  (`src/lib/env.ts`) requires Supabase + planner keys when
  `NODE_ENV=production`; otherwise middleware and `requireUser` serve 503.
  Three more layers fail closed independently: `getUserId()` never returns
  the demo user in production, `getStore()` throws rather than serving the
  in-memory store, and `planCommand()` refuses to run the offline mock.
- **Auth webhooks**: no auth webhook route exists in this codebase. If
  one is added, it must verify svix signatures (`svix` package) before
  reading the body — the route-enumeration test will force it through the
  401-or-allowlisted decision automatically.

**Proved by**: `tests/security/auth-routes.test.ts` — enumerates every
`route.ts` under `src/app/api` from the filesystem (new routes are covered
by default), asserts 401 on every non-allowlisted method, and asserts the
production-without-keys behavior (503 from routes and middleware, store
throws, no demo user). *(Spec tests 1 and 12.)*

## 2. Cost protection

- **Rate limits** (`src/lib/ratelimit.ts`): Upstash Redis sliding windows
  (`@upstash/ratelimit`) when `UPSTASH_REDIS_REST_URL/TOKEN` are set —
  required in production so limits hold across serverless instances — with
  an identical in-memory implementation for dev/CI.
  - `/api/command`: **10/min** and **100/day** per user, checked before
    anything else runs.
  - Action transitions (approve/veto/edit): **30/min** per user.
  - Beta applications: **3/hour** per IP.
- **The usage meter counts planning calls.** `runCommand`
  (`src/lib/agent/pipeline.ts`) checks the cycle meter and returns 402
  *before* the model is invoked, and increments the meter for the planning
  call itself, not just executions.
- **`max_tokens` capped** at 1024 on every planner call; command input
  capped at 2,000 chars (413 before the model), external content ≤10 items
  × 8,000 chars, body ≤100 kB.
- **Global circuit breaker**: `enforceGlobalPlanningBudget()` counts total
  daily planning calls across all users (`COSIGNO_GLOBAL_DAILY_PLANS`,
  default 1000). Past it, planning returns a friendly "beta capacity
  reached" 429 — bounding worst-case spend even if per-user limits were
  bypassed.
- **Bundle secret + vendor gate**: `npm run build` runs
  `scripts/check-bundle.mjs`, which fails the build if `sk-ant`,
  `sk_live`, `service_role`, system-prompt text, or any AI vendor/model
  name appears in `.next/static` or any `NEXT_PUBLIC_` value.

**Proved by**: `tests/security/cost.test.ts` (11th command in a minute →
429 with the planner spy untouched; 402 at the usage limit before any
model call; 413 for oversized commands/bodies; circuit breaker stops
planning at the cap; 31st transition → 429) and
`tests/security/bundle.test.ts`. *(Spec tests 5, 6, 9, 11.)*

## 3. Supabase / data isolation

- **RLS enabled on every table, deny-by-default.** After
  `supabase/migrations/0002_hardening.sql`, client roles
  (`anon`/`authenticated`) hold **SELECT-only** grants scoped by
  `user_id = auth_uid()` policies. Every client write policy from the
  initial schema is dropped — actions, sessions, messages, usage,
  tier_settings all write exclusively through server routes with the
  service-role key. Default privileges for future tables grant client
  roles nothing.
- **`beta_applications`**: zero client policies (no SELECT, no INSERT);
  reads and writes are service-role only.
- **Status transitions** are enforced by the `actions_transition_guard`
  trigger and revalidated inside the `transition_action` security-definer
  RPC — both also refuse `approved`/`executing` for injection-flagged rows
  and make `injection_flag` immutable. The RPCs are revoked from client
  roles.
- **Service-role key** is read only in `src/lib/store/supabase.ts` and
  `src/lib/env.ts` (server code); the bundle scan and a source-hygiene
  test keep it out of client output.

**Proved by**: `tests/security/supabase-rest.test.ts` — direct PostgREST
calls with the anon key: cross-user SELECT returns zero rows, INSERT
denied, `status=executed` UPDATE denied, `beta_applications` unreadable.
Runs automatically whenever Supabase env vars are present (point it at a
staging project in CI); plus `tests/security/agent.test.ts` source-hygiene
checks and the bundle scan. *(Spec test 4.)*

## 4. Input validation

- **Zod on every route, all schemas `.strict()`**
  (`src/lib/schemas.ts`): unknown fields are 400s. `status`, `tier`,
  `user_id`, `result`, `injection_flag`, `id`, timestamps → rejected with
  a distinct `privileged_field` error **and logged as an attack signal**.
- UUIDs validated on every `[id]` param; enums validated against the
  category/status enums; beta emails validated.
- **No string interpolation into queries** — all Supabase access goes
  through the query builder / RPCs with bound parameters (verified by the
  absence of raw SQL anywhere in `src/`).
- **JSON body size limit**: 100 kB on all routes via `readJsonBody`
  (checks both `Content-Length` and actual size) → 413.

**Proved by**: `tests/security/validation.test.ts` (`status: "executed"`
patch → 400 with action unchanged; smuggled `tier`/`user_id` → 400;
non-UUID ids → 400; tier-3 settings assignments → 403) and the oversized
body test in `cost.test.ts`. *(Spec test 3.)*

## 5. Agent containment (assume the model is compromised)

- **Capability-scoped executor** (`src/lib/actions/executor.ts`): a frozen,
  hardcoded map of category → handler. Unknown categories are denied and
  logged — no dynamic dispatch, no `eval`, no dynamic imports from model
  data, no shelling out, no fetches to model-supplied URLs. URLs/addresses
  in payloads are card display data; integrations must validate targets
  against their own scoped config (documented at the send_email/webhook
  handlers).
- **Tier clamping is server-side** (`resolveTier` + pipeline): the model's
  requested tier is advisory. A de-escalation attempt is clamped, recorded
  on the card (`tier_note`), and logged (`tier_clamped`).
- **Injection-flagged cards can never execute** — enforced in the engine
  (approve → `injection_blocked` 403), in both store backends' transition
  functions, and in Postgres (trigger + RPC), so approval spam or a buggy
  code path cannot push a flagged card to `executing`. Veto still works.
- **System prompt** (`src/lib/agent/systemPrompt.ts`) is server-only and
  versioned; no route returns it, no client component imports it, and the
  bundle scan greps for its text.

**Proved by**: `tests/security/agent.test.ts` (mock planner requests tier
1 for `payment` → server clamps to 3; flagged card approval → 403 three
times in a row and direct store transitions refused; executor denies
`eval`/`__proto__`/unknown categories; source-hygiene greps). *(Spec test
7 and the §5 clamp test.)*

## 6. Web hygiene

- **Headers on every response** (`next.config.mjs`): CSP with **no
  `unsafe-eval` in production**; `script-src`/`style-src 'unsafe-inline'`
  are the two documented exceptions (required by Next.js App Router
  bootstrap scripts and Next/Tailwind style injection). `'unsafe-eval'` is
  added **only when `NODE_ENV !== 'production'`** (the dev server / Fast
  Refresh needs it) and never ships. Sources are pinned to self,
  Supabase (REST + websocket), and Cloudflare Turnstile.
  `X-Frame-Options: DENY`, `frame-ancestors 'none'`,
  `X-Content-Type-Options: nosniff`,
  `Referrer-Policy: strict-origin-when-cross-origin`, HSTS (2y, preload),
  `Permissions-Policy` denying camera/mic/geolocation, `poweredByHeader`
  off.
- **Turnstile** on the beta form, token verified server-side
  (`/api/beta`); production without a Turnstile secret fails closed (503)
  rather than accepting unverified submissions.
- **No internal errors leak**: unexpected exceptions are logged
  server-side with a request ID; the response body is a generic message +
  that ID (`errorResponse` in `src/lib/api.ts`).
- **Model text renders escaped**: React default escaping everywhere; a
  test asserts `dangerouslySetInnerHTML` appears nowhere in `src/`.
- **CSRF**: Supabase session cookies are SameSite; there are no
  state-changing GET routes (asserted by test).
- **Dependencies**: minimal set, `npm audit --audit-level=critical` gates
  CI, lockfile committed.

**Proved by**: `tests/security/beta.test.ts` (Turnstile required/verified,
fail-closed in prod, 4th-per-hour IP → 429), `agent.test.ts` hygiene
checks, `validation.test.ts` GET-mutation check. *(Spec test 10.)*

## 7. Abuse & observability

- **Structured security log** (`src/lib/log.ts`): single-line JSON for
  `auth_failure`, `rate_limited`, `rejected_privileged_field`,
  `rejected_status_write`, `tier_clamped`, `injection_flagged`,
  `injection_approval_blocked`, `executor_category_denied`,
  `usage_limit_hit`, `global_budget_hit`, `turnstile_failed`,
  `serving_blocked` — the attack signals.
- **Per-user planner token accounting**: every planning call logs
  `planner_usage` with user id + input/output token counts, so a runaway
  user is visible same-day.
- **`GET /api/health`**: public liveness check, returns `{ ok: true }`
  and nothing else.

## 8. Required environment & deploy checklist

| Variable | Purpose | Required in prod |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY` / `SUPABASE_SERVICE_ROLE_KEY` | Data | ✅ (503 without) |
| `PLANNER_API_KEY` | Operator planning | ✅ (503 without) |
| `PLANNER_MODEL_DEFAULT` / `PLANNER_MODEL_PREMIUM` | Planner model ids (config only) | ✅ default; premium for max routing |
| `UPSTASH_REDIS_REST_URL` / `UPSTASH_REDIS_REST_TOKEN` | Cross-instance rate limits | ✅ operationally (in-memory fallback is per-instance) |
| `TURNSTILE_SECRET_KEY` / `NEXT_PUBLIC_TURNSTILE_SITE_KEY` | Beta form bot defense | ✅ (beta submissions 503 without secret) |
| `COSIGNO_GLOBAL_DAILY_PLANS` | Circuit breaker cap | optional (default 1000) |
| `STRIPE_SECRET_KEY` / `STRIPE_WEBHOOK_SECRET` / `STRIPE_PRICE_*` | Billing (absent → everyone free) | for paid plans |

Deploy checklist:

1. **Planner provider console**: set a hard monthly spend cap on the planner API key.
2. **Vercel**: set every required env var above for the Production
   environment; confirm none of the secret values are prefixed
   `NEXT_PUBLIC_` (the build's bundle scan enforces this too).
3. **Supabase**: apply `0001_init.sql` then `0002_hardening.sql`; confirm
   RLS is enabled on all tables (`select * from pg_tables where not
   rowsecurity` should return none of ours) and run the
   `supabase-rest.test.ts` suite against the project.
4. **Upstash**: create the Redis database, wire both env vars.
5. **Turnstile**: create the site, wire site + secret keys.
6. **Supabase Auth**: Site URL set to the production domain; if an auth webhook is ever added,
   verify svix signatures.
7. CI green on the deploy commit (build + bundle scan + audit + tests).
