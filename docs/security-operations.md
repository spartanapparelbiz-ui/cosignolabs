# Cosigno — Security Operations

Runbook for operating Cosigno securely: environments, keys, backups,
dependency hygiene, and what still needs an outside professional.

## 1. Environments

- **Development**: no keys required — demo mode (in-memory store, offline
  planner) is compiled in but unreachable in production (`servingAllowed()`
  fails closed; middleware serves 503 when production keys are missing).
- **Production**: Netlify + Supabase + Clerk + Stripe + Upstash. Required env
  is listed in `.env.example`; `npm run check:env` verifies presence without
  printing values. Keep development and production in separate Supabase
  projects, Clerk instances, and Stripe accounts — never share keys across
  environments.
- **Public sandbox** (`COSIGNO_PUBLIC_MODE=1`): explicit opt-in only;
  in-memory, per-visitor guest isolation, offline planner, no real
  credentials or actions. Ignored the moment real keys exist.

## 2. Secrets and key rotation

Never commit, print, or log secret values. All rotation happens in the
provider dashboard + the deploy platform's env settings.

| Secret | Rotation procedure (no values shown) |
|---|---|
| `CLERK_SECRET_KEY` | Clerk dashboard → API keys → regenerate; update env; redeploy. Sessions survive (signing lives with Clerk). |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase dashboard → project settings → API → rotate service role; update env; redeploy. |
| `PLANNER_API_KEY` | LLM provider console → create new key → update env → redeploy → revoke old key. |
| `STRIPE_SECRET_KEY` / `STRIPE_WEBHOOK_SECRET` | Stripe dashboard → roll key / roll webhook signing secret; update env; redeploy; confirm webhook deliveries succeed. |
| `INTEGRATIONS_ENCRYPTION_KEY` | **Special**: this key encrypts stored connection credentials. Rotating it invalidates existing ciphertext. Procedure: schedule a window → deploy with new key → users reconnect their apps (status shows `error`, reconnection is safe and audited). A live re-encryption tool is deliberately not shipped; do not improvise one in production. |
| `CRON_SECRET` | Generate a new long random value; update the external cron caller and env together. |
| `UPSTASH_*` | Rotate in Upstash console; update env; redeploy. |
| OAuth client secrets (Google/GitHub/…) | Rotate in the provider console; update env; existing user tokens keep working. |

## 3. Backups and restore

- Supabase automated backups (daily on paid tiers) are the database backup
  plane. Verify they are enabled for the production project.
- **Restore procedure**: restore into a *new* Supabase project from the
  chosen point-in-time → run any migrations newer than the snapshot →
  repoint `NEXT_PUBLIC_SUPABASE_URL` / keys via env → redeploy → verify
  `/api/health` and a read of `/app/receipts`. Never restore over the live
  project while it serves traffic.
- Receipts and `action_events` are the integrity spine — treat any restore
  that loses them as a reportable incident (see incident response).

## 4. Data retention and deletion

- Minimum collection: Cosigno stores what the product shows (missions,
  actions, events, receipts, connections metadata, memories) — no shadow
  analytics of message content; the `/api/track` beacon is anonymous and
  allowlist-validated.
- Deletion: account deletion cancels the Stripe subscription, revokes
  connected-app tokens upstream (best-effort, recorded), cascade-deletes all
  user rows, then deletes the Clerk user. Verified by
  `tests/security/account-delete.test.ts`.
- Export: `/api/account/export` returns the user's data as JSON (excluding
  encrypted credentials, which are never exportable).
- Retention: operational logs follow the host's retention; `security_events`
  and `receipts` are kept with the account until deletion. If regulation
  requires shorter windows, prune via SQL with a migration — never ad hoc.

## 5. Dependency and CI hygiene

- Lockfile (`package-lock.json`) is committed; CI installs with `npm ci`.
- CI gates (`.github/workflows/ci.yml`): typecheck, unit + security tests
  (including the two-user isolation matrix — the build fails when isolation
  fails), production build with bundle secret scan + vendor scan, `npm audit`
  (fails on high+), source secret scan (`scripts/check-source-secrets.mjs`),
  migration validation (`scripts/check-migrations.mjs`).
- Only official, maintained GitHub actions are used (`actions/checkout`,
  `actions/setup-node`), referenced by major version; no third-party actions.
  If a third-party action is ever added, pin it to a full commit SHA.
- Dependency updates: renovate/dependabot or manual `npm outdated` review at
  least monthly; never auto-upgrade across majors without running the full
  suite. CI blocks merges on any **critical** advisory; high/moderate are
  reported non-blocking (see the tracked list below).

### Tracked advisories with no upstream fix (as of this writing)

`npm audit` reports high-severity advisories against **Next.js** (range
`9.3.4 – 16.3.0-preview`, i.e. every published version including previews) and
its transitive **sharp** (`<0.35.0`, pinned by Next). `npm audit fix --force`
confirms *no fixed version is available* — bumping further does not resolve
them and would only introduce breaking changes. We run the latest patch
(`next@15.5.21`). In-app mitigations for the specific Next.js advisories:

- **SSRF in Server Actions / rewrites**: Cosigno performs no outbound fetch
  through Server Actions or rewrites; every outbound request goes through the
  SSRF-guarded HTTP client (`integrations/net/ssrf.ts`), and we run on
  Netlify's serverless runtime, not a custom server.
- **Image Optimization DoS via SVG**: CSP restricts `img-src` to `self`,
  `data:`, and `img.clerk.com`; no user-supplied remote images are optimized.
- **Cache confusion / unbounded Server Action payload**: request bodies are
  capped at 100 kB and parsed strictly; App Router responses for authenticated
  routes are `dynamic = "force-dynamic"` (uncached).
- **Unauthenticated disclosure of internal Server Function endpoints**: all
  `/api/*` routes re-authenticate via `requireUser()` (defense in depth beyond
  middleware), so endpoint discovery yields 401/503, not data.

Re-evaluate and upgrade the moment Next.js publishes a fixed release; then
flip the CI audit gate back to `--audit-level=high`.

## 6. Monitoring

- All security-relevant server logs are single-line JSON (`level:
  "security"`); point the host's log drain at your SIEM and alert on:
  `auth_failure` bursts, `rate_limited` bursts, `rejected_privileged_field`,
  `ssrf_blocked`, `webhook_verification_failed`, `plan_hash_mismatch`,
  `injection_approval_blocked`, `emergency_stop_*`.
- Durable, user-facing events live in `security_events` and render in the
  in-app Security Center.
- Optional push alerting: set `SECURITY_ALERT_WEBHOOK` to an internal HTTPS
  endpoint; high-risk events POST a minimal JSON summary (never secrets,
  never message content). Leave unset to disable.

## 7. Responsible disclosure

- `/.well-known/security.txt` is served with the security contact
  (`security@cosignolabs.com`) and policy pointer.
- Acknowledge reports within 72 hours; do not threaten good-faith research;
  never request proof that requires accessing other users' data.

## 8. Items requiring an independent professional penetration test

This repository's tests prove the controls we wrote. An outside engagement
should specifically cover:

1. Clerk integration edge cases (session fixation, org/instance
   misconfiguration, MFA downgrade).
2. Supabase RLS under the *anon* key against the live schema (automated
   tests here run against the store contract; a live-project probe is the
   real proof).
3. SSRF bypasses (DNS rebinding, IPv6 literal edge cases, redirect chains)
   against deployed infrastructure.
4. OAuth flows against real providers (state fixation, token substitution,
   consent-screen scope escalation).
5. Prompt-injection red teaming with live models — heuristics here are
   deterministic and will not catch every adversarial phrasing.
6. Stripe webhook forgery and race conditions against the live endpoint.
7. Denial-of-service posture (rate limits are per-instance + Upstash; a paid
   stress test should validate the budget math).
8. Netlify/platform header behavior and cache poisoning.
