# Integrations & Connections

cosigno connects to two kinds of things: **third-party apps** (OAuth/API-key
connectors) and **custom MCP servers** (remote Model Context Protocol
endpoints the user registers themselves). Both live under one **Connections**
screen (Account → connections) and both obey the same rule as everything else
in cosigno: nothing runs until the user connects it, and every action still
waits for a signature.

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
form, and cosigno handshakes, discovers, and lists the tools.

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
