# Deploying cosigno on Netlify

This guide is written for a non-technical founder. Follow it top to bottom.
You do **not** need to touch code. Every step is a click in the Netlify
dashboard or one command you copy-paste.

The site is designed to **never show a raw error**. With no keys at all, the
marketing site (home, pricing, the live demo) works; only the logged-in app
shows a calm "warming up" page until you add keys. So you can deploy first and
add keys after.

---

## The 10-minute happy path

1. **Connect the repo** (once)
   - Netlify → **Add new site → Import an existing project** → pick this
     GitHub repo → branch `main` (or your release branch).
   - Netlify auto-detects Next.js. Leave the build command and publish
     directory as detected — `netlify.toml` in this repo already sets them
     (`npm run check:env && npm run build`, publish `.next`) and enables the
     **Next.js runtime plugin**, which is what makes the app actually run.

2. **Deploy once with no keys** to confirm the marketing site works.
   - Netlify → **Deploys → Trigger deploy → Deploy site**.
   - When it finishes, open your Netlify URL. You should see the landing page.
   - The build log will print a **table of every service** and which keys are
     missing (values are never shown). That's your shopping list.

3. **Add your environment variables**
   - Netlify → **Site configuration → Environment variables → Add a variable**
     (use **Add a single variable**, or **Import from a .env file** and paste).
   - Copy the names from [`.env.example`](./.env.example). Add the ones for the
     services you want on (see the table below). Names must match **exactly**.
   - Click **Save**.

4. **Redeploy** so the new keys take effect
   - Netlify → **Deploys → Trigger deploy → Clear cache and deploy site**.

5. **Prove it works**
   - On your computer, run:
     ```
     npm run verify:deploy -- https://cosignolabs.com
     ```
   - It prints `PASS` / `FAIL` for each check and, on any failure, the most
     likely fix. All `PASS` (or `SKIP`) means you're live.

---

## Which keys turn on what

Run `npm run check:env` any time to see this as a live table. Nothing here is
all-or-nothing — each service degrades on its own:

| Service | Variables | Without it |
| --- | --- | --- |
| **Planner** (the AI) | `PLANNER_API_KEY` (+ `PLANNER_MODEL_DEFAULT`, `PLANNER_MODEL_PREMIUM`) | the app (`/app`) shows the "warming up" page |
| **Supabase** (database) | `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` | the app shows the "warming up" page |
| **Clerk** (sign-in) | `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`, `CLERK_SECRET_KEY` | the app shows the "warming up" page |
| **Upstash** (rate limits) | `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN` | still works; falls back to in-memory limits |
| **Turnstile** (captcha) | `NEXT_PUBLIC_TURNSTILE_SITE_KEY`, `TURNSTILE_SECRET_KEY` | beta form works without a captcha |
| **Stripe** (billing) | `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`, the four `STRIPE_PRICE_*` | billing/checkout is off; everyone is on free |

**To make the whole app work, you need Planner + Supabase + Clerk.** Stripe is
only for taking payments. The marketing site needs **nothing**.

Each variable in `.env.example` has a one-line comment saying what breaks
without it and where to get it.

### After Stripe keys are set

- Create the price IDs once: `npx tsx scripts/stripe-setup.ts` (prints the four
  `STRIPE_PRICE_*` values to paste into Netlify).
- Add a Stripe **webhook** pointing to `https://<your-domain>/api/stripe/webhook`
  and put its signing secret in `STRIPE_WEBHOOK_SECRET`. The webhook is the only
  thing that grants a paid plan — a checkout on its own never does.

---

## Reading the build log

Netlify → **Deploys → click the latest deploy → Deploy log**. You're looking
for two things:

- Near the top: the `[cosigno] environment check` table (from `check:env`) —
  which keys are present.
- Near the end: `Bundle secret scan passed` and `Vendor-name gate passed`, then
  `Site is live`. If you see those, the build worked.

When the app runs, the **Functions log** (Netlify → **Logs → Functions**)
prints one line per missing service, e.g.
`[cosigno] STRIPE keys absent — billing/checkout disabled`. That tells you
exactly what to add.

---

## Custom domain (cosignolabs.com)

1. Netlify → **Domain management → Add a domain** → `cosignolabs.com`.
2. Point your DNS as Netlify instructs (either use Netlify DNS, or add the
   `A`/`CNAME` records at your registrar).
3. Set the **apex** (`cosignolabs.com`) as the **primary domain** so
   `www.cosignolabs.com` redirects to it automatically.
4. Wait for **HTTPS** to say "Netlify certificate" (a few minutes after DNS
   resolves). Then `verify:deploy` against `https://cosignolabs.com` should be
   all green.

---

## Troubleshooting

| Symptom | Most likely cause | Fix |
| --- | --- | --- |
| **Error on all routes** (even the homepage) | The Next.js runtime plugin didn't run, or you deployed an old commit. | Confirm `netlify.toml` is in the repo (it is), then **Clear cache and deploy site**. The build log should mention `@netlify/plugin-nextjs`. |
| **404 on `/app` routes** but homepage works | Same runtime-plugin issue, or the build was published as static files. | Re-deploy with cache cleared. Ensure publish dir is `.next` (set by `netlify.toml`), not `out`. |
| **`/app` shows "cosigno is warming up"** | This is expected with missing keys — it's **not** an error. | Add Planner + Supabase + Clerk keys (table above) and redeploy. |
| **SSL warning / "not secure"** | The certificate hasn't issued yet. | Netlify → Domain management → wait for "Netlify certificate"; make sure DNS resolves first. |
| **DNS pending** | Records not propagated. | Give it up to an hour; verify the `A`/`CNAME` records match Netlify's instructions exactly. |
| **Build failed** | A missing dependency or a Node version mismatch. | Check the deploy log for the first red line. Node is pinned to 20 (`.nvmrc` + `netlify.toml`); if the log shows a different version, set `NODE_VERSION=20` in environment variables. |
| **Billing button does nothing / checkout errors** | Stripe keys or price IDs missing. | Run `check:env`; add `STRIPE_*` + `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` + the four price IDs; redeploy. |

---

## The two commands to remember

```
npm run check:env                                 # what keys am I missing?
npm run verify:deploy -- https://cosignolabs.com  # is the live site healthy?
```

`check:env` runs automatically on every Netlify build (its table is in the
build log). `verify:deploy` you run yourself after a deploy — it hits the real
URL and tells you, in plain English, exactly what (if anything) is wrong.
