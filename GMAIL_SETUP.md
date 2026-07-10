# Connect Gmail — setup (one Google app, every user connects their own inbox)

This is the manual part only you can do: create ONE Google OAuth app (your
credentials) and paste a few values into Netlify. After that, every cosigno
user clicks "connect Gmail" and authorizes their **own** Google account — you
never see their inboxes or tokens, and each person's actions only ever touch
their own mail.

Takes about 15 minutes. No coding.

---

## 1. The exact values the code uses (copy-paste ready)

**Redirect URI** (Google calls this an "Authorized redirect URI"). Add BOTH:

```
https://cosignolabs.com/api/connections/google/callback
http://localhost:3000/api/connections/google/callback
```

- The first is production. If your live site is on a different domain, replace
  `https://cosignolabs.com` with that domain (and set `NEXT_PUBLIC_APP_URL` to
  it — see step 4).
- The second lets you test locally. You can skip it if you'll never run it on
  your own machine.

**Scopes** the app requests (you'll list these on the consent screen):

```
https://www.googleapis.com/auth/userinfo.email
https://www.googleapis.com/auth/gmail.modify
```

`gmail.modify` is the single minimum scope that covers everything cosigno can
do — read, draft, send, label, archive, and move-to-trash. It does **not**
allow permanent, trash-bypassing deletion. `userinfo.email` is only used to
label the connection with the account's email address.

**Environment variables** to set in Netlify (exact names):

| Name | What it is | Required |
|---|---|---|
| `GOOGLE_CLIENT_ID` | from the OAuth client you create below | yes |
| `GOOGLE_CLIENT_SECRET` | from the same OAuth client | yes |
| `INTEGRATIONS_ENCRYPTION_KEY` | 32-byte key that encrypts every user's tokens at rest | yes |
| `NEXT_PUBLIC_APP_URL` | your live site URL, only if it's **not** `https://cosignolabs.com` | if custom domain |

> Note on the key name: the encryption key is `INTEGRATIONS_ENCRYPTION_KEY`
> (not `KEY_ENCRYPTION_SECRET`). That is the name the code reads. Generate one
> by running this once, locally, and pasting the output as the value:
>
> ```
> node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
> ```

Without `GOOGLE_CLIENT_ID` + `GOOGLE_CLIENT_SECRET`, Gmail shows as **"coming
soon"** in the account → connections panel and the connect button is disabled —
no broken UX. The moment both are set, it turns on for everyone.

---

## 2. Google Cloud Console — step by step

1. Go to <https://console.cloud.google.com/> and sign in with the Google
   account that should own the app.
2. Top bar → project dropdown → **New Project**. Name it (e.g. "cosigno") →
   **Create**. Make sure it's selected afterward.
3. Left menu → **APIs & Services → Library**. Search **Gmail API** → open it →
   **Enable**.
4. Left menu → **APIs & Services → OAuth consent screen**:
   - User type: **External** → **Create**.
   - App name: `cosigno`. User support email: your email.
   - App logo / domain: optional for testing; required for verification (below).
   - **Scopes** → **Add or remove scopes** → paste the two scope URLs from
     step 1 above → **Update** → **Save and continue**.
   - **Test users**: add your own Gmail (and any early testers) → **Save**.
5. Left menu → **APIs & Services → Credentials → Create credentials → OAuth
   client ID**:
   - Application type: **Web application** (important — cosigno is a
     confidential web app; it uses the client secret).
   - Name: `cosigno web`.
   - **Authorized redirect URIs** → **Add URI** → paste each redirect URI from
     step 1 (production, and localhost if you want it).
   - **Create**.
6. A dialog shows your **Client ID** and **Client secret**. Copy both.

---

## 3. Netlify — set the environment variables

1. Netlify → your site → **Site configuration → Environment variables**.
2. Add:
   - `GOOGLE_CLIENT_ID` = the Client ID from step 6
   - `GOOGLE_CLIENT_SECRET` = the Client secret from step 6
   - `INTEGRATIONS_ENCRYPTION_KEY` = the key you generated (if not already set)
   - `NEXT_PUBLIC_APP_URL` = your live URL, only if it isn't `https://cosignolabs.com`
3. **Redeploy** the site (Deploys → Trigger deploy → Deploy site) so the new
   variables take effect.

Done. Open the app → account → connections. Gmail now shows a live **connect**
button; clicking it sends you to Google's real consent screen, and after you
approve, you land back on the connections panel with Gmail connected.

---

## 4. Testing mode vs. published (the one real limit)

While the consent screen is in **Testing**, only the Google accounts you added
as **Test users** can connect — Google caps this at ~100 users. That is fine
for a founding-beta launch.

To let **anyone** connect (unlimited public users), the OAuth consent screen
must be **Published** and pass **Google verification**, because `gmail.modify`
is a "restricted" scope. Verification needs:

- a public **privacy policy URL** — we have one: `https://cosignolabs.com/privacy`
- a **homepage URL** on the same verified domain — `https://cosignolabs.com`
- domain ownership verification (Google Search Console)
- the exact scopes listed (paste the two from step 1) and a short note on why
  each is needed (read/label/archive/draft/send on the user's behalf, with
  per-action user approval).

Restricted-scope verification can also require a security assessment for large
apps; for a small launch you start in Testing and publish when you outgrow the
100-user cap.

---

## 5. What's guaranteed once it's on

- **One app, per-user auth.** Your single Google app serves everyone; each user
  authorizes and stores their **own** tokens.
- **Encrypted at rest.** Every user's Google tokens are AES-256-GCM encrypted
  with `INTEGRATIONS_ENCRYPTION_KEY`, keyed to their user id, protected by
  row-level security, decrypted only server-side at the moment of a call, and
  never sent to the browser or written to a log.
- **Isolation.** A user's Gmail actions can only ever touch that user's own
  connected account (there's a test proving user A can't use user B's tokens).
- **Approval intact.** A connected Gmail can only *propose*; read/draft run at
  tier 1, send/archive/label wait for your signature (tier 2), and trash needs
  typed confirmation (tier 3). Email content is treated as untrusted and is
  injection-scanned — it can never make the agent act on its own.
- **Auto-refresh + revoke.** Access tokens refresh automatically server-side;
  disconnecting revokes and deletes the stored tokens immediately.
