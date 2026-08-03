# Make it actually work

The app deploys, you can sign up, the dashboard loads, the approval layer is
real. But two things were missing that make the difference between "a demo"
and "an operator that runs your business":

1. **Nothing ran in the background.** — fixed in code, needs one env var.
2. **No tool is connected.** — needs OAuth apps you have to create.

This is the whole list. Nothing else is missing.

---

## 1. Background execution — 2 minutes

`/api/missions/tick` and `/api/automations/tick` always existed, but no
scheduler on the deployment ever called them. So missions advanced only while
you personally had the page open, and recurring automations never fired once.

The scheduler now exists: `netlify/functions/scheduled-tick.mts` runs every
minute and drives both. It refuses to run without a shared secret, so set one:

**Netlify → Site configuration → Environment variables → Add a variable**

| Key | Value |
| --- | --- |
| `CRON_SECRET` | any long random string |

Generate one with `openssl rand -hex 32`, or just mash 40+ characters. It is
never shown to a user and never leaves the server — it only proves to the tick
routes that the caller is our own scheduler and not a stranger.

Then **redeploy** (the scheduled function only registers on a new build).

### Confirming it worked

Open **/app/health** while signed in. `background mission execution` flips from
`not configured` to `active`.

In Netlify, **Logs → Functions → cosigno-scheduled-tick** prints one line per
minute:

```
[cosigno] scheduler ran — missions=ok (159ms) automations=ok (63ms)
```

If `CRON_SECRET` is missing it says so plainly instead of failing silently:

```
[cosigno] scheduler skipped — CRON_SECRET is not set — background execution is off.
```

---

## 2. Connect a tool — ~10 minutes for the first one

Right now every connector on **/app/connections** shows *"coming soon"* with a
dead connect button. That is honest — the server genuinely has no credentials
for them — but it means the operator has nothing to act on.

Each connector switches on the moment its two env vars are set. Nothing else
changes; no redeploy of code, just the vars and a rebuild.

**Start with Google.** One OAuth app gives you three connectors — Gmail,
Calendar, and Drive — and covers most of what people actually want.

### Google (Gmail + Calendar + Drive)

1. Go to <https://console.cloud.google.com/apis/credentials>
2. Create a project if you don't have one.
3. **Configure the OAuth consent screen** → External → fill in app name,
   support email, and your domain. Add yourself under **Test users** while it
   is unverified.
4. Enable the APIs you want under **APIs & Services → Library**: *Gmail API*,
   *Google Calendar API*, *Google Drive API*.
5. **Credentials → Create credentials → OAuth client ID → Web application.**
6. Under **Authorized redirect URIs**, add these three *exactly*:

```
https://cosignolabs.com/api/connections/google/callback
https://cosignolabs.com/api/connections/google-calendar/callback
https://cosignolabs.com/api/connections/google-drive/callback
```

7. Copy the client ID and client secret into Netlify:

| Key | Value |
| --- | --- |
| `GOOGLE_CLIENT_ID` | the client ID |
| `GOOGLE_CLIENT_SECRET` | the client secret |

8. Redeploy. **/app/connections** now shows Gmail, Calendar, and Drive as
   connectable.

> While the consent screen is in "Testing", only accounts listed as test users
> can connect. That is fine for you and a few colleagues. Public launch needs
> Google verification, which takes days — do it when you actually need it.

### The others

Same shape. Redirect URI is always
`https://cosignolabs.com/api/connections/<key>/callback`.

| Connector | Where to create the app | Redirect URI key | Env vars |
| --- | --- | --- | --- |
| GitHub | github.com/settings/developers → OAuth Apps | `github` | `GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET` |
| Slack | api.slack.com/apps → OAuth & Permissions | `slack` | `SLACK_CLIENT_ID`, `SLACK_CLIENT_SECRET` |
| Notion | notion.so/my-integrations → public integration | `notion` | `NOTION_CLIENT_ID`, `NOTION_CLIENT_SECRET` |
| Outlook | portal.azure.com → App registrations | `outlook` | `MICROSOFT_CLIENT_ID`, `MICROSOFT_CLIENT_SECRET` |

GitHub is the fastest of these — about three minutes, no review process.

---

## Housekeeping

Two things worth doing while you're in the Netlify env var screen:

- **Delete `CLERK_SECRET_KEY` and `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`.** Auth
  moved to Supabase; these do nothing now, and stale secrets are pure risk.
- **Pin the site to one replica**, unless you set `UPSTASH_REDIS_REST_URL` +
  `UPSTASH_REDIS_REST_TOKEN`. Rate limits live in each instance's memory, so
  with N replicas a caller effectively gets N× the limit.

---

## What the build tells you

`npm run check:env` runs on every Netlify build and prints a table of every
service, whether it is present, and what breaks without it. **Values are never
printed** — names and presence only, so it is safe in a public build log.

If something on this page isn't set, that table says so, in those words, in the
build log. There is no silent failure left.
