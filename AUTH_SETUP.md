# Supabase Authentication Setup

Everything you must configure in the Supabase dashboard for sign-up, sign-in,
email confirmation, and password reset to work on cosigno. Follow it top to
bottom on a fresh project and auth will work on the first attempt.

Auth in this app is **Supabase Auth driven headlessly** — Supabase is the
engine, every screen is ours. That means the dashboard settings and the app's
routes form a contract. Break either half and the failure is usually silent:
no error in the build log, no error in the browser console, just a user who
clicks a confirmation link and lands somewhere wrong.

> **The single most common mistake:** setting **Site URL** to `cosignolabs.com`
> instead of `https://cosignolabs.com`. Read
> [`requested path is invalid`](#requested-path-is-invalid) before you do
> anything else.

**Related:** [`DEPLOY.md`](./DEPLOY.md) (hosting + environment variables) ·
[`MAKE_IT_WORK.md`](./MAKE_IT_WORK.md) (connecting third-party apps) ·
[`.env.example`](./.env.example) (every variable name)

---

## Contents

1. [Before you start](#1-before-you-start)
2. [Authentication → URL Configuration](#2-authentication--url-configuration)
3. [Email templates](#3-email-templates)
4. [OAuth callback URLs](#4-oauth-callback-urls)
5. [Environment variables](#5-environment-variables)
6. [Common failure modes](#6-common-failure-modes)
7. [Deployment checklist](#7-deployment-checklist)
8. [Clean-project walkthrough](#8-clean-project-walkthrough)

---

## 1. Before you start

You need:

- A Supabase project. Its **reference id** is the subdomain of your project
  URL — in `https://ajvakafyykcmpuzfaacz.supabase.co` the ref is
  `ajvakafyykcmpuzfaacz`. This document writes it as `<project-ref>`.
- Your production domain. This document uses `cosignolabs.com`; substitute
  yours everywhere if it differs.
- The database migrations already applied (every file in
  `supabase/migrations/`, in numeric order). Auth works without them, but the
  app will fail immediately after sign-in because no tables exist.

Two ideas that the rest of this document depends on:

**Site URL is a fallback, not a preference.** Supabase's auth server (GoTrue)
uses it whenever it needs a destination and the one it was given is missing or
not allow-listed. Most of the time you never see it — which is exactly why a
wrong value sits undetected until a real user clicks a real link.

**The Redirect URLs list is an allow-list, and it fails closed and silently.**
When the app asks Supabase to send a user to a URL that isn't on the list,
Supabase does not error. It discards the request and substitutes Site URL. A
misconfigured allow-list therefore looks exactly like a misconfigured Site URL.

---

## 2. Authentication → URL Configuration

Supabase dashboard → **Authentication** → **URL Configuration**.

### Site URL

```
https://cosignolabs.com
```

Rules, all of which are load-bearing:

- **The `https://` scheme is mandatory.** A scheme-less value is a *relative*
  reference. When Supabase puts it in a `Location:` header, the browser
  resolves it against the page it is currently on — `https://<project-ref>.supabase.co`
  — and the user lands on `https://<project-ref>.supabase.co/cosignolabs.com`,
  which is not a Supabase route. See
  [`requested path is invalid`](#requested-path-is-invalid).
- **No trailing slash.** `https://cosignolabs.com/` produces doubled slashes
  when path segments are appended in email templates (`…com//auth/confirm`).
  Some hosts 301 that to the single-slash form and it survives; on others it
  404s. Don't rely on the redirect.
- **Use the apex, not `www`,** to match `DEPLOY.md`'s domain setup, where the
  apex is the primary domain and `www` redirects to it.
- **Production only.** This is a single global value shared by every
  environment, so it must be the URL a real customer uses. Local development is
  handled by the Redirect URLs list below, never by pointing Site URL at
  localhost.

### Redirect URLs

Add each of these as a separate entry:

```
https://cosignolabs.com/**
https://www.cosignolabs.com/**
http://localhost:3000/**
https://*.netlify.app/**
```

Why each one exists:

| Entry | Why it is needed | Remove it if… |
| --- | --- | --- |
| `https://cosignolabs.com/**` | The production origin. Every auth URL the app builds comes from `window.location.origin`, so a customer on the apex domain produces `https://cosignolabs.com/auth/confirm?…`. Without this entry that URL is discarded and Site URL is used instead. | Never — this is the one that matters. |
| `https://www.cosignolabs.com/**` | `DEPLOY.md` redirects `www` to the apex, but the redirect happens on **page load**, not before. A visitor who reaches `https://www.cosignolabs.com/sign-up` from a link or a bookmark generates `origin` = `https://www.cosignolabs.com` and their sign-up is built from the `www` host. Without this entry, those users — and only those users — get a broken confirmation email. | You have no `www` DNS record at all. |
| `http://localhost:3000/**` | Local development. `npm run dev` serves on port 3000, so `origin` is `http://localhost:3000`. Note `http`, not `https`. | Nobody develops locally against this Supabase project. Prefer a separate dev project instead of removing this. |
| `https://*.netlify.app/**` | Netlify deploy previews and branch deploys, which get a generated hostname per deploy (`deploy-preview-42--yoursite.netlify.app`). No fixed URL can cover them, so the wildcard does. | You never test auth on previews. Tightening to `https://*--yoursite.netlify.app/**` is better than the broad wildcard if you know your site name. |

**On the `**` suffix.** Supabase matches these as globs: `*` matches within a
path segment, `**` matches across segments. `https://cosignolabs.com/**`
therefore covers `/auth/confirm`, `/auth/callback`, and any query string.
Listing bare origins without a wildcard (`https://cosignolabs.com`) matches
only the exact root URL and will reject every real auth redirect this app
sends.

**On breadth.** `https://*.netlify.app/**` allows *any* Netlify site to be a
post-auth destination. That is acceptable for previews of a site you control,
but it is the loosest entry here — scope it to your site name once you know it.
The app defends itself independently: `safeRedirect()`
(`src/components/auth/authRedirect.ts:8`) rejects anything that isn't a
path-absolute, same-origin path, so an attacker-supplied `next=` can never send
a user off-site even if the allow-list is broad.

### What the app sends, and from where

Every one of these must be covered by the list above:

| Flow | URL built | Source |
| --- | --- | --- |
| Email sign-up | `{origin}/auth/confirm?next={dest}` | `src/components/auth/SupabaseAuthFlow.tsx:96` |
| Google sign-in | `{origin}/auth/callback?next={dest}` | `src/components/auth/SupabaseAuthFlow.tsx:174` |
| Password reset | `{origin}/auth/confirm?next=/auth/reset` | `src/app/auth/reset/page.tsx:46` |

`{origin}` is always `window.location.origin` — a real browser origin, always
scheme-qualified. **The app cannot produce a malformed auth URL.** If you see
one, it came from dashboard configuration.

---

## 3. Email templates

Supabase dashboard → **Authentication** → **Emails** (or **Email Templates**).

### Why this project requires custom templates

This is not optional polish. Supabase's default templates **do not work with
this codebase**.

The default templates use `{{ .ConfirmationURL }}`, which points at Supabase's
own `/auth/v1/verify` endpoint. Supabase verifies the token itself, then
redirects to your app carrying either a URL fragment or a `code` parameter.

This app instead verifies tokens server-side. `src/app/auth/confirm/route.ts:17-19`
reads exactly three query parameters:

```ts
const tokenHash = url.searchParams.get("token_hash");
const type = url.searchParams.get("type") as EmailOtpType | null;
const next = safeRedirect(url.searchParams.get("next") ?? undefined);
```

and immediately bails if the first two are absent (`route.ts:21-23`):

```ts
if (!supabaseAuthConfigured() || !tokenHash || !type) {
  return NextResponse.redirect(new URL("/sign-in", req.url));
}
```

So with a default template the user clicks "confirm", arrives without
`token_hash`, and is bounced to `/sign-in` with **no error message and no
confirmed account**. The template must hand this route a `token_hash` and a
`type` directly.

### Confirm signup

Template: **Confirm signup**. Replace the body with:

```html
<h2>confirm your email</h2>

<p>click the link below and you're in.</p>

<p>
  <a href="{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=signup&next=/app">
    confirm my email
  </a>
</p>

<p>or enter this code: <strong>{{ .Token }}</strong></p>

<p>this link expires in 24 hours. if you didn't create a cosigno account, ignore this email.</p>
```

The required link, alone:

```
{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=signup&next=/app
```

Notes:

- **`{{ .Token }}` is not decoration.** The sign-up screen offers a 6-digit
  code as an alternative to the link, and tells the user to look for one —
  "if your email shows a 6-digit code instead, enter it below"
  (`SupabaseAuthFlow.tsx:126`). The handler
  (`SupabaseAuthFlow.tsx:151-155`) calls
  `verifyOtp({ email, token, type: "signup" })`. Omit `{{ .Token }}` and that
  visible path in the UI leads nowhere.
- **`type=signup` must match** the `type` passed to `verifyOtp`. A mismatch
  fails verification even with a valid token.
- **`next=/app` is a fixed destination.** `safeRedirect()` accepts only
  path-absolute internal paths, so `/app` is correct and safe. The trade-off:
  a user who started at `/sign-up?redirect_url=/app/connections` lands on
  `/app` rather than their original target. That is a deliberate simplification
  — if you want the original destination preserved, use
  `{{ .RedirectTo }}&token_hash={{ .TokenHash }}&type=signup` as the whole
  href instead, which renders the app's own `emailRedirectTo`
  (`/auth/confirm?next=…`) and appends the token to it. That variant depends on
  the Redirect URLs allow-list being correct — if `emailRedirectTo` is
  rejected, `{{ .RedirectTo }}` is empty and the link breaks entirely. The
  `{{ .SiteURL }}` form above degrades more gracefully, which is why it is the
  recommendation.

### Password reset

Template: **Reset password** (sometimes shown as "Reset Password for User").

```html
<h2>reset your password</h2>

<p>click below to choose a new password.</p>

<p>
  <a href="{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=recovery">
    set a new password
  </a>
</p>

<p>this link expires in 1 hour. if you didn't ask for this, ignore this email — your password is unchanged.</p>
```

The required reset URL:

```
{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=recovery
```

**`type=recovery` is what makes the flow work.** There is no `next=` here on
purpose — the confirm route hard-codes the destination for recovery links
(`src/app/auth/confirm/route.ts:34`):

```ts
const dest = type === "recovery" ? "/auth/reset" : next;
```

Any `next=` you add is ignored for this type. The full round trip:

1. `/auth/reset` with no session shows the "enter your email" form and calls
   `resetPasswordForEmail` (`src/app/auth/reset/page.tsx:45-47`).
2. The emailed link hits `/auth/confirm?token_hash=…&type=recovery`.
3. The route verifies the token, which sets session cookies, then redirects to
   `/auth/reset`.
4. `/auth/reset` now sees a session (`page.tsx:29-32`) and switches to the
   "set a new password" form, which calls `updateUser({ password })` and sends
   the user to `/app`.

Step 3 is why the reset link must go through `/auth/confirm` and not straight
to `/auth/reset`: without the token verification there is no session, and the
page would just show the request form again.

### Change email address

Template: **Change Email Address**.

```
{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=email_change&next=/app/account
```

If **Secure email change** is enabled (Authentication → Providers → Email),
Supabase sends a confirmation to *both* the old and new address and both must
be clicked. In that configuration the message sent to the new address exposes
the token as `{{ .TokenHashNew }}` rather than `{{ .TokenHash }}` — check which
variable your template is rendering before assuming this one line is correct
for both emails.

### Magic Link and Invite

The app's UI does not offer either flow, so these templates are unused in
normal operation. Fix them anyway if you ever intend to invite a user from the
dashboard, because the defaults have the same `{{ .ConfirmationURL }}` problem:

```
{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=magiclink&next=/app
{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=invite&next=/app
```

### Template variable reference

| Variable | Renders | Use |
| --- | --- | --- |
| `{{ .SiteURL }}` | Your Site URL, verbatim | Base of every link. **Inherits the missing-scheme bug directly** — this is the variable that produced `supabase.co/cosignolabs.com`. |
| `{{ .TokenHash }}` | Hashed one-time token | The `token_hash` parameter. Required. |
| `{{ .Token }}` | 6-digit numeric code | The typed-code alternative on the sign-up screen. |
| `{{ .RedirectTo }}` | The app's `emailRedirectTo`, if allow-listed | Optional deep-link-preserving variant. Empty when the allow-list rejects it. |
| `{{ .ConfirmationURL }}` | Supabase's own verify URL | **Do not use.** Incompatible with `/auth/confirm` — this is the default-template bug. |
| `{{ .Email }}` | The recipient's address | Body copy only. |

### Does the allow-list still matter with `{{ .SiteURL }}` templates?

Yes. A `{{ .SiteURL }}`-based link goes straight to your app, so Supabase never
issues a redirect and the allow-list is not consulted *for that link*. But it
is still consulted for:

- Google sign-in (`signInWithOAuth`'s `redirectTo`), which is a live redirect;
- whether `{{ .RedirectTo }}` renders at all;
- any flow that falls back to Site URL.

Configure both. They fail in different places.

---

## 4. OAuth callback URLs

Two unrelated kinds of OAuth run in this app. Conflating them is a common
source of lost hours, because both involve Google and both are called
"callback".

| | Sign-in with Google | Connector OAuth |
| --- | --- | --- |
| Purpose | Creating and authenticating a cosigno account | Letting a signed-in user connect Gmail, Slack, etc. |
| Managed by | Supabase | This app's own code |
| Callback registered with the provider | `https://<project-ref>.supabase.co/auth/v1/callback` | `https://cosignolabs.com/api/connections/<key>/callback` |
| Appears in Supabase Redirect URLs? | Yes (the app-side landing) | **No — nothing to do with Supabase** |
| Credentials live in | Supabase dashboard | Netlify environment variables |

### A. Sign-in with Google (Supabase-managed)

Three things must line up:

1. **Google Cloud Console** → APIs & Services → Credentials → your OAuth 2.0
   Web application client → **Authorised redirect URIs**:

   ```
   https://<project-ref>.supabase.co/auth/v1/callback
   ```

   This is Supabase's URL, not yours. Google redirects to Supabase; Supabase
   then redirects to you.

2. **Supabase** → Authentication → Providers → **Google**: enable it and paste
   the client ID and client secret.

3. **Supabase** → Authentication → URL Configuration → **Redirect URLs**: must
   cover `https://cosignolabs.com/auth/callback`, which the
   `https://cosignolabs.com/**` entry from
   [section 2](#redirect-urls) already does. The app sends this at
   `SupabaseAuthFlow.tsx:174`; the landing route
   (`src/app/auth/callback/route.ts:15-21`) exchanges the `code` for a session.

Then set `NEXT_PUBLIC_ENABLE_GOOGLE_AUTH=1` to show the button
(`src/app/(auth)/sign-up/page.tsx:14-17`). The button stays hidden until you
do, so **enable the provider in Supabase first** — a visible button with a
disabled provider is an error with no useful message.

### B. Connector OAuth (app-managed)

These let an already-signed-in user connect a third-party app. Each callback is
registered in **that provider's own console**, never in Supabase.

| Provider | Key | Callback URL | Environment variables |
| --- | --- | --- | --- |
| Gmail | `google` | `https://cosignolabs.com/api/connections/google/callback` | `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` |
| Google Calendar | `google-calendar` | `https://cosignolabs.com/api/connections/google-calendar/callback` | `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` |
| Google Drive | `google-drive` | `https://cosignolabs.com/api/connections/google-drive/callback` | `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` |
| Outlook | `outlook` | `https://cosignolabs.com/api/connections/outlook/callback` | `MICROSOFT_CLIENT_ID`, `MICROSOFT_CLIENT_SECRET` |
| GitHub | `github` | `https://cosignolabs.com/api/connections/github/callback` | `GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET` |
| Slack | `slack` | `https://cosignolabs.com/api/connections/slack/callback` | `SLACK_CLIENT_ID`, `SLACK_CLIENT_SECRET` |
| Notion | `notion` | `https://cosignolabs.com/api/connections/notion/callback` | `NOTION_CLIENT_ID`, `NOTION_CLIENT_SECRET` |

Built by `redirectUri()` at `src/lib/integrations/oauthFlow.ts:17-19`, from
`appUrl()` (`src/lib/stripe.ts:34`) — which reads `NEXT_PUBLIC_APP_URL`, then
`NEXT_PUBLIC_SITE_URL`, then Netlify's `DEPLOY_PRIME_URL` and `URL`, then falls
back to `https://cosignolabs.com`.

**The Google trap:** Gmail, Calendar, and Drive share one OAuth client but are
three separate connectors, so that single client needs **all three** redirect
URIs registered. Two out of three works for two connectors and silently fails
for the third.

You never have to derive these by hand. Every deploy prints the exact list at
boot (`src/instrumentation.ts:47-58`) — search the Netlify function log for
`[cosigno] OAuth redirect URIs`:

```
[cosigno] OAuth redirect URIs for this deployment (https://cosignolabs.com) — each must be registered with its provider, or connecting fails silently:
[cosigno]   Gmail: https://cosignolabs.com/api/connections/google/callback
[cosigno]   Google Calendar: https://cosignolabs.com/api/connections/google-calendar/callback
…
```

See [`MAKE_IT_WORK.md`](./MAKE_IT_WORK.md) for the per-provider console steps.

---

## 5. Environment variables

Auth needs no dedicated service. It runs on the Supabase keys you already set.

| Variable | Required | Purpose |
| --- | --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | Yes | Project URL, e.g. `https://<project-ref>.supabase.co`. Together with the anon key it is what `authConfigured()` checks (`src/lib/auth.ts:5-9`); if either is missing, production fails closed and nobody can sign in. |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Yes | Publishable key. Safe in the browser bundle — RLS governs what it can reach. |
| `SUPABASE_SERVICE_ROLE_KEY` | Yes | Server-only. Used in exactly one place: deleting the auth user on account deletion so the email frees up for re-signup (`src/lib/supabaseAuth/admin.ts:10-22`). Never expose it to the client. |
| `NEXT_PUBLIC_ENABLE_GOOGLE_AUTH` | No | `1` shows "continue with google". Leave unset until the Google provider is enabled in Supabase. |
| `NEXT_PUBLIC_APP_URL` | No | Only if your domain is **not** `cosignolabs.com`. Affects connector callbacks, Stripe return URLs, and OG tags — **not** auth, which uses the live browser origin. `NEXT_PUBLIC_SITE_URL` is an accepted alias. |

Run `npm run check:env` to see what is missing as a table. It also runs on every
Netlify build.

---

## 6. Common failure modes

| Symptom | Root cause | Fix |
| --- | --- | --- |
| [`{"error":"requested path is invalid"}`](#requested-path-is-invalid) | Site URL has no scheme | Set `https://cosignolabs.com` |
| [Emails link to localhost](#localhost-in-emails) | Site URL points at a dev machine | Set Site URL to production; allow-list localhost instead |
| [`otp_expired`](#otp_expired) | Link expired, already used, or prefetched | Re-send; check expiry and link-scanning |
| [`redirect_to` ignored](#redirect_to-ignored) | URL not on the allow-list | Add the origin with `/**` |
| [Missing `https://`](#missing-https) | Scheme-less entry anywhere | Add the scheme to every entry |
| [Missing Redirect URL](#missing-redirect-url) | Origin absent from allow-list | Add all four entries from section 2 |
| Confirmation bounces to `/sign-in`, account unconfirmed | Default email template — no `token_hash` | Rewrite the template ([section 3](#3-email-templates)) |

### `requested path is invalid`

**Symptom.** The confirmation link lands on
`https://<project-ref>.supabase.co/cosignolabs.com` and the page shows:

```json
{ "error": "requested path is invalid" }
```

**Root cause.** Site URL is set to `cosignolabs.com` with no `https://`, and
the app's `redirect_to` was rejected by the allow-list, so Supabase substituted
Site URL. A scheme-less value in a `Location:` header is a *relative*
reference, so the browser resolves it against the origin it is already on —
`https://<project-ref>.supabase.co` — and appends the bare domain as a path
segment. That path is not a Supabase API route, so the API gateway rejects it.

The bare domain appearing as a single path segment on your project host is the
signature of exactly this. Note that **two** things are wrong at once: the
missing scheme produced the string, and a Redirect URLs gap is why the fallback
was reached at all.

**Fix.**

1. Site URL → `https://cosignolabs.com`.
2. Add all four entries from [Redirect URLs](#redirect-urls).
3. Save, then send a **new** signup email. Links already sent keep the old
   destination baked in — testing with an old email will show the old failure
   and make you think the fix didn't work.

### localhost in emails

**Symptom.** Production confirmation emails link to `http://localhost:3000/…`.
Customers get a browser error; on their own machine a developer sees it "work",
which delays the diagnosis.

**Root cause.** Site URL was set to `http://localhost:3000` during local
development. Because it is a single global value, one developer's convenience
becomes every customer's broken email.

**Fix.** Site URL is production, always. Local development belongs in the
Redirect URLs list (`http://localhost:3000/**`), which is what makes the app's
own `emailRedirectTo` work locally without touching Site URL. If you need a
genuinely independent local setup, create a second Supabase project for
development rather than repointing this one.

### `otp_expired`

**Symptom.** `error=access_denied&error_code=otp_expired`, or the app's own
"expired/used link" path — `/auth/confirm` fails verification and forwards to
`/sign-in` with the destination preserved (`src/app/auth/confirm/route.ts:26-32`).

**Root cause,** in descending order of likelihood:

1. **The link was already used.** These tokens are single-use. A second click —
   including the browser restoring the tab — fails.
2. **Genuine expiry.** Signup confirmations default to 24 hours, recovery links
   to 1 hour.
3. **A security scanner opened it first.** Corporate mail gateways and some
   consumer clients prefetch links to check for malware. The scanner consumes
   the token and the human gets a dead link. This is the one that looks
   inexplicable, because the user genuinely clicked only once.
4. **Clock skew** between the signing and verifying host, if you are
   self-hosting.

**Fix.** For (1) and (2), re-send. For (3), the 6-digit code is the durable
workaround — a scanner following links cannot consume a typed code, which is
why the signup template includes `{{ .Token }}` and the UI accepts it. If your
users are mostly on corporate mail, lead with the code in the template. Adjust
lifetimes under Authentication → Providers → Email.

### `redirect_to` ignored

**Symptom.** The app clearly asks for `https://cosignolabs.com/auth/confirm?next=/app`,
but users land on the Site URL root — or on the broken path in
[`requested path is invalid`](#requested-path-is-invalid). No error appears
anywhere.

**Root cause.** The URL is not covered by the Redirect URLs allow-list.
Supabase fails closed and silently here: it discards the requested destination
and substitutes Site URL rather than returning an error.

Near-misses that cause it:

- The list has `https://cosignolabs.com` but the app sends
  `/auth/confirm?next=/app`. Without `/**` only the exact root matches.
- The user is on `www` and only the apex is listed.
- A preview deploy on `*.netlify.app` with no wildcard entry.
- Scheme or port mismatch — `https://localhost:3000` won't match
  `http://localhost:3000`.

**Fix.** Add the origin with a `/**` suffix. Compare against the app's three
senders in [what the app sends](#what-the-app-sends-and-from-where).

### Missing `https://`

**Symptom.** Varies by field, which is what makes it confusing. In Site URL you
get [`requested path is invalid`](#requested-path-is-invalid). In a Redirect
URLs entry you get [`redirect_to` ignored](#redirect_to-ignored), because a
scheme-less pattern never matches a real origin.

**Root cause.** These fields accept the value without validating it. Pasting a
domain the way you'd type it into a browser is the natural mistake.

**Fix.** Every entry in both fields starts with `https://` (or `http://` for
localhost only). Re-read the list character by character after saving — this is
the single highest-yield check in this document.

### Missing Redirect URL

**Symptom.** Auth works for you and breaks for some users, or works in
production and breaks on previews. Distinctively *partial*.

**Root cause.** The allow-list covers some origins the app can run on but not
all of them. Because the app derives auth URLs from
`window.location.origin`, the origin varies by how the user arrived — apex vs
`www`, production vs preview vs localhost.

**Fix.** Add all four entries from [section 2](#redirect-urls). If auth breaks
for one group of users only, ask that group what URL is in their address bar;
that origin is your missing entry.

---

## 7. Deployment checklist

Verify every line before calling a production deployment done.

**Supabase → Authentication → URL Configuration**

- [ ] **Site URL** is `https://cosignolabs.com` — scheme present, no trailing
      slash, not localhost, not a preview URL.
- [ ] **Redirect URLs** contains all four entries, each with `/**`:
      apex, `www`, `http://localhost:3000`, `https://*.netlify.app`.

**Supabase → Authentication → Emails**

- [ ] **Confirm signup** uses `{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=signup&next=/app`
      and includes `{{ .Token }}`.
- [ ] **Reset password** uses `{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=recovery`.
- [ ] **Change email** uses `type=email_change`.
- [ ] No template still contains `{{ .ConfirmationURL }}`.

**OAuth callbacks**

- [ ] Google Cloud Console has `https://<project-ref>.supabase.co/auth/v1/callback`
      (only if Google sign-in is enabled).
- [ ] Google provider enabled in Supabase with client ID and secret.
- [ ] Every connector in use has its callback registered in that provider's own
      console — all three Google URIs on the shared client. Cross-check against
      `[cosigno] OAuth redirect URIs` in the deploy log.

**Environment variables**

- [ ] `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`,
      `SUPABASE_SERVICE_ROLE_KEY` all set.
- [ ] `NEXT_PUBLIC_ENABLE_GOOGLE_AUTH=1` only if the provider is actually
      enabled.
- [ ] `NEXT_PUBLIC_APP_URL` set only if the domain isn't `cosignolabs.com`.
- [ ] `npm run check:env` shows no missing required keys.

**Auth confirmation flow** — with a real, previously unused address:

- [ ] The email arrives.
- [ ] Its link points at `https://cosignolabs.com/auth/confirm?token_hash=…`,
      **not** at `supabase.co`. Hover and read it before clicking.
- [ ] Clicking lands on `/app`, signed in.
- [ ] The 6-digit code path also works: sign up a second address, type the code
      instead of clicking.

**Password reset flow**

- [ ] `/auth/reset` sends the email.
- [ ] The link lands on `/auth/reset` with the "set a new password" form
      showing — not the "enter your email" form, which means the session
      wasn't established.
- [ ] The new password saves and lands on `/app`.
- [ ] Signing out and back in with the new password works.

**New account signup**

- [ ] A brand-new address completes sign-up end to end.
- [ ] Signing up again with an existing address recovers gracefully instead of
      erroring (`SupabaseAuthFlow.tsx:67-78`).
- [ ] `npm run verify:deploy -- https://cosignolabs.com` is all `PASS`/`SKIP`.

---

## 8. Clean-project walkthrough

The exact order to configure a brand-new Supabase project. Ordered so nothing
depends on a step that hasn't happened yet.

1. **Create the project.** Note the project ref from the project URL.
2. **Apply migrations.** Run every file in `supabase/migrations/` in numeric
   order in the SQL editor. Auth would work without this, but the first
   post-signin page load would fail on missing tables.
3. **Copy the three keys** from Project Settings → API into your host's
   environment variables (see [section 5](#5-environment-variables)).
4. **Set Site URL** to `https://cosignolabs.com`. Scheme, no trailing slash.
5. **Add the four Redirect URLs**, each with `/**`.
6. **Rewrite the email templates** — Confirm signup and Reset password at
   minimum. Confirm no template still contains `{{ .ConfirmationURL }}`.
7. **Deploy**, then check the log for `[cosigno] OAuth redirect URIs` and
   confirm `check:env` reports no missing required keys.
8. **Optional — Google sign-in.** Register
   `https://<project-ref>.supabase.co/auth/v1/callback` in Google Cloud
   Console, enable the provider in Supabase, then set
   `NEXT_PUBLIC_ENABLE_GOOGLE_AUTH=1` and redeploy. In that order.
9. **Optional — connectors.** Register each callback from
   [section 4B](#b-connector-oauth-app-managed) in its provider's console and
   add the client id/secret pairs.
10. **Walk the whole of [section 7](#7-deployment-checklist)** against the live
    site with a real email address.

**If you get exactly one thing wrong,** it will be step 4, and the symptom will
be [`requested path is invalid`](#requested-path-is-invalid).
