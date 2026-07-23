# Cosigno — Security Architecture

How the controls are actually wired, file by file. Companion to
`security-threat-model.md` (what we defend against) and
`security-operations.md` (how we run it).

## 1. Identity and sessions

- **Provider**: Clerk (`@clerk/nextjs`), branded UI driven by headless hooks.
  Only `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` reaches the client; the secret key
  is server-only.
- **Resolution**: `src/lib/auth.ts` → `getUserId()` reads the *verified* Clerk
  session server-side. Demo/guest identities exist only when Clerk is not
  configured, and production without keys fails closed (503) — see
  `src/lib/env.ts` (`servingAllowed`).
- **Gate**: `requireUser()` in `src/lib/api.ts` is called by every protected
  route — middleware (`src/middleware.ts`) is a first filter, never the only
  authorization layer.
- **Cookies**: Clerk session cookies are HttpOnly/Secure/SameSite-Lax
  (managed by Clerk). The sandbox guest cookie is HttpOnly+Secure+Lax.
- **Session management**: `/api/security/sessions` lists the user's active
  Clerk sessions (device, last active) and supports revoking one session or
  signing out everywhere, via Clerk's backend API. Revocations are recorded
  as security events.
- **MFA**: available through Clerk (user-enableable). Cosigno does not
  implement its own factors and never will (rule: no invented auth).
- **Reauthentication for dangerous actions**: destructive flows (account
  deletion, tier-3 actions) require typed confirmations; tier-3 approvals
  cannot be delegated. Account deletion additionally revokes provider tokens
  and deletes the Clerk user.
- **Open redirects**: `safeRedirect()` (`src/components/auth/authRedirect.ts`)
  allows only same-origin path-absolute targets.
- **Enumeration**: authentication errors are surfaced generically
  (`src/components/auth/clerkErrors.ts`); the beta form and sign-up do not
  reveal whether an email exists.

## 2. Authorization and tenant isolation

- Every user-owned table carries `user_id` (Clerk id, `text`). Workspace
  scoping adds `workspace_id` where relevant.
- **Store discipline**: every read/write in `src/lib/store/*` is scoped by
  `userId` in the method signature; no store method trusts a client-supplied
  user id. Route handlers derive identity exclusively from `requireUser()`.
- **RLS**: enabled on all tables. Client roles (`authenticated`, `anon`) are
  SELECT-only, restricted by `user_id = auth_uid()` policies; INSERT/UPDATE/
  DELETE grants are revoked entirely (migration `0002_hardening.sql`), and
  default privileges for future tables grant client roles nothing. This is
  deliberately stricter than per-verb policies: the client cannot write at
  all — every mutation flows through server routes using the service role.
- **Admin-only tables** (`beta_applications`, `oauth_states`,
  `webhook_events`, `security_events` writes) have no client policies at all.
- **State machine in the database**: `valid_action_transition` +
  `actions_transition_guard` trigger + `transition_action(...)` RPC (SECURITY
  DEFINER, service-role-only) make invalid status jumps, double execution and
  approval of injection-flagged cards impossible even for buggy server code.
- **Isolation proof**: `tests/security/isolation.test.ts` runs the two-user
  matrix (read/update/delete/approve/execute/integration/file/receipt access)
  and CI fails if any cross-tenant access succeeds.

## 3. The approval gate (server-enforced)

Implementation: `src/lib/actions/engine.ts` + `src/lib/planHash.ts` +
`src/lib/signRecord.ts` + migrations `0001/0002/0021`.

1. **Canonical plan**: an action's payload is canonicalized (sorted keys,
   stable serialization) and hashed (sha-256) — `planHash()`.
2. **Proposal**: created only server-side (planner pipeline, mission tools,
   or connector runtime). The client can edit `payload`/`summary` of
   *proposed* cards only, through a strict schema.
3. **Expiry**: proposals older than `PROPOSAL_TTL_MS` (7 days) are not
   approvable; the attempt is recorded (`approval_expired`).
4. **Approval**: `approveAction` re-checks — ownership, status=proposed,
   injection flag, hold/emergency stop, rules, room requirements, tier-3
   typed confirmation, usage limits — then writes the authorization record:
   sha-256 over `{user, action, category, tier, method, summary, payload,
   authorized_at}`. For rooms, each approver's approval binds to the current
   plan hash and any payload change voids all prior approvals.
5. **Execution**: `runExecution` re-reads the action, recomputes the payload
   hash and refuses to dispatch if it differs from the hash sealed at
   approval (`plan_hash_mismatch` — recorded, blocked). The transition
   `approved → executing` is atomic (`FOR UPDATE` in `transition_action`), so
   concurrent calls cannot double-execute.
6. **Idempotency**: every external side effect carries an idempotency key
   derived from the action id (`executor.ts` / connector runtime), so a
   retried dispatch cannot double-send.
7. **Receipts**: every execution attempt — success, failure, or refusal —
   writes an immutable row to `receipts` (no update/delete grants + DB
   trigger) carrying the correlation id, plan hash, authorization method,
   integration, operation, result summary, verification, and undo hint.
   Receipts never contain tokens, secrets, or full message bodies.

## 4. Planner and prompt-injection containment

- **Vendor isolation**: only `src/lib/agent/provider.ts` touches the LLM SDK;
  build gates (`scripts/check-vendor.mjs`, `check-bundle.mjs`) fail the build
  if vendor names or key material reach source or the client bundle.
- **Trusted vs untrusted**: system instructions live server-side
  (`systemPrompt.ts`); external content is wrapped and labeled untrusted
  (`untrusted.ts`); tool results and file/link extracts carry
  `injection_flag` when steering is detected, and flagged proposals are
  terminally blocked from approval (engine + DB).
- **Structured output only**: the planner returns JSON validated by strict
  zod schemas; malformed output fails safely (no action, honest error).
  Tier is decided server-side (`tierFor`) — a model-requested lower tier is
  clamped and noted (`tier_clamped` security event).
- **No direct authority**: the planner cannot select `connection_call`
  (integration execution) at all; mission tools come from a server-built
  manifest; model text is never executed as SQL/shell/URL/code.
- **Budgets**: per-mission tool-call caps + budget cents, retry caps, global
  daily planner budget, per-user command windows.
- **Secrets**: credentials are decrypted only inside the connector runtime at
  call time; they are never placed in planner context, never logged, never
  serialized into receipts or events.

## 5. Connections (OAuth / MCP / custom APIs)

- OAuth: server-generated `state` (single-use, expiring, stored in
  `oauth_states` bound to the initiating user), PKCE where supported, exact
  redirect URIs, minimum scopes; tokens are AES-256-GCM-encrypted at rest
  (`integrations/crypto.ts`, key from `INTEGRATIONS_ENCRYPTION_KEY`).
- A callback can never attach a connection to a different user than the one
  who initiated (`consumeOAuthState` returns the bound user id; mismatches
  are rejected and logged).
- Disconnect (`/api/connections/[key]/disconnect`) and account deletion both
  attempt upstream token revocation before removing ciphertext.
- SSRF: all custom/MCP/OpenAPI fetches go through the pinned HTTP client with
  `assertPublicHttpUrl` (see threat model §5.4); blocked attempts emit
  `ssrf_blocked` security events (URLs logged, never credentials).
- Scope display: connection cards render exact granted scopes in plain
  language; permission changes are recorded in `account_audit`.

## 6. Billing (Stripe)

- Checkout sessions and portal sessions are created server-side only, from
  allowlisted env-configured price IDs; client-supplied prices/plans are
  never trusted.
- Webhook (`/api/stripe/webhook`): signature verified with the official
  library on the raw body; **event ids are stored in `webhook_events` and
  duplicates are acknowledged without reprocessing; events older than the
  last-applied event for that subscription cannot overwrite newer state**.
- Entitlements derive only from the webhook-written `subscriptions` row —
  never from success-page query params.

## 7. Emergency Stop and holds

`user_hold` (scope `none | external | all`) is enforced:
- in `approveAction` / `autoExecute` (nothing crosses the boundary),
- in the mission tick engine (`tickMissions` skips held users' missions),
- in the automations tick (held users' recurring runs are skipped and
  recorded),
- Emergency Stop = scope `all`, set/cleared via `/api/hold`, recorded as a
  security event. It is server-state, not a UI switch: scheduled work checks
  it at dispatch time.

## 8. Headers and transport

`next.config.mjs` sends on every response: CSP (no `unsafe-eval` in
production; documented `unsafe-inline` exceptions for Next/Clerk bootstrap),
HSTS (2y, preload), `X-Content-Type-Options: nosniff`, `Referrer-Policy:
strict-origin-when-cross-origin`, `Permissions-Policy` (camera/mic/geo off),
`frame-ancestors 'none'` + `X-Frame-Options: DENY`, `object-src 'none'`,
`base-uri 'self'`, `form-action 'self'`, `Cross-Origin-Opener-Policy:
same-origin`, `Cross-Origin-Resource-Policy: same-origin`. No CORS headers
are emitted anywhere — the API is same-origin only.

## 9. Logging and monitoring

- `src/lib/log.ts`: single-line JSON logs; `logSecurity` for attack signals.
- `src/lib/securityEvents.ts`: durable, user-scoped `security_events` rows
  (sign-ins are Clerk's plane; everything Cosigno-side that matters is here:
  approvals, revocations, rejected executions, holds, OAuth changes,
  rate-limit and SSRF blocks, webhook failures, exports, deletion). Writes
  are fail-safe: a logging failure never blocks or bypasses authorization —
  but is itself surfaced in server logs.
- Correlation ids (`newRequestId`) tie route logs, receipts, and events.
- Alerting hook: `SECURITY_ALERT_WEBHOOK` (optional env) receives high-risk
  event notifications (never secrets); absence disables alerting silently.

## 10. What Cosigno deliberately does not claim

No SOC 2 certification, no "end-to-end encryption", no "unhackable". The
in-product security page and marketing copy describe only controls that exist
in this repository.
