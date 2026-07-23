# Cosigno — Incident Response

Procedure for suspected or confirmed security incidents. Keep this document
boring and follow it literally; improvisation during an incident is how data
gets lost.

## 1. Severity classes

| Class | Examples | Target response |
|---|---|---|
| SEV-1 | Credential/key compromise; cross-tenant data access confirmed; unauthorized external action executed on a user's behalf; connection-credential vault exposure | Contain within 1 hour |
| SEV-2 | Vulnerability confirmed but no evidence of exploitation; webhook forgery attempts succeeding; injection bypassing the approval gate in testing | Contain within 24 hours |
| SEV-3 | Suspicious patterns (auth-failure bursts, SSRF probe waves, rate-limit storms); dependency CVE in a used code path | Triage within 72 hours |

## 2. First moves (any SEV)

1. **Start a timeline** (UTC timestamps, who/what/when) — append-only notes.
2. **Do not destroy evidence**: export relevant host logs and the
   `security_events` / `action_events` / `receipts` ranges before changing
   anything.
3. **Engage Emergency Stop where user harm is possible**: per-user Emergency
   Stop is server-enforced (`user_hold` scope `all`); for a platform-wide
   halt, unset `CRON_SECRET` on the deploy platform (stops all scheduled
   ticks) and enable maintenance/503 at the host if execution must stop
   entirely.

## 3. Containment by scenario

### Leaked key or secret
1. Identify the secret from logs/report — never paste its value anywhere.
2. Rotate per the table in `docs/security-operations.md` §2.
3. `INTEGRATIONS_ENCRYPTION_KEY` compromise additionally means stored
   connection credentials must be treated as exposed: force-revoke upstream
   (disconnect all affected connections server-side), then notify (see §5).
4. Search history for the secret (`git log -S`, host logs) to scope exposure.

### Cross-tenant access (IDOR / RLS failure)
1. Reproduce minimally; capture the exact route + parameters.
2. Ship the fix (store scoping + RLS policy) before public disclosure.
3. From `security_events`/host logs, enumerate every affected user and what
   rows were readable/writable.
4. Notify affected users (§5).

### Unauthorized execution (approval gate failure)
This is the worst case for this product.
1. Emergency Stop for affected users; unset `CRON_SECRET` if systemic.
2. Pull the receipts + action_events for the window — receipts carry
   correlation ids, plan hashes, and authorization records; determine whether
   the authorization record was forged, replayed, or bypassed.
3. Undo where the integration supports it (receipts record undo
   availability); otherwise contact the destination service.
4. Fix, add a regression test in `tests/security/`, then post-mortem.

### Prompt-injection incident
1. Preserve the offending content (`mission_sources` / message row).
2. Verify the flag path: was `injection_flag` set? If not, extend the
   heuristics (`untrusted.ts`) with the pattern and add the sample to
   `tests/security/agent.test.ts`.
3. Confirm nothing executed (query receipts by correlation id).

### Stripe/billing incident
1. Verify webhook signature failures in logs (`webhook_verification_failed`).
2. Reconcile `subscriptions` rows against the Stripe dashboard.
3. Roll the webhook secret if forgery is suspected.

## 4. Eradication and recovery

- Fix root cause; add a failing-then-passing test.
- Redeploy; verify `/api/health` and the security suite in CI.
- Restore data only via the documented restore procedure
  (`security-operations.md` §3).
- Lift Emergency Stop / re-enable crons; verify ticks resume.

## 5. Notification

- Users whose data or actions were affected are notified individually with:
  what happened, what was accessed/executed, what we did, what they should do
  (reconnect apps, review receipts, rotate their own downstream credentials).
- Regulatory clocks (e.g. GDPR 72h) start at confirmation — involve counsel
  for anything touching EU/UK users.
- Security contact for inbound reports: `security@cosignolabs.com`
  (also in `/.well-known/security.txt`).

## 6. Post-mortem

Within 5 working days: timeline, impact, root cause, what detected it (or
why nothing did), corrective actions with owners and dates. Store alongside
this document. Every SEV-1/2 post-mortem must add at least one automated
regression test.
