import type {
  ActionResult,
  Credentials,
  DiscoveredFact,
  DiscoveryResult,
  IntegrationProvider,
  OAuthCredentials,
  ProviderAction,
} from "../types";
import { IntegrationHttpError, requestJson } from "../runtime/httpClient";

/**
 * GitHub connector — the reference OAuth 2.0 integration. GitHub OAuth Apps
 * are confidential clients (client secret, no PKCE); GitHub *Apps* may issue
 * expiring user tokens with refresh tokens, which we support when present.
 *
 * Setup (see INTEGRATIONS.md): create an OAuth App, set
 *   GITHUB_CLIENT_ID / GITHUB_CLIENT_SECRET
 * and add the callback URL  <site>/api/integrations/github/callback .
 * The client secret is read server-side only and never reaches the browser.
 */

const AUTHORIZE = "https://github.com/login/oauth/authorize";
const TOKEN = "https://github.com/login/oauth/access_token";
const API = "https://api.github.com";
// Least-privilege default: read user + repo. Tighten/loosen per your needs.
const SCOPES = "read:user repo";

function clientId(): string | undefined {
  return process.env.GITHUB_CLIENT_ID?.trim() || undefined;
}
function clientSecret(): string | undefined {
  return process.env.GITHUB_CLIENT_SECRET?.trim() || undefined;
}

function ghHeaders(token: string): Record<string, string> {
  return {
    authorization: `Bearer ${token}`,
    accept: "application/vnd.github+json",
    "x-github-api-version": "2022-11-28",
    "user-agent": "cosigno",
  };
}

function asOAuth(creds: Credentials): OAuthCredentials {
  const c = creds as OAuthCredentials;
  if (!c || typeof c.access_token !== "string") {
    throw new IntegrationHttpError(401, "missing access token", false);
  }
  return c;
}

/**
 * Read-only inventory of the connected GitHub account.
 *
 * Every number here is an EXACT total reported by GitHub, never a count of
 * whatever fitted on one page. `/user` carries real repository totals, and the
 * search API's `total_count` is authoritative — listing endpoints cap at 100
 * per page, so counting rows there would publish "100" for an account with
 * thousands and look entirely credible while being wrong.
 *
 * Each label states exactly what was counted. A partial failure degrades to a
 * named limitation rather than a missing-but-unexplained row: a fact that is
 * absent for an unstated reason reads as "zero" to most people.
 */
async function discoverGithub(creds: Credentials): Promise<DiscoveryResult> {
  const token = asOAuth(creds).access_token;
  const headers = ghHeaders(token);

  let login: string;
  let facts: DiscoveredFact[];
  const limitations: string[] = [];

  try {
    const me = await requestJson<{
      login: string;
      public_repos?: number;
      total_private_repos?: number;
      owned_private_repos?: number;
    }>(`${API}/user`, { headers });
    login = me.login;
    // total_private_repos is only present on some token/plan combinations;
    // owned_private_repos is the fallback, and neither being present is a
    // stated limitation rather than a silent zero.
    const priv = me.total_private_repos ?? me.owned_private_repos;
    if (priv === undefined) {
      limitations.push("this token can't see private repositories, so the count covers public ones only.");
    }
    facts = [{ label: "repositories you own", value: (me.public_repos ?? 0) + (priv ?? 0) }];
  } catch (err) {
    return {
      ok: false,
      facts: [],
      limitations: [],
      error:
        err instanceof IntegrationHttpError && err.status === 401
          ? "GitHub rejected the saved token. reconnect the account."
          : "couldn't read your GitHub account just now.",
    };
  }

  // Search totals are exact. Each is independent: one failing must not blank
  // the others, and the gap is named.
  const searches: Array<{ label: string; q: string }> = [
    { label: "open issues you opened", q: `is:issue is:open author:${login}` },
    { label: "open pull requests you opened", q: `is:pr is:open author:${login}` },
    { label: "open issues assigned to you", q: `is:issue is:open assignee:${login}` },
  ];

  for (const s of searches) {
    try {
      const res = await requestJson<{ total_count: number; incomplete_results?: boolean }>(
        `${API}/search/issues?q=${encodeURIComponent(s.q)}&per_page=1`,
        { headers }
      );
      facts.push({
        label: s.label,
        value: res.total_count,
        // GitHub sets this when the search timed out and the total is a floor.
        ...(res.incomplete_results ? { atLeast: true } : {}),
      });
    } catch {
      limitations.push(`couldn't count ${s.label} — GitHub's search API didn't answer.`);
    }
  }

  return { ok: true, account: login, facts, limitations };
}

const ACTIONS: ProviderAction[] = [
  { id: "whoami", summary: "read your GitHub profile (login, name).", mutates: false },
  { id: "list_repos", summary: "list your most recently pushed repositories.", mutates: false },
  { id: "list_issues", summary: "list open issues in a repository you name.", mutates: false },
  { id: "create_issue", summary: "open a new issue in a repository you name.", mutates: true },
];

export const githubProvider: IntegrationProvider = {
  key: "github",
  name: "GitHub",
  detail: "read your repos and issues; open issues (always with your approval).",
  authType: "oauth2",
  scopeSummary: "read profile · read/write issues · repo",
  usesPkce: false,

  isConfigured() {
    return Boolean(clientId() && clientSecret());
  },

  buildAuthUrl({ state, redirectUri }) {
    const params = new URLSearchParams({
      client_id: clientId() ?? "",
      redirect_uri: redirectUri,
      scope: SCOPES,
      state,
      allow_signup: "false",
    });
    return `${AUTHORIZE}?${params.toString()}`;
  },

  async exchangeCode({ code, redirectUri }) {
    const res = await requestJson<{
      access_token?: string;
      token_type?: string;
      scope?: string;
      refresh_token?: string;
      expires_in?: number;
      error?: string;
      error_description?: string;
    }>(TOKEN, {
      method: "POST",
      form: true,
      headers: { accept: "application/json" },
      body: {
        client_id: clientId() ?? "",
        client_secret: clientSecret() ?? "",
        code,
        redirect_uri: redirectUri,
      },
    });
    if (!res.access_token) {
      throw new IntegrationHttpError(400, res.error || "token exchange failed", false);
    }
    return {
      access_token: res.access_token,
      refresh_token: res.refresh_token,
      token_type: res.token_type,
      scope: res.scope,
      expires_at: res.expires_in ? Math.floor(Date.now() / 1000) + res.expires_in : undefined,
    };
  },

  async refresh(creds) {
    if (!creds.refresh_token) {
      // Classic OAuth App tokens don't expire — nothing to refresh.
      throw new IntegrationHttpError(400, "no refresh token", false);
    }
    const res = await requestJson<{
      access_token?: string;
      refresh_token?: string;
      expires_in?: number;
      token_type?: string;
      scope?: string;
      error?: string;
    }>(TOKEN, {
      method: "POST",
      form: true,
      headers: { accept: "application/json" },
      body: {
        client_id: clientId() ?? "",
        client_secret: clientSecret() ?? "",
        grant_type: "refresh_token",
        refresh_token: creds.refresh_token,
      },
    });
    if (!res.access_token) {
      throw new IntegrationHttpError(401, res.error || "refresh failed", false);
    }
    return {
      access_token: res.access_token,
      refresh_token: res.refresh_token ?? creds.refresh_token,
      token_type: res.token_type,
      scope: res.scope,
      expires_at: res.expires_in ? Math.floor(Date.now() / 1000) + res.expires_in : undefined,
    };
  },

  async revoke(creds) {
    const id = clientId();
    const secret = clientSecret();
    if (!id || !secret) return;
    // Delete the token grant (best-effort; ignore failures on disconnect).
    await requestJson(`${API}/applications/${id}/grant`, {
      method: "DELETE",
      retries: 1,
      headers: {
        accept: "application/vnd.github+json",
        authorization: `Basic ${Buffer.from(`${id}:${secret}`).toString("base64")}`,
        "user-agent": "cosigno",
      },
      body: { access_token: creds.access_token },
    }).catch(() => undefined);
  },

  discover: discoverGithub,

  async healthCheck(creds) {
    try {
      const me = await requestJson<{ login?: string }>(`${API}/user`, {
        headers: ghHeaders(asOAuth(creds).access_token),
        retries: 2,
      });
      return { ok: Boolean(me.login), label: me.login };
    } catch {
      return { ok: false };
    }
  },

  listActions() {
    return ACTIONS;
  },

  async execute(actionId, payload, creds): Promise<ActionResult> {
    const token = asOAuth(creds).access_token;
    const headers = ghHeaders(token);
    switch (actionId) {
      case "whoami": {
        const me = await requestJson<{ login: string; name?: string }>(`${API}/user`, { headers });
        return { ok: true, summary: `signed in as ${me.login}`, detail: { login: me.login, name: me.name } };
      }
      case "list_repos": {
        const repos = await requestJson<Array<{ full_name: string; private: boolean }>>(
          `${API}/user/repos?sort=pushed&per_page=10`,
          { headers }
        );
        return {
          ok: true,
          summary: `found ${repos.length} recent repositories.`,
          detail: { repos: repos.map((r) => r.full_name) },
        };
      }
      case "list_issues": {
        const repo = String(payload.repo ?? "").trim();
        if (!/^[\w.-]+\/[\w.-]+$/.test(repo)) {
          return { ok: false, summary: "give a repository as owner/name." };
        }
        const issues = await requestJson<Array<{ number: number; title: string }>>(
          `${API}/repos/${repo}/issues?state=open&per_page=10`,
          { headers }
        );
        return {
          ok: true,
          summary: `${issues.length} open issues in ${repo}.`,
          detail: { issues: issues.map((i) => `#${i.number} ${i.title}`) },
        };
      }
      case "create_issue": {
        const repo = String(payload.repo ?? "").trim();
        const title = String(payload.title ?? "").trim();
        if (!/^[\w.-]+\/[\w.-]+$/.test(repo) || !title) {
          return { ok: false, summary: "need a repository (owner/name) and a title." };
        }
        const issue = await requestJson<{ number: number; html_url: string }>(
          `${API}/repos/${repo}/issues`,
          {
            method: "POST",
            headers,
            body: {
              title,
              body: typeof payload.body === "string" ? payload.body.slice(0, 8000) : undefined,
            },
          }
        );
        return {
          ok: true,
          summary: `opened issue #${issue.number} in ${repo}.`,
          detail: { url: issue.html_url },
        };
      }
      default:
        return { ok: false, summary: "unknown GitHub action." };
    }
  },
};
