import type {
  ActionResult,
  Credentials,
  IntegrationProvider,
  OAuthCredentials,
  ProviderAction,
} from "../types";
import { IntegrationHttpError, requestJson } from "../runtime/httpClient";

/**
 * Factory for a standard OAuth 2.0 provider. Adding a new OAuth integration is
 * meant to be a small, declarative task: fill in this config and register it.
 * GitHub is hand-written as the fully-featured reference; the others use this.
 *
 * `usesPkce: true` adds PKCE (code_challenge in the authorize URL, code_verifier
 * in the exchange). It is orthogonal to the client secret: if `clientSecretEnv`
 * is set the provider is a CONFIDENTIAL client and the secret is always sent at
 * exchange/refresh (Google "Web application" clients need PKCE *and* the secret).
 * A provider with no `clientSecretEnv` is a public client (PKCE only).
 */
export interface OAuthProviderConfig {
  key: string;
  name: string;
  detail: string;
  scopeSummary: string;
  /** What this connector would show on the dashboard, in business words. */
  tracks?: string[];
  authorizeUrl: string;
  tokenUrl: string;
  scopes: string;
  usesPkce?: boolean;
  /**
   * How the token endpoint authenticates. "form" (default) sends client_id/
   * client_secret as form fields; "json-basic" sends a JSON body with an HTTP
   * Basic authorization header (Notion's style).
   */
  tokenStyle?: "form" | "json-basic";
  /** env var names holding the client id / secret. */
  clientIdEnv: string;
  clientSecretEnv?: string;
  /** Extra params some providers require on the authorize URL. */
  extraAuthParams?: Record<string, string>;
  /** GET endpoint that returns the account identity; label extractor. */
  healthUrl: string;
  healthLabel: (json: Record<string, unknown>) => string | undefined;
  /** Header builder for authenticated calls (default: Bearer). */
  authHeader?: (token: string) => Record<string, string>;
  actions: ProviderAction[];
  /** Optional executor; defaults to a read-only "whoami"-style health call. */
  execute?: (
    actionId: string,
    payload: Record<string, unknown>,
    creds: OAuthCredentials
  ) => Promise<ActionResult>;
}

export function makeOAuthProvider(cfg: OAuthProviderConfig): IntegrationProvider {
  const id = () => process.env[cfg.clientIdEnv]?.trim() || undefined;
  const secret = () =>
    cfg.clientSecretEnv ? process.env[cfg.clientSecretEnv]?.trim() || undefined : undefined;
  const authHeader = cfg.authHeader ?? ((t: string) => ({ authorization: `Bearer ${t}` }));

  function asOAuth(creds: Credentials): OAuthCredentials {
    const c = creds as OAuthCredentials;
    if (!c || typeof c.access_token !== "string") {
      throw new IntegrationHttpError(401, "missing access token", false);
    }
    return c;
  }

  return {
    key: cfg.key,
    name: cfg.name,
    detail: cfg.detail,
    authType: "oauth2",
    scopeSummary: cfg.scopeSummary,
    tracks: cfg.tracks,
    // Derived, not restated: the factory already knows these, and a second
    // copy is a second thing to forget when one changes.
    setupEnv: [cfg.clientIdEnv, ...(cfg.clientSecretEnv ? [cfg.clientSecretEnv] : [])],
    usesPkce: cfg.usesPkce,

    isConfigured() {
      // A provider that declares a client-secret env is a CONFIDENTIAL client
      // (e.g. a Google "Web application" OAuth client): it needs BOTH the id
      // and the secret to complete a token exchange, regardless of PKCE. A
      // pure public client (no secret env) needs only the id. Getting this
      // wrong shows an enabled "connect" button that then fails at exchange.
      return Boolean(id() && (!cfg.clientSecretEnv || secret()));
    },

    buildAuthUrl({ state, redirectUri, codeChallenge }) {
      const params = new URLSearchParams({
        client_id: id() ?? "",
        redirect_uri: redirectUri,
        response_type: "code",
        scope: cfg.scopes,
        state,
        ...cfg.extraAuthParams,
      });
      if (cfg.usesPkce && codeChallenge) {
        params.set("code_challenge", codeChallenge);
        params.set("code_challenge_method", "S256");
      }
      return `${cfg.authorizeUrl}?${params.toString()}`;
    },

    async exchangeCode({ code, redirectUri, codeVerifier }) {
      const body: Record<string, string> = {
        grant_type: "authorization_code",
        code,
        redirect_uri: redirectUri,
      };
      if (cfg.usesPkce && codeVerifier) body.code_verifier = codeVerifier;
      let headers: Record<string, string> = { accept: "application/json" };
      if (cfg.tokenStyle === "json-basic") {
        // Notion-style: JSON body, credentials in an HTTP Basic header.
        headers = {
          ...headers,
          authorization: `Basic ${Buffer.from(`${id() ?? ""}:${secret() ?? ""}`).toString("base64")}`,
        };
      } else {
        // Send the PKCE verifier (if this flow used PKCE) AND the client secret
        // (if configured). Google "Web application" clients are confidential and
        // REQUIRE the secret at the token endpoint even when PKCE is in use —
        // sending only the verifier fails with invalid_client. Sending both is
        // correct for confidential+PKCE and harmless for a plain confidential flow.
        body.client_id = id() ?? "";
        if (secret()) body.client_secret = secret() as string;
      }
      const res = await requestJson<Record<string, unknown>>(cfg.tokenUrl, {
        method: "POST",
        form: cfg.tokenStyle !== "json-basic",
        headers,
        body,
      });
      const access = res.access_token;
      if (typeof access !== "string") {
        throw new IntegrationHttpError(400, "token exchange failed", false);
      }
      const expiresIn = typeof res.expires_in === "number" ? res.expires_in : undefined;
      return {
        access_token: access,
        refresh_token: typeof res.refresh_token === "string" ? res.refresh_token : undefined,
        token_type: typeof res.token_type === "string" ? res.token_type : undefined,
        scope: typeof res.scope === "string" ? res.scope : undefined,
        expires_at: expiresIn ? Math.floor(Date.now() / 1000) + expiresIn : undefined,
      };
    },

    async refresh(creds) {
      if (!creds.refresh_token) throw new IntegrationHttpError(400, "no refresh token", false);
      const body: Record<string, string> = {
        grant_type: "refresh_token",
        refresh_token: creds.refresh_token,
      };
      let headers: Record<string, string> = { accept: "application/json" };
      if (cfg.tokenStyle === "json-basic") {
        headers = {
          ...headers,
          authorization: `Basic ${Buffer.from(`${id() ?? ""}:${secret() ?? ""}`).toString("base64")}`,
        };
      } else {
        // Confidential clients (Google web app included) must present the secret
        // to refresh, PKCE or not.
        body.client_id = id() ?? "";
        if (secret()) body.client_secret = secret() as string;
      }
      const res = await requestJson<Record<string, unknown>>(cfg.tokenUrl, {
        method: "POST",
        form: cfg.tokenStyle !== "json-basic",
        headers,
        body,
      });
      const access = res.access_token;
      if (typeof access !== "string") throw new IntegrationHttpError(401, "refresh failed", false);
      const expiresIn = typeof res.expires_in === "number" ? res.expires_in : undefined;
      return {
        access_token: access,
        refresh_token:
          typeof res.refresh_token === "string" ? res.refresh_token : creds.refresh_token,
        expires_at: expiresIn ? Math.floor(Date.now() / 1000) + expiresIn : undefined,
      };
    },

    async healthCheck(creds) {
      try {
        const json = await requestJson<Record<string, unknown>>(cfg.healthUrl, {
          headers: { accept: "application/json", ...authHeader(asOAuth(creds).access_token) },
          retries: 2,
        });
        const label = cfg.healthLabel(json);
        return { ok: true, label };
      } catch {
        return { ok: false };
      }
    },

    listActions() {
      return cfg.actions;
    },

    async execute(actionId, payload, creds) {
      if (cfg.execute) return cfg.execute(actionId, payload, asOAuth(creds));
      // Default: only the read-only identity action is wired.
      const json = await requestJson<Record<string, unknown>>(cfg.healthUrl, {
        headers: { accept: "application/json", ...authHeader(asOAuth(creds).access_token) },
      });
      return { ok: true, summary: `${cfg.name}: ${cfg.healthLabel(json) ?? "connected"}` };
    },
  };
}

/* --- Gated definitions. Live once their env is set; the pattern is the point. --- */

function s(v: unknown): string | undefined {
  return typeof v === "string" && v.trim() ? v.trim() : undefined;
}

/**
 * Slack's web API returns HTTP 200 with `{ok:false, error}` on failure, so
 * every call checks the envelope — a failed post must never read as success.
 */
async function slackCall<T extends { ok?: boolean; error?: string }>(
  method: string,
  creds: OAuthCredentials,
  init?: { method?: string; body?: unknown }
): Promise<T> {
  const res = await requestJson<T>(`https://slack.com/api/${method}`, {
    ...init,
    headers: { authorization: `Bearer ${creds.access_token}`, accept: "application/json" },
  });
  if (res.ok !== true) {
    throw new IntegrationHttpError(400, `Slack: ${res.error ?? "call failed"}`, false);
  }
  return res;
}

async function slackExecute(
  actionId: string,
  payload: Record<string, unknown>,
  creds: OAuthCredentials
): Promise<ActionResult> {
  switch (actionId) {
    case "list_channels": {
      const res = await slackCall<{ ok: boolean; channels?: { id: string; name: string }[] }>(
        "conversations.list?limit=25&types=public_channel&exclude_archived=true",
        creds
      );
      const channels = (res.channels ?? []).map((c) => ({ id: c.id, name: c.name }));
      // Channel names are workspace content — UNTRUSTED, data only.
      return {
        ok: true,
        summary: `found ${channels.length} channel${channels.length === 1 ? "" : "s"}.`,
        detail: { channels, untrusted: true },
      };
    }
    case "post_message": {
      const channel = s(payload.channel) ?? s(payload.channel_id);
      const text = s(payload.text) ?? s(payload.message);
      if (!channel || !text) return { ok: false, summary: "a post needs a channel and text." };
      await slackCall("chat.postMessage", creds, { method: "POST", body: { channel, text } });
      return { ok: true, summary: `posted to ${channel.startsWith("#") ? channel : `#${channel}`}.` };
    }
    default:
      return { ok: false, summary: "unknown Slack action." };
  }
}

export const slackProvider = makeOAuthProvider({
  key: "slack",
  name: "Slack",
  detail: "list channels and (with your signature) post messages.",
  scopeSummary: "chat:write · channels:read",
  tracks: ["channels", "messages cosigno posted"],
  authorizeUrl: "https://slack.com/oauth/v2/authorize",
  tokenUrl: "https://slack.com/api/oauth.v2.access",
  scopes: "channels:read,chat:write",
  clientIdEnv: "SLACK_CLIENT_ID",
  clientSecretEnv: "SLACK_CLIENT_SECRET",
  healthUrl: "https://slack.com/api/auth.test",
  healthLabel: (j) => (typeof j.team === "string" ? j.team : undefined),
  actions: [
    { id: "list_channels", summary: "list public channels (read-only).", mutates: false, risk: "read" },
    { id: "post_message", summary: "post a message to a channel (waits for your signature).", mutates: true, risk: "write" },
  ],
  execute: slackExecute,
});

/** Every Notion call requires an explicit API version header. */
const NOTION_VERSION = "2022-06-28";
const NOTION_API = "https://api.notion.com/v1";

function notionHeaders(creds: OAuthCredentials): Record<string, string> {
  return {
    authorization: `Bearer ${creds.access_token}`,
    accept: "application/json",
    "notion-version": NOTION_VERSION,
  };
}

async function notionExecute(
  actionId: string,
  payload: Record<string, unknown>,
  creds: OAuthCredentials
): Promise<ActionResult> {
  switch (actionId) {
    case "search_pages": {
      const query = s(payload.query) ?? s(payload.q) ?? "";
      const res = await requestJson<{ results?: { id: string }[] }>(`${NOTION_API}/search`, {
        method: "POST",
        headers: notionHeaders(creds),
        body: { query, page_size: 25, filter: { value: "page", property: "object" } },
      });
      const n = res.results?.length ?? 0;
      return { ok: true, summary: `found ${n} page${n === 1 ? "" : "s"}${query ? ` matching “${query}”` : ""}.`, detail: { count: n, untrusted: true } };
    }
    case "create_page": {
      const parent = s(payload.parent_page_id) ?? s(payload.parent_id);
      const title = s(payload.title);
      if (!parent || !title) return { ok: false, summary: "a page needs a parent page id and a title." };
      const children = s(payload.content)
        ? [{ object: "block", type: "paragraph", paragraph: { rich_text: [{ type: "text", text: { content: s(payload.content) } }] } }]
        : [];
      const created = await requestJson<{ id?: string }>(`${NOTION_API}/pages`, {
        method: "POST",
        headers: notionHeaders(creds),
        body: {
          parent: { page_id: parent },
          properties: { title: { title: [{ type: "text", text: { content: title } }] } },
          children,
        },
      });
      return { ok: true, summary: `created the page “${title}”.`, detail: { page_id: created.id } };
    }
    case "append_note": {
      const page = s(payload.page_id) ?? s(payload.id);
      const text = s(payload.text) ?? s(payload.content);
      if (!page || !text) return { ok: false, summary: "an append needs a page id and text." };
      await requestJson(`${NOTION_API}/blocks/${encodeURIComponent(page)}/children`, {
        method: "PATCH",
        headers: notionHeaders(creds),
        body: {
          children: [{ object: "block", type: "paragraph", paragraph: { rich_text: [{ type: "text", text: { content: text } }] } }],
        },
      });
      return { ok: true, summary: "appended the note to the page." };
    }
    default:
      return { ok: false, summary: "unknown Notion action." };
  }
}

export const notionProvider = makeOAuthProvider({
  key: "notion",
  name: "Notion",
  detail: "search pages and (with your signature) create pages or append notes.",
  scopeSummary: "pages you share with cosigno",
  tracks: ["pages shared with cosigno"],
  authorizeUrl: "https://api.notion.com/v1/oauth/authorize",
  tokenUrl: "https://api.notion.com/v1/oauth/token",
  scopes: "",
  tokenStyle: "json-basic",
  extraAuthParams: { owner: "user" },
  clientIdEnv: "NOTION_CLIENT_ID",
  clientSecretEnv: "NOTION_CLIENT_SECRET",
  healthUrl: "https://api.notion.com/v1/users/me",
  authHeader: (t) => ({ authorization: `Bearer ${t}`, "notion-version": NOTION_VERSION }),
  healthLabel: (j) => {
    const bot = j.bot as { owner?: { user?: { name?: string } } } | undefined;
    return bot?.owner?.user?.name ?? (typeof j.name === "string" ? j.name : undefined);
  },
  actions: [
    { id: "search_pages", summary: "search pages shared with cosigno (read-only).", mutates: false, risk: "read" },
    { id: "create_page", summary: "create a page under a parent you choose.", mutates: true, risk: "write" },
    { id: "append_note", summary: "append a note to an existing page.", mutates: true, risk: "write" },
  ],
  execute: notionExecute,
});

// Google/Gmail is a hand-written connector with real capabilities — see
// ./gmail.ts (it still uses makeOAuthProvider for the standard OAuth flow).
