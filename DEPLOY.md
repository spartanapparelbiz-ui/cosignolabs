# Deploying cosigno on Netlify

Written for a non-technical founder. You do **not** need to touch code — every
step is a click in the Netlify dashboard or one command you copy-paste.

**The important promise:** the site is built to **never show a raw error**.
With zero keys, the marketing site (home, pricing, the live demo) works; only
the logged-in app (`/app`) shows a calm "cosigno is warming up" page until you
add keys. So a keyless deploy should still show a working homepage. If your
homepage itself is erroring, it's a **deploy problem**, not a keys problem —
start with the section right below.

---

## Two ways to make the app work for everyone

You can pick either one now, and switch later — no code changes.

### Option A — Public sandbox (fastest; anyone can try it, no sign-in)

Set **one** environment variable and redeploy:

| Variable | Value |
| --- | --- |
| `COSIGNO_PUBLIC_MODE` | `1` |

That's it. `/app` opens for **everyone** with no login. Each visitor gets their
own private, temporary workspace and can type a request, add files and links,
and run a full mission through the offline planner. It is **safe by design**:

- no sign-in, no database — each visitor is isolated by a random guest id;
- the planner runs **offline** (no AI key, no cost) and invents nothing;
- connectors are **sandbox-only** — no real emails, files, calendars, or
  payments are ever touched, and consequential steps still ask for approval;
- nothing is saved — it's a try-it space, clearly labelled with a banner.

Turn this off (delete the variable) whenever you want, or just add the real
keys below — **the real product automatically takes over** the moment the full
key set is present, and `COSIGNO_PUBLIC_MODE` is ignored.

### Option B — The real product (saved accounts, real AI, connected apps)

Add the full key set (next sections) and run the database migrations. This
gives real sign-in, saved data, real AI planning, and real connected apps.
You can do this **in addition to** Option A: keep the sandbox live today, then
flip to the real product the moment your keys are in.

To finish Option B you need, in Netlify **Site configuration → Environment
variables**: `PLANNER_API_KEY`, the three `…SUPABASE…` keys, and the two
keys (Stripe + connector OAuth are optional). Then run every SQL file
in `supabase/migrations/` (through `0014_mission_sources.sql`) in the Supabase
SQL editor, and point your scheduler at `/api/missions/tick` and
`/api/automations/tick`. The per-service table further down explains each one.

---

## "The site looks old" — why new work sometimes isn't showing

Netlify deploys **one branch**: `claude/cosigno-master-build-xhwvgf`. Every
working session pushes its changes to its **own** branch first, and that work
reaches the live site only when its pull request is **merged** into the branch
above. So a stream of new commits on GitHub with an unchanged site usually
means nothing is broken — the merges just haven't happened. **Check the open
pull requests first**; merging them is what deploys them.

Three ways to see exactly what's live, without guessing:

1. **`https://cosignolabs.com/api/health`** — shows the short commit id and
   build time of the running site (`{"ok":true,"commit":"…","built_at":"…"}`).
   Compare the commit with the top of the branch on GitHub. (An older deploy
   from before this telemetry shows only `{"ok":true}` — that by itself means
   the site predates it.)
2. **GitHub → Actions → "Probe production" → Run workflow** — prints which
   version of the home page is live and the build info above, from neutral
   ground.
3. **"Verify live site"** now **fails on purpose** when the live commit is not
   the one that was just pushed, and says so in plain words. (It used to go
   red over one slow cold-start response or a network hiccup on GitHub's side
   while the site itself was fine — both false alarms are fixed, so a red run
   is worth reading now.)

---

## "Every page is showing an error" — fix it in 4 checks

Do these in order. Stop as soon as one fixes it.

### Check 1 — Is Netlify building the right branch?

This is the most common cause. The fixes live on a branch, and Netlify only
deploys **one** branch (the "production branch").

- Go to **Netlify → Site configuration → Build & deploy → Continuous
  deployment → Branches and deploy contexts**.
- Look at **Production branch**. It must be set to the branch that has the
  latest code (for example `main`, or `claude/cosigno-master-build-xhwvgf` if
  that's where the newest work is).
- If it's pointing at an old branch, change it, click **Save**, then go to
  **Deploys → Trigger deploy → Clear cache and deploy site**.

> How to know which branch is newest: on GitHub, open the repo and look at
> which branch has the most recent commits. That's the one Netlify should
> deploy. If in doubt, merge the newest branch into `main` and set the
> production branch to `main`.

### Check 2 — Did the build actually succeed?

- Go to **Netlify → Deploys**. Look at the most recent deploy.
- Green **"Published"** = the build worked. Red **"Failed"** = it didn't, and
  Netlify is still serving the old (broken) version.
- If it failed, click into it, read the **Deploy log**, and find the **first
  red line**. The two classic causes and their fixes are in Check 3 and Check 4.

### Check 3 — Is `NODE_ENV` set to `production` in your Netlify variables?

If it is, Netlify skips the tools needed to build the site, and **the whole
build fails**. (This repo is now arranged so it survives that, but older
deploys did not — so remove it to be safe.)

- Go to **Site configuration → Environment variables**.
- If you see a variable named **`NODE_ENV`**, **delete it**. Netlify sets the
  right value on its own; you should not set it yourself.
- Redeploy: **Deploys → Trigger deploy → Clear cache and deploy site**.

### Check 4 — Is the Next.js runtime plugin running?

The plugin (`@netlify/plugin-nextjs`) is what makes the app actually run on
Netlify. Without it every page errors. It's declared in this repo's
`netlify.toml`, so it should run automatically.

- In the **Deploy log** (Check 2), search for `@netlify/plugin-nextjs`. You
  should see it load. If you don't, do **Clear cache and deploy site** once —
  a stale cache can skip it.
- Also confirm **Publish directory** is `.next` (not `out`). It's set by
  `netlify.toml`, so you normally don't touch it.

After any of these, run the health check from your computer:

```
npm run verify:deploy -- https://cosignolabs.com
```

It prints `PASS` / `FAIL` for every check, and on a failure it prints the most
likely fix right underneath.

---

## First-time setup (the 10-minute happy path)

1. **Connect the repo** (once)
   - Netlify → **Add new site → Import an existing project** → pick this GitHub
     repo.
   - For **Branch to deploy**, choose the branch with the newest code (see
     Check 1). Netlify auto-detects Next.js — leave the build command and
     publish directory as detected; `netlify.toml` in this repo already sets
     them and turns on the Next.js runtime plugin.

2. **Deploy once with no keys** to confirm the marketing site works.
   - Netlify → **Deploys → Trigger deploy → Deploy site**.
   - When it finishes, open your Netlify URL — you should see the landing page.
   - The build log prints a **table of every service** and which keys are
     missing (values are never shown). That's your shopping list.

3. **Add your environment variables**
   - Netlify → **Site configuration → Environment variables → Add a variable**
     (use **Add a single variable**, or **Import from a .env file** and paste).
   - Copy the **names** from [`.env.example`](./.env.example). Names must match
     **exactly**. Do **not** add a `NODE_ENV` variable.
   - Click **Save**.

4. **Redeploy** so the keys take effect
   - Netlify → **Deploys → Trigger deploy → Clear cache and deploy site**.

5. **Prove it works**
   - `npm run verify:deploy -- https://cosignolabs.com` → all `PASS`/`SKIP`.

---

## Which keys turn on what

Run `npm run check:env` any time to see this as a live table. Nothing is
all-or-nothing — each service degrades on its own:

| Service | Variables | Without it |
| --- | --- | --- |
| **Planner** (the AI) | `PLANNER_API_KEY` (+ `PLANNER_MODEL_DEFAULT`, `PLANNER_MODEL_PREMIUM`) | the app (`/app`) shows "warming up" |
| **Supabase** (database) | `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` | the app shows "warming up" |
| **Upstash** (rate limits) | `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN` | still works; in-memory limits |
| **Turnstile** (captcha) | `NEXT_PUBLIC_TURNSTILE_SITE_KEY`, `TURNSTILE_SECRET_KEY` | beta form works without a captcha |
| **Stripe** (billing) | `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`, the four `STRIPE_PRICE_*` | billing off; everyone on free |

**To make the whole app work, you need Planner + Supabase.** Sign-in is part of Supabase — no separate auth service. Stripe is
only for taking payments. The marketing site needs **nothing**.

Each variable in `.env.example` has a one-line comment saying what breaks
without it and where to get it.

### After Stripe keys are set

- Create the price IDs once: `npx tsx scripts/stripe-setup.ts` (prints the four
  `STRIPE_PRICE_*` values to paste into Netlify).
- Add a Stripe **webhook** pointing to
  `https://<your-domain>/api/stripe/webhook` and put its signing secret in
  `STRIPE_WEBHOOK_SECRET`. The webhook is the only thing that grants a paid
  plan — a checkout on its own never does.

---

## Reading the build log

Netlify → **Deploys → click the latest deploy → Deploy log**. You want:

- Near the top: the `[cosigno] environment check` table (which keys are present).
- Near the end: `Bundle secret scan passed` and `Vendor-name gate passed`, then
  `Site is live`. If you see those, the build worked.

When the app runs, the **Functions log** (Netlify → **Logs → Functions**)
prints one line per missing service, e.g.
`[cosigno] STRIPE keys absent — billing/checkout disabled`.

---

## Custom domain (cosignolabs.com)

1. Netlify → **Domain management → Add a domain** → `cosignolabs.com`.
2. Point your DNS as Netlify instructs (Netlify DNS, or `A`/`CNAME` records at
   your registrar).
3. Set the **apex** (`cosignolabs.com`) as the **primary domain** so
   `www.cosignolabs.com` redirects to it.
4. Wait for **HTTPS** to say "Netlify certificate" (a few minutes after DNS
   resolves). Then `verify:deploy` against `https://cosignolabs.com` should be
   all green.

---

## Troubleshooting

| Symptom | Most likely cause | Fix |
| --- | --- | --- |
| **Error on every page** (even the homepage) | Netlify is deploying the wrong/old branch, or the build failed. | Do Checks 1–4 at the top of this file, in order. |
| **Build failed in the log** | Build tooling wasn't installed — usually a `NODE_ENV=production` variable set in Netlify. | Delete the `NODE_ENV` variable (Check 3), then Clear cache and deploy. |
| **404 on `/app` routes** but homepage works | Runtime plugin didn't engage, or it published static files. | Clear cache and deploy. Publish dir must be `.next`, not `out` (set by `netlify.toml`). |
| **`/app` shows "cosigno is warming up"** | Expected with missing keys — **not** an error. | Add Planner + Supabase keys and redeploy. |
| **SSL warning / "not secure"** | Certificate hasn't issued yet. | Domain management → wait for "Netlify certificate"; make sure DNS resolves first. |
| **Billing button does nothing** | Stripe keys or price IDs missing. | Run `check:env`; add the `STRIPE_*` keys + four price IDs; redeploy. |

---

## The two commands to remember

```
npm run check:env                                 # what keys am I missing?
npm run verify:deploy -- https://cosignolabs.com  # is the live site healthy?
```

`check:env` runs automatically on every Netlify build (its table is in the
build log). `verify:deploy` you run yourself after a deploy — it hits the real
URL and tells you, in plain English, exactly what (if anything) is wrong.
