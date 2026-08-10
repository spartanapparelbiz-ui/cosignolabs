/**
 * Integration layer types. The DEFINITION side (providers, metadata, auth
 * type) is deliberately separate from the RUNTIME side (a user's live
 * connections and the secrets behind them). A provider is static, shared, and
 * secret-free; a connection is per-user and holds encrypted credentials.
 */

export type AuthType = "oauth2" | "apikey" | "mcp_remote" | "mcp_local";

/**
 * How a connection is doing right now — surfaced verbatim in the UI.
 *
 * `pending` is the honest state for a connection that is correctly configured
 * but not yet reachable — today that means a local-process (stdio) MCP server,
 * which cosigno cannot connect to from a hosted environment. It exists so that
 * "we can't run this yet" never has to borrow `error`, which tells the user
 * they did something wrong when they didn't.
 *
 * The transient states people see while working — connecting, testing, running,
 * streaming — are deliberately NOT here. They belong to a request in flight,
 * not to a stored row, and persisting them would leave a connection stuck
 * "running" forever the moment a serverless function is recycled mid-call.
 */
export type ConnectionStatus =
  | "connected"
  | "needs_reauth"
  | "error"
  | "revoked"
  | "pending";

export type ConnectionKind = "app" | "mcp" | "custom";

/** Where a custom API connector places its API key on each request. */
export type CustomAuthPlacement = "bearer" | "header" | "query";

/**
 * One user-mapped action on a generic API-key connector. `risk` is the
 * SERVER-assigned safe default (read/write/destructive → tier 1/2/3); the user
 * may raise it (more restrictive), never lower it. `path` is appended to the
 * connection's base_url and may contain {name} placeholders filled from args.
 */
export interface CustomApiAction {
  id: string;
  summary: string;
  method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  path: string;
  risk: CapabilityRisk;
}

/** Non-secret config for a generic API-key connector, stored in metadata. */
export interface CustomApiConfig {
  base_url: string;
  auth: { placement: CustomAuthPlacement; name?: string };
  actions: CustomApiAction[];
}

/**
 * How cosigno talks to an MCP server. "http" (Streamable HTTP) and "sse" are
 * remote and reachable from the server. "stdio" is a local process: parsed,
 * stored and displayed, but not runnable from a hosted deployment — see the
 * `pending` connection status.
 */
export type McpTransport = "http" | "sse" | "stdio";

/** A typed action a provider exposes to the rest of the app. */
/**
 * The risk class a capability declares. The SERVER maps this to an approval
 * tier (read→1, write→2, destructive→3); a connector cannot pick its own tier,
 * and if it declares one lower than the server's rule it is clamped + flagged.
 */
export type CapabilityRisk = "read" | "write" | "destructive";

export interface ProviderAction {
  /** Stable id, unique within the provider (e.g. "create_issue"). */
  id: string;
  /** One plain sentence: what it does. */
  summary: string;
  /** Does it change the outside world? Drives the default approval tier. */
  mutates: boolean;
  /**
   * Risk class → server tier. If omitted it's derived from `mutates`
   * (read when false, write when true) so existing providers keep working.
   */
  risk?: CapabilityRisk;
}

/**
 * One measured fact about a connected account.
 *
 * `label` must say precisely what was counted. "136 pull requests" invites the
 * reader to supply their own meaning; "open pull requests you opened" cannot be
 * misread. A number whose meaning is fuzzy is a soft form of made-up data.
 */
export interface DiscoveredFact {
  label: string;
  value: number;
  /**
   * True when the API capped the result and the real number is at least this.
   * Rendered as "100+" rather than "100" — reporting a page size as a total is
   * the easiest way to publish a confidently wrong number.
   */
  atLeast?: boolean;
}

/**
 * The result of inspecting a live connection. Every field is measured; there
 * is no path that produces an example value.
 */
export interface DiscoveryResult {
  ok: boolean;
  /** Account label the facts belong to, e.g. a GitHub login. */
  account?: string;
  facts: DiscoveredFact[];
  /**
   * What could NOT be determined, in plain language. Stating the gap is
   * required whenever discovery is partial — the brief's rule is to name the
   * limitation instead of inventing data to fill it.
   */
  limitations: string[];
  /** Present when discovery failed outright; already human-readable. */
  error?: string;
}

export interface ActionResult {
  ok: boolean;
  summary: string;
  detail?: Record<string, unknown>;
}

/** Decrypted credential shape carried in memory only — never serialized to a client. */
export interface OAuthCredentials {
  access_token: string;
  refresh_token?: string;
  /** unix seconds when the access token expires (absent = non-expiring). */
  expires_at?: number;
  token_type?: string;
  scope?: string;
}

export interface ApiKeyCredentials {
  api_key: string;
}

export interface McpCredentials {
  /** Bearer token or raw header value, if the server requires auth. */
  bearer?: string;
  /** Extra static headers (already validated as safe key/value strings). */
  headers?: Record<string, string>;
}

export type Credentials =
  | OAuthCredentials
  | ApiKeyCredentials
  | McpCredentials
  | Record<string, never>;

/**
 * The provider contract — every third-party app implements this. It is pure
 * definition + stateless helpers: it receives credentials, it never stores
 * them. OAuth providers implement the auth methods; api-key providers only
 * need `healthCheck` + `execute`.
 */
export interface IntegrationProvider {
  key: string;
  name: string;
  /** One line shown on the card. */
  detail: string;
  authType: AuthType;
  /** Human-readable scope summary for the card. */
  scopeSummary: string;
  /**
   * Where the app itself lives, so "open GitHub" goes to GitHub. A stable,
   * publicly-known address — never derived from a user's data, and omitted
   * rather than guessed for connectors without an obvious home.
   */
  homeUrl?: string;
  /**
   * What this connector would put on the dashboard, in business words —
   * "revenue", "open issues", "unread mail".
   *
   * Used for the INVITATION shown when it isn't connected: "Connect Stripe to
   * track revenue, refunds and customer payments here." That card must never
   * be a metric showing zero, because "$0 revenue" reads as a measurement of
   * an empty business rather than the absence of a connection.
   */
  tracks?: string[];
  /**
   * The environment variable NAMES this connector needs before it can be
   * connected. Names only — never values, and this is surfaced to the client
   * so a failure can say exactly what is missing instead of "not available".
   */
  setupEnv?: string[];
  /** True once its required env (client id/secret, etc.) is present. */
  isConfigured(): boolean;

  /** OAuth: build the provider authorize URL for this attempt. */
  buildAuthUrl?(args: {
    state: string;
    redirectUri: string;
    codeChallenge?: string;
  }): string;
  /** OAuth: exchange an authorization code for tokens. */
  exchangeCode?(args: {
    code: string;
    redirectUri: string;
    codeVerifier?: string;
  }): Promise<OAuthCredentials>;
  /** OAuth: refresh an expired access token; returns fresh credentials. */
  refresh?(creds: OAuthCredentials): Promise<OAuthCredentials>;
  /** OAuth: best-effort token revocation on disconnect. */
  revoke?(creds: OAuthCredentials): Promise<void>;

  /**
   * Read-only inventory of what this account actually contains, run right
   * after connecting. OPTIONAL: a provider that can't discover simply doesn't
   * implement it, and the UI says discovery isn't available for it. That is
   * the entire point — a missing implementation must degrade to an honest
   * blank, never to plausible-looking numbers.
   */
  discover?(creds: Credentials): Promise<DiscoveryResult>;

  /** Confirm the credentials still work; returns a short account label. */
  healthCheck(creds: Credentials): Promise<{ ok: boolean; label?: string }>;
  /** The typed actions this provider exposes. */
  listActions(): ProviderAction[];
  /** Run one action. Only ever called after server-side approval. */
  execute(
    actionId: string,
    payload: Record<string, unknown>,
    creds: Credentials
  ): Promise<ActionResult>;

  /** Whether PKCE is used (public client) vs a confidential client secret. */
  usesPkce?: boolean;
}

/** A user's live connection to a provider or a custom MCP server (DB row). */
export interface ConnectionRecord {
  id: string;
  user_id: string;
  provider_key: string; // provider key, or "mcp" for custom servers
  kind: ConnectionKind;
  display_name: string;
  status: ConnectionStatus;
  auth_type: AuthType;
  /** AES-256-GCM ciphertext. Server-side only — NEVER sent to a client. */
  encrypted_credentials: string | null;
  scopes: string | null;
  /** Non-secret metadata (mcp url/transport, account label, error note…). */
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
  last_health_at: string | null;
}

/** The client-safe projection of a connection (NO user id, NO credentials). */
export type ConnectionView = Omit<ConnectionRecord, "user_id" | "encrypted_credentials">;

/** A tool advertised by a connected MCP server, after validation + caching. */
export interface McpToolRecord {
  connection_id: string;
  name: string;
  description: string;
  input_schema: Record<string, unknown>;
  /** Off until the user explicitly enables it. */
  enabled: boolean;
  /** Heuristically flagged as reading sensitive data or performing writes. */
  sensitive: boolean;
  /** When the user consented (required before a sensitive tool is callable). */
  consented_at: string | null;
  /**
   * What kind of thing this tool does — one of the nine categories in
   * ./mcp/classify. The server maps it to an approval tier; no connector picks
   * its own. Null only for rows written before classification existed, which
   * fall back to the name-based rule in ./tiers.
   */
  category: string | null;
  /** 0–1: how decisive the classifier was. Null for user-set categories. */
  confidence: number | null;
  /**
   * "auto" — cosigno classified it. "user" — a human settled it, and
   * re-discovery must not overwrite their answer.
   */
  classified_by: "auto" | "user" | null;
}
