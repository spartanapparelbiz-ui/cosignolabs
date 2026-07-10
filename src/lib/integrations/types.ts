/**
 * Integration layer types. The DEFINITION side (providers, metadata, auth
 * type) is deliberately separate from the RUNTIME side (a user's live
 * connections and the secrets behind them). A provider is static, shared, and
 * secret-free; a connection is per-user and holds encrypted credentials.
 */

export type AuthType = "oauth2" | "apikey" | "mcp_remote";

/** How a connection is doing right now — surfaced verbatim in the UI. */
export type ConnectionStatus =
  | "connected"
  | "needs_reauth"
  | "error"
  | "revoked";

export type ConnectionKind = "app" | "mcp";

export type McpTransport = "http" | "sse";

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
}
