# Scale Readiness — launch-day check

Lightweight verification for a launch-day spike (hundreds → low-thousands of
visitors, a burst of signups). This is **not** a scale re-architecture. It
confirms what's already safe, fixes real gaps, and deliberately defers work
the current stage doesn't need.

## 1. Money protection — ALL ACTIVE

The real scale risk is runaway AI spend, not page load. Verified live in the
request path (`src/app/api/command/route.ts` → `pipeline.ts` → `provider.ts`):

| Guard | Where | Value | Status |
|---|---|---|---|
| Auth before any spend | `requireUser()` first in the route | 401 before the model call; unauth = zero spend | ✅ |
| Per-user rate limit (burst) | `enforceLimit("commandMinute")` | **10 / minute / user** | ✅ |
| Per-user rate limit (daily) | `enforceLimit("commandDay")` | **100 / day / user** | ✅ |
| Free-tier action cap | `pipeline.ts` usage gate | **25 actions / month** (fail-closed to free) | ✅ |
| Global daily circuit breaker | `enforceGlobalPlanningBudget()` | **`DAILY_PLAN_CAP`, default 500 / day** across ALL users → "beta capacity reached today" | ✅ |
| Output token cap | `operator.ts` `MAX_TOKENS` | **1024 tokens / call** | ✅ |
| Oversized input rejected | route + `MAX_COMMAND_LENGTH` | **2000 chars → 413** before validation | ✅ |
| Approve/veto burst limit | `enforceLimit("transitionMinute")` | 30 / minute / user | ✅ |

All gates run **before** the model is touched. The order in the command route
is: auth → per-user minute/day → oversized check → global cap → plan.

## 2. Database under concurrent load — OK, no changes needed

Indexes cover every hot path (`0001_init.sql`, `0003`–`0007`):

- `actions (user_id, status)` and `actions (user_id, created_at desc)` — workspace + activity
- `action_events (user_id, created_at desc)` — audit/security feed
- `sessions (user_id, created_at desc)`, `messages (session_id, created_at)`
- `subscriptions.user_id` **PK** (+ `stripe_customer_id` idx for webhooks)
- `usage (user_id, cycle_start)` **PK**, `tier_settings (user_id, category)` **PK**
- `integrations (user_id, key)` **PK**, `connections (user_id, created_at desc)`, `mcp_tools (user_id)`

Every user-scoped lookup lands on an index or a PK prefix. **No missing
indexes.** List queries are bounded (actions default 500, activity 1000), RLS
predicates are simple `user_id = auth_uid()` equality (index-friendly, not
per-row function scans), and the main loads are single queries — no N+1.
Serverless uses Supabase's pooled REST endpoint (stateless HTTP, no
per-request socket pool).

## 3. Serverless/runtime — FIXED (timeouts)

- **Planner call timeout — FIXED.** The provider SDK's default is a **10-minute**
  timeout with 2 retries — catastrophic on Netlify (functions pile up, then the
  platform kills them with a raw 502). Now bounded to **20s / call, 1 retry**
  (`PLANNER_TIMEOUT_MS`, `provider.ts`). On timeout the SDK throws → caught →
  user sees calm "temporarily unavailable, try again" copy.
- **Turnstile verify timeout — FIXED.** The beta captcha `fetch` now has an
  **8s** `AbortSignal.timeout`; a slow/unreachable Cloudflare fails closed as a
  retryable captcha error instead of hanging the function.
- **Graceful degradation — verified.** Provider 429 → "handling a lot of
  requests, wait a moment"; 5xx → "briefly unavailable"; global cap → "beta
  capacity reached today." Never a raw error or stack trace to the browser.
- **Statelessness — verified,** with one accepted fallback (below).

## 4. Signup / auth spike — OK

- Auth is Supabase-hosted; sign-in/sign-up burst load is on Supabase, no custom
  bottleneck on our side.
- The only unauthenticated write (founding-beta form) is guarded by
  **Turnstile bot-check (fail-closed in prod) + 3/hour/IP** rate limit, so a
  spike or attack can't flood the DB or spend.

## 5. Observability — IN PLACE

Structured JSON logs (one line per event) already capture launch-day signals:

- `planner_usage` — **per-user input/output tokens per call** (runaway user visible same-day)
- `rate_limited` — which limit, which key
- `global_budget_hit` — day, count, cap (the spend ceiling firing)
- `usage_limit_hit` — free-tier / CSV gate hits
- `tier_clamped` — agent tried to self-escalate
- `auth_failure`, `turnstile_failed`, `planner_call_failed` (full status server-side)

**"How many AI calls / how much spend today?"** — the global circuit-breaker
counter (`cosigno:global:plans:<day>` in Redis when Upstash is configured) is
the live count against the cap; a log query on `planner_usage` gives volume +
token totals. No separate admin dashboard was built (out of scope — no new
pages).

## What was actually fixed in this pass

1. `provider.ts` — planner call bounded to 20s / 1 retry (was 10-min default).
2. `api/beta/route.ts` — Turnstile verify bounded to 8s, fails closed.

Nothing else needed changing — money gates, indexes, pagination bounds, and
observability were already in place from prior safety passes.

## Do NOT build yet (defer until real traffic proves the need)

- **Caching layer / Redis response cache** — planner calls are per-command and
  personal; nothing to cache. No.
- **Job queue / background workers** — the loop is synchronous request→plan→card
  and fits the function budget. No.
- **Read replicas / connection-pool tuning** — Supabase pooled REST handles
  launch scale; revisit only if DB CPU climbs under real load.
- **Microservices / splitting the planner out** — single deployable is correct
  at this stage.
- **Cursor pagination on activity** — current bounds (500/1000) are far above
  any beta user's volume (25 actions/mo free cap). Add cursors only when a real
  user approaches the bound.

## 2 dashboard steps for you (meaningful resilience wins)

1. **Configure Upstash Redis** (`UPSTASH_REDIS_REST_URL` + `_TOKEN`) in Netlify.
   Without it, rate limits and the global daily cap fall back to **per-instance
   memory** — correct on a single function instance, but under multi-instance
   scale each instance keeps its own counter, so effective limits multiply by
   the instance count. Upstash makes them globally correct. *(This is the one
   accepted in-memory fallback noted in §3.)*
2. **Set a hard monthly spend cap at the model provider** (provider dashboard
   billing limit). `DAILY_PLAN_CAP` is our app-level daily breaker; a
   provider-side monthly cap is the backstop if anything slips past it. You can
   also lower `DAILY_PLAN_CAP` (env var) for a smaller first cohort.
