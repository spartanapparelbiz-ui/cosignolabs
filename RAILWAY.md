# Deploy cosigno to Railway

Railway runs the **Next.js app**. It does **not** provide the database, auth, or
the AI planner — those are separate services you point the app at with
environment variables. This is the same on Vercel, Render, Fly, or anywhere: the
app is only "working" once the three required services below are configured.

`railway.toml` + `nixpacks.toml` in this repo already tell Railway how to build
(`npm run build`) and run (`npm run start`) it, with a `/api/health` healthcheck.

---

## 1. Create the three REQUIRED services (do this first)

Without all three, `/app` intentionally returns a 503 "cosigno is warming up"
(fail-closed — it never silently runs on a broken backend). The public marketing
site and `/demo` work without any of them.

| Service | What it is | Where |
|---|---|---|
| **Supabase** | Postgres database + storage | supabase.com → new project |
| **Clerk** | Sign-in / user accounts | clerk.com → new application |
| **Planner** | The AI that turns tasks into plans | your Anthropic (or compatible) API key |

Then **run the database migrations** against your Supabase project (one time):

```bash
# apply everything in supabase/migrations/*.sql in order
supabase link --project-ref <your-ref>
supabase db push
# or paste each supabase/migrations/NNNN_*.sql into the Supabase SQL editor in order
```

## 2. Set environment variables in Railway

Railway → your service → **Variables**. Paste these (values from the services above):

### Required — `/app` stays a 503 until all are present
```
PLANNER_API_KEY=...
NEXT_PUBLIC_SUPABASE_URL=https://<ref>.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
SUPABASE_SERVICE_ROLE_KEY=...
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_...
CLERK_SECRET_KEY=sk_...
NEXT_PUBLIC_APP_URL=https://<your-railway-domain>
NEXT_PUBLIC_SITE_URL=https://<your-railway-domain>
```

### Optional — the app degrades gracefully without them
```
# Billing (without these, everyone stays on the free plan)
STRIPE_SECRET_KEY=sk_...
STRIPE_WEBHOOK_SECRET=whsec_...
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_...
STRIPE_PRICE_PRO_MONTHLY=price_...   # generate with scripts/stripe-setup.ts

# Real tool connections (Gmail/Slack/etc.); without it, connectors are sandbox-only
INTEGRATIONS_ENCRYPTION_KEY=<32-byte base64>

# Distributed rate limits — see "Rate limiting" below. Set these OR run 1 replica.
UPSTASH_REDIS_REST_URL=...
UPSTASH_REDIS_REST_TOKEN=...

# Trusted proxy hops for spoof-resistant client-IP (default 1 = single edge like
# Railway). Set 2 if you put Cloudflare in front of Railway.
TRUSTED_PROXY_HOPS=1

# Bot protection on the beta form (still server-validated without it)
NEXT_PUBLIC_TURNSTILE_SITE_KEY=...
TURNSTILE_SECRET_KEY=...

# Scheduled ticks (automations/missions) if you wire Railway cron to /api/*/tick
CRON_SECRET=<random>
```

`.env.example` documents every variable the app reads.

## 3. Deploy & verify

1. Connect the repo to Railway and deploy (it auto-builds via `railway.toml`).
2. Check the deps are wired: locally or in a Railway shell,
   ```bash
   npm run check:env      # prints which services are present/absent (names only)
   ```
3. Hit `https://<your-domain>/api/health` → expect `{"ok":true}`.
4. Open `/app` — if it shows "cosigno is warming up", a **required** var above is
   still missing. `check:env` tells you which.

## Rate limiting (can't be bypassed) — read this before scaling

Two rules keep rate limits un-bypassable in production:

1. **Client IP is derived spoof-resistantly.** Limits key off the IP that your
   trusted edge appended, or Cloudflare's `cf-connecting-ip` — never the
   client-claimed leftmost `X-Forwarded-For` (which anyone can forge to rotate
   past IP limits). If you front the app with Cloudflare, set
   `TRUSTED_PROXY_HOPS=2`. Command/planning limits additionally key off the
   authenticated user id (unforgeable) and are backed by a global daily planner
   cap (`DAILY_PLAN_CAP`, default 500) — a hard ceiling even if a per-user limit
   were bypassed.
2. **Limits must be shared across instances.** Without Upstash they live in each
   replica's memory, so **2+ replicas = a client can multiply its limit** by
   spreading requests. Either:
   - set `UPSTASH_REDIS_REST_URL` + `UPSTASH_REDIS_REST_TOKEN` (recommended), **or**
   - pin the service to **a single replica** (Railway → Settings → Replicas = 1).

   `npm run check:env` warns when Upstash is absent.

## 4. Post-launch

- Point your Clerk allowed origins + Stripe webhook URL at the Railway domain.
- Set `NEXT_PUBLIC_APP_URL` / `NEXT_PUBLIC_SITE_URL` to the real domain (used in
  emails, OG tags, redirects).
- Optional public sandbox (let anyone try without an account, no real keys):
  set `COSIGNO_PUBLIC_MODE=1` — each visitor gets an isolated in-memory guest.

---

**TL;DR:** the app is ready; "it doesn't work" means the three required services
(Supabase, Clerk, Planner) aren't connected yet. Railway hosts the app the same
as any platform — you still create those services and paste their keys here.
