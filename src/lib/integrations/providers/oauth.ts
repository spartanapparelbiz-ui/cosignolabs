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
 * `usesPkce: true` makes it a public client (no secret sent, code_challenge in
 * the authorize URL, code_verifier in the exchange). Otherwise it's a
 * confidential client using the *_CLIENT_SECRET env.
 */
export interface OAuthProviderConfig {
  key: string;
  name: string;
  detail: string;
  scopeSummary: string;
  authorizeUrl: string;
  tokenUrl: string;
  scopes: string;
  usesPkce?: boolean;
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
    usesPkce: cfg.usesPkce,

    isConfigured() {
      return Boolean(id() && (cfg.usesPkce || secret()));
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
        client_id: id() ?? "",
        grant_type: "authorization_code",
        code,
        redirect_uri: redirectUri,
      };
      if (cfg.usesPkce) {
        if (codeVerifier) body.code_verifier = codeVerifier;
      } else if (secret()) {
        body.client_secret = secret() as string;
      }
      const res = await requestJson<Record<string, unknown>>(cfg.tokenUrl, {
        method: "POST",
        form: true,
        headers: { accept: "application/json" },
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
        client_id: id() ?? "",
        grant_type: "refresh_token",
        refresh_token: creds.refresh_token,
      };
      if (!cfg.usesPkce && secret()) body.client_secret = secret() as string;
      const res = await requestJson<Record<string, unknown>>(cfg.tokenUrl, {
        method: "POST",
        form: true,
        headers: { accept: "application/json" },
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

export const slackProvider = makeOAuthProvider({
  key: "slack",
  name: "Slack",
  detail: "post messages and read channels you authorize (posts wait for approval).",
  scopeSummary: "chat:write · channels:read",
  authorizeUrl: "https://slack.com/oauth/v2/authorize",
  tokenUrl: "https://slack.com/api/oauth.v2.access",
  scopes: "channels:read,chat:write",
  clientIdEnv: "SLACK_CLIENT_ID",
  clientSecretEnv: "SLACK_CLIENT_SECRET",
  healthUrl: "https://slack.com/api/auth.test",
  healthLabel: (j) => (typeof j.team === "string" ? j.team : undefined),
  actions: [{ id: "auth_test", summary: "confirm the Slack workspace.", mutates: false }],
});

export const notionProvider = makeOAuthProvider({
  key: "notion",
  name: "Notion",
  detail: "read and update pages in the workspace you authorize.",
  scopeSummary: "read · update pages",
  authorizeUrl: "https://api.notion.com/v1/oauth/authorize",
  tokenUrl: "https://api.notion.com/v1/oauth/token",
  scopes: "",
  extraAuthParams: { owner: "user" },
  clientIdEnv: "NOTION_CLIENT_ID",
  clientSecretEnv: "NOTION_CLIENT_SECRET",
  healthUrl: "https://api.notion.com/v1/users/me",
  healthLabel: (j) => {
    const bot = j.bot as { owner?: { user?: { name?: string } } } | undefined;
    return bot?.owner?.user?.name ?? (typeof j.name === "string" ? j.name : undefined);
  },
  actions: [{ id: "whoami", summary: "confirm the Notion workspace.", mutates: false }],
});

export const googleProvider = makeOAuthProvider({
  key: "google",
  name: "Google",
  detail: "Gmail, Calendar and Drive — reads by default; sends/edits wait for approval.",
  scopeSummary: "gmail · calendar · drive (read)",
  authorizeUrl: "https://accounts.google.com/o/oauth2/v2/auth",
  tokenUrl: "https://oauth2.googleapis.com/token",
  scopes:
    "https://www.googleapis.com/auth/userinfo.email https://www.googleapis.com/auth/gmail.readonly",
  usesPkce: true,
  extraAuthParams: { access_type: "offline", prompt: "consent" },
  clientIdEnv: "GOOGLE_CLIENT_ID",
  clientSecretEnv: "GOOGLE_CLIENT_SECRET",
  healthUrl: "https://www.googleapis.com/oauth2/v3/userinfo",
  healthLabel: (j) => (typeof j.email === "string" ? j.email : undefined),
  actions: [{ id: "whoami", summary: "confirm the Google account.", mutates: false }],
});
