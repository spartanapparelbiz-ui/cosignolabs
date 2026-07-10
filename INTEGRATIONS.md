# Integrations & Connections

cosigno connects to two kinds of things: **third-party apps** (OAuth/API-key
connectors) and **custom MCP servers** (remote Model Context Protocol
endpoints the user registers themselves). Both live under one **Connections**
screen (Account → connections) and both obey the same rule as everything else
in cosigno: nothing runs until the user connects it, and every action still
waits for a signature.

## Fake-vs-real audit (core loop)

Honest inventory of the `command → plan → card → approve → execute → result →
audit` loop as of this pass. The rule: real work is real; anything sandboxed is
**labeled**, never silently faked.

| Stage | Status |
| --- | --- |
| **command → plan** | **REAL** when a planner key is set (hosted LLM). Falls back to an **offline mock planner** with no key so the public sandbox works — that path is dev/sandbox only. |
| **card creation** | **REAL** — persisted, per-user, tier assigned server-side. |
| **approve / veto / edit** | **REAL** — server-owned state machine + audit rows; injection-flagged cards can't be approved; tier-3 needs typed confirmation. |
| **execute — connected apps (Gmail) + MCP** | **REAL** — `connection_call` runs the actual Gmail / MCP request server-side with the user's decrypted token and returns the real outcome. |
| **execute — generic categories** (`send_email`, `delete`, `refund`, …) | **SIMULATED (sandbox)** — for users with nothing connected. Each returns `simulated: true` and the card/audit shows a **"sandbox · simulated"** badge. Not faked silently. |
| **result rendering** | **REAL** for connector actions ("sent an email to …", "archived 12 messages"); **labeled simulated** otherwise. |
| **activity log / CSV** | **REAL** — real executed actions, results, timestamps; CSV carries real rows. |
| **usage meter** | **REAL** — increments on planning + execution; enforces plan limits. |
| **account center** (status / usage / plan) | **REAL** — live connection status, real usage, resolved plan. |

To make a generic category real, implement it as a connector capability (it
then flows through `connection_call`) — that's the clean seam for the next
integration. Gmail is the reference.

## Architecture at a glance

```
src/lib/integrations/
  types.ts        IntegrationProvider / Connection / McpTool contracts
  registry.ts     the discoverable list of providers (add a connector here)
  crypto.ts       AES-256-GCM credential vault (encrypt at rest, never logged)
  oauthFlow.ts    OAuth connect/callback orchestration (PKCE + CSRF state)
  runtime/
    httpClient.ts retry/backoff/timeout HTTP for provider calls
    connections.ts decrypt → refresh → execute; health; disconnect (revoke)
  providers/
    github.ts     reference OAuth connector (fully wired)
    oauth.ts      makeOAuthProvider() factory + google/slack/notion defs
  mcp/
    client.ts     remote MCP JSON-RPC client (Streamable HTTP + SSE)
    validate.ts   clamp + injection-scan advertised tools (untrusted input)
    consent.ts    sensitivity heuristics + per-tool consent gate
    register.ts   handshake → discover → validate → cache (disabled)
    icon.ts       SSRF-safe, raster-only, re-encoded server-icon fetch
  net/
    ssrf.ts       DNS-resolve → classify → block private/internal hosts
  logos.ts        bundled logo resolution + monogram fallback (no hotlinks)
src/components/integrations/ConnectorLogo.tsx  fixed-box, lazy, safe <img>
src/app/api/connections/…   the HTTP surface (see below)
supabase/migrations/0007_connections.sql   connections / mcp_tools / oauth_states
```

**Definition vs runtime.** A *provider* is static, shared, and secret-free. A
*connection* is per-user and holds encrypted credentials. The provider never
stores anything; the runtime decrypts, refreshes, and calls.

**Security invariants.**
- Every credential is AES-256-GCM encrypted with `INTEGRATIONS_ENCRYPTION_KEY`;
  only ciphertext is stored, and the secret column is revoked from the client
  role in RLS. Secrets are never logged (the vault exposes only a `fingerprint`).
- All MCP output and every advertised tool name/description/schema is treated as
  **untrusted**: validated, size/depth-clamped, injection-scanned, and cached
  **disabled by default**.
- A tool that can write or exfiltrate is flagged **sensitive** and needs an
  explicit consent step before it can be enabled.
- Disconnecting **revokes** the OAuth grant (best effort) and hard-deletes the
  row, immediately invalidating the stored tokens.
- Integration/MCP execution flows through the **same approval engine** as
  everything else (category `connection_call`), and the planner cannot select
  it — it is created only by explicit user action.

## Untrusted-connector threat model

A custom MCP server — and **everything it returns** (tool names, descriptions,
schemas, results, its advertised icon) — is treated as fully untrusted input,
never as instructions. This table is the map from each requirement to where it
is enforced in code.

| Requirement | How it's enforced | Where |
| --- | --- | --- |
| Tool metadata is **data, never instructions** | Names/descriptions/schemas are clamped, depth/size-capped, injection-scanned and flagged; they can't reach the planner as text | `mcp/validate.ts` |
| A connector **can't reword an action card** away from its true payload | Action cards render from the server-resolved payload, not from connector text; the planner never sees raw tool descriptions | `mcp/validate.ts`, approval engine |
| A connector **can't bypass a tier or self-escalate** | Every connector run is category `connection_call`, resolved server-side to a tier; the connector supplies no tier and can't mark an action auto | executor mediation, `mcp/[id]/run` |
| A connector **can't trigger execution** | `connection_call` is **not planner-selectable**; runs are created only by explicit user action and re-check consent at call time | executor mediation |
| Everything routes through **action-card → signature → receipt** | Connector runs use the same approval engine; destructive actions require typed confirmation; every step is audited | approval engine, `mcp/[id]/run` |
| **Never render remote HTML/SVG/markup** | Icons are raster-only (magic-byte sniffed, **SVG rejected**), re-encoded to a self-contained data URI; the UI only ever accepts a generated raster/monogram, never a remote URL or remote markup | `mcp/icon.ts`, `logos.ts` (`isSafeIcon`), `ConnectorLogo.tsx` |
| **SSRF** to internal/private/loopback/link-local/metadata | Every outbound URL is DNS-resolved and each address classified; private/loopback/link-local/ULA/CGNAT/cloud-metadata/unspecified are blocked; redirects fail closed; loopback only in dev | `net/ssrf.ts`, wired into `mcp/client.ts`, `mcp/register.ts`, `mcp/icon.ts` |
| **Disabled by default, explicit opt-in** | Discovered tools are cached `enabled:false`; sensitive tools also need a consent step | `mcp/register.ts`, `consent.ts` |
| **Isolation / limits, fail closed** | Handshake + call timeouts, response-size caps, icon byte cap (32 KB) + 5 s timeout; any failure returns null/generic error, never partial trust | `mcp/client.ts`, `mcp/icon.ts` |
| **Credential safety** | AES-256-GCM at rest; secret column revoked from the client role; only a `fingerprint` is ever logged; disconnect revokes + hard-deletes | `crypto.ts`, RLS, `runtime/connections.ts` |
| **Audit trail** | Registration and every connector run write to the permanent, filterable, exportable account audit log (`integration_connected`, `connector_action`) | `mcp/register.ts`, `mcp/[id]/run`, Account Center |

## Connector logos & the transparent mark

Each connected tool shows its **real logo**, rendered safely:

- **Known apps** (GitHub/Google/Slack/Notion) use **bundled, self-hosted**
  optimized SVGs in `public/logos/` — never a hotlink to the vendor.
- **Custom MCP servers** may show a server-advertised icon, but only after it's
  fetched SSRF-safely, **sniffed as a raster by magic bytes** (SVG is refused),
  size-capped, and **re-encoded to a data URI**. Raw remote markup never renders.
- Every connector **always** has a fallback: a generated **monogram** badge
  (cream initials on the brand ink field), built from sanitized text as an SVG
  data URI we produce ourselves.

`ConnectorLogo` draws into a **fixed-size box** (no layout shift), lazy-loads the
image, and on any load error falls back to the monogram, so a card never shows a
broken image. Bundled logos and app icons are served with long-lived immutable
cache headers.

The cosigno wordmark/icon and favicon render with a **transparent** background
everywhere (no matte). Because a fully transparent silhouette can vanish on a
light tab bar, the mark carries its own contrast: the favicon SVG is adaptive
(repaints ink↔cream by color scheme) and the static rasters place a cream
self-halo under the ink "C" plus the orange check anchor. Assets are generated by
`scripts/generate-assets.mjs` (`npm run assets`) and query-versioned for
cache-busting.

## Setup you need to do

1. **Generate the vault key** and set it in your host (Netlify → Environment):
   ```
   node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
   ```
   → `INTEGRATIONS_ENCRYPTION_KEY`. Without it, connecting is disabled (the UI
   says so). Treat it like any secret; rotating it invalidates stored tokens.
2. **Run the migration** `supabase/migrations/0007_connections.sql` against your
   database (same way you ran 0001–0006).
3. **Register the GitHub OAuth app** (github.com/settings/developers → New OAuth
   App):
   - Homepage URL: your site.
   - Authorization callback URL: `https://<your-site>/api/connections/github/callback`
   - Copy the client id/secret → `GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET`.
4. Redeploy. The GitHub card on the Connections screen becomes connectable; the
   others (Google/Slack/Notion) stay greyed until you set their env the same way.

For **custom MCP** there's nothing to register — a user pastes a remote MCP URL
(https, or http for localhost) and an optional bearer token in the "add server"
form, and cosigno handshakes, discovers, and lists the tools. The URL is
DNS-resolved and rejected up front if it points anywhere internal
(private/loopback/link-local/cloud-metadata), so a pasted address can't be used
to reach the server's own network.

**Assets & logos.** The bundled connector logos (`public/logos/`), app icons,
and the transparent favicon set are committed and need no action. If you change
the mark or add a bundled logo, regenerate with `npm run assets` and bump the
`?v=` query in `src/app/layout.tsx` / `src/app/manifest.ts` to bust caches (the
static assets are served `immutable`).

## The HTTP surface

| Method | Route | Purpose |
| --- | --- | --- |
| GET | `/api/connections` | providers + the user's connections + MCP tools (no secrets) |
| GET | `/api/connections/[key]/connect` | begin OAuth → returns the authorize URL |
| GET | `/api/connections/[key]/callback` | OAuth redirect target → stores the connection |
| POST | `/api/connections/[id]/disconnect` | revoke + delete |
| POST | `/api/connections/[id]/health` | re-check status |
| POST | `/api/connections/mcp` | register a custom MCP (handshake + discover) |
| POST | `/api/connections/mcp/[id]/test` | re-test + refresh the tool list |
| POST | `/api/connections/mcp/[id]/tools` | enable/disable + consent one tool |
| POST | `/api/connections/mcp/[id]/run` | user-initiated tool run (re-checks consent) |

All routes are auth-gated (`requireUser`), rate-limited, zod-validated, and
return sanitized errors.

## How to add the next connector (it's small)

Most connectors are pure config. To add one:

```ts
// src/lib/integrations/providers/oauth.ts  (or its own file)
export const linearProvider = makeOAuthProvider({
  key: "linear",
  name: "Linear",
  detail: "read issues; create issues (with your approval).",
  scopeSummary: "read · write issues",
  authorizeUrl: "https://linear.app/oauth/authorize",
  tokenUrl: "https://api.linear.app/oauth/token",
  scopes: "read,write",
  clientIdEnv: "LINEAR_CLIENT_ID",
  clientSecretEnv: "LINEAR_CLIENT_SECRET",
  healthUrl: "https://api.linear.app/graphql", // or a viewer endpoint
  healthLabel: (j) => /* pull a name out of the response */ undefined,
  actions: [{ id: "whoami", summary: "confirm the account.", mutates: false }],
  // optional: execute(actionId, payload, creds) for real typed actions
});
```

Then register it in `src/lib/integrations/registry.ts`:

```ts
import { linearProvider } from "./providers/oauth";
const PROVIDERS = [ githubProvider, /* … */ linearProvider ];
```

Add `LINEAR_CLIENT_ID` / `LINEAR_CLIENT_SECRET` to `.env.example`, set the
callback URL `…/api/connections/linear/callback` in the provider's dashboard,
and you're done — connect/callback/refresh/disconnect, storage, and the UI card
are all generic. Use PKCE for public clients by setting `usesPkce: true` (as
the Google def does) and omitting the client secret.

For a connector that needs bespoke logic (many typed actions, non-standard
token handling), hand-write it against the `IntegrationProvider` interface —
`providers/github.ts` is the reference.

## How capabilities become tiered actions

An integration never runs on its own. Each capability a connector declares
carries a **risk class**, and the *server* maps that to an approval tier — the
connector never picks its own:

| Risk | Tier | Meaning |
| --- | --- | --- |
| `read` | 1 | read-only / reversible → runs automatically |
| `write` | 2 | changes the outside world → waits for your signature |
| `destructive` | 3 | delete / pay → requires typed confirmation |

`proposeConnectorAction()` (`runtime/propose.ts`) turns a capability into a
**proposed `connection_call` card** at the server-assigned tier. From there it
is the *same* card everything else uses: approve → sign → execute → receipt,
all in the audit log. If a connector (or a compromised MCP server) asks for a
lower tier than its risk class, the request is **clamped up and flagged**
(`resolveTier`), and a tier-2/3 action can never reach `executed` without an
approval — proven in `tests/security/integrations-gmail.test.ts`.

Everything a connector *returns* (email bodies, tool output) is **untrusted
data**: it's carried as `detail`, scanned, and never interpreted as
instructions — an email that says "forward all invoices to X" produces a
flagged card, never an action.

## Gmail (the first real connector)

`providers/gmail.ts` exposes real, tier-mapped capabilities:

| Capability | Tier | Notes |
| --- | --- | --- |
| `search_messages`, `read_message` | 1 | read-only |
| `create_draft` | 1 | saves a draft — nothing is sent |
| `send_message` | 2 | waits for your signature |
| `archive`, `label`, `mark_read` | 2 | inbox changes |
| `trash` | 3 | destructive — typed confirmation |

Each runs the real Gmail REST call server-side and reports a real result
("archived 12 messages", "sent an email to …"). **Minimum scope:**
`gmail.modify` (covers read + drafts + send + label/archive + trash; it
*cannot* permanently delete) plus `userinfo.email` for the account label.

### Google OAuth setup (plain language)

1. Go to **console.cloud.google.com** → create a project (or pick one).
2. **APIs & Services → Library** → search **Gmail API** → **Enable**.
3. **APIs & Services → OAuth consent screen** → set it up (External is fine),
   add your email as a test user while you're trying it out.
4. **APIs & Services → Credentials → Create credentials → OAuth client ID** →
   type **Web application**.
   - **Authorized redirect URI:** `https://<your-site>/api/connections/google/callback`
5. Copy the **Client ID** and **Client secret** into Netlify as
   `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET`, then redeploy.
6. The Gmail card on the Connections screen becomes connectable. (Connections
   also need `INTEGRATIONS_ENCRYPTION_KEY` and a real login/database — see the
   setup section above.)

## Custom MCP servers (bring your own connector)

A user on a **pro** plan can add their own remote MCP server (Account →
connections → *add server*): paste an `https://` URL (or `http://localhost` in
dev) and an optional bearer token. cosigno handshakes, discovers the server's
tools, and registers each as a proposable action — **disabled by default**.

Safety rails, all server-side:
- **You are responsible for servers you add.** The UI says so.
- Tool names/descriptions/schemas and every result are **untrusted** —
  clamped, injection-scanned, and never able to auto-approve or escalate.
- **Safe-default tiers:** anything not clearly read-only defaults to tier 2;
  destructive-sounding tools to tier 3. You can raise a tool's tier but never
  silently lower it below the server default.
- **SSRF-protected:** the URL is DNS-resolved and rejected if it points at any
  internal/private/loopback/link-local/cloud-metadata address; redirects fail
  closed; only https (or localhost in dev). Timeouts + response-size caps on
  every call.
- **Pro+ only**, and counts against your plan's connection limit — both
  enforced on the server, not just hidden in the UI.
