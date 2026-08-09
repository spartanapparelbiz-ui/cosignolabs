import { getStore } from "../../store";
import { logError, logSecurity, newRequestId } from "../../log";
import { decryptSecret, encryptSecret } from "../crypto";
import { getProvider } from "../registry";
import { callTool, handshakeAndList, McpError, type McpConfig } from "../mcp/client";
import { isCallable } from "../mcp/consent";
import type {
  ActionResult,
  ConnectionRecord,
  ConnectionView,
  Credentials,
  DiscoveryResult,
  McpCredentials,
  OAuthCredentials,
} from "../types";

/**
 * The runtime hub: it turns a stored (encrypted) connection into live,
 * authenticated calls. Credentials are decrypted here and never leave the
 * server; OAuth access tokens are refreshed transparently and re-encrypted;
 * failures flip the connection's status so the UI can show a re-auth path.
 * Nothing here is called until the approval engine has cleared an action.
 */

/** Strip a connection down to what a client may see (no secrets, no user id). */
export function toView(c: ConnectionRecord): ConnectionView {
  const { user_id, encrypted_credentials, ...view } = c;
  void user_id;
  void encrypted_credentials;
  return view;
}

function decryptCreds(c: ConnectionRecord): Credentials {
  if (!c.encrypted_credentials) return {};
  try {
    return decryptSecret<Credentials>(c.encrypted_credentials);
  } catch (err) {
    // A decrypt failure means a tampered blob or a rotated key — never leak it.
    logError(newRequestId(), err, { event: "credential_decrypt_failed", connectionId: c.id });
    throw new Error("credentials_unavailable");
  }
}

/**
 * Return OAuth credentials, refreshing (and persisting) if the access token
 * has expired. On refresh failure the connection is flagged needs_reauth.
 */
async function freshOAuth(
  userId: string,
  c: ConnectionRecord,
  creds: OAuthCredentials
): Promise<OAuthCredentials> {
  const provider = getProvider(c.provider_key);
  const expired = creds.expires_at && creds.expires_at * 1000 < Date.now() + 30_000;
  if (!expired || !provider?.refresh || !creds.refresh_token) return creds;
  try {
    const next = await provider.refresh(creds);
    await getStore().updateConnection(userId, c.id, {
      encrypted_credentials: encryptSecret(next),
      status: "connected",
    });
    return next;
  } catch {
    await getStore().updateConnection(userId, c.id, { status: "needs_reauth" });
    throw new Error("needs_reauth");
  }
}

/** Build the MCP transport config from a connection's metadata + secret. */
function mcpConfig(c: ConnectionRecord): McpConfig {
  const creds = decryptCreds(c) as McpCredentials;
  const url = String((c.metadata as { url?: string }).url ?? "");
  const transport = (c.metadata as { transport?: "http" | "sse" }).transport ?? "http";
  return { url, transport, bearer: creds.bearer, headers: creds.headers };
}

/** Health-check a connection and persist the resulting status + timestamp. */
export async function checkHealth(
  userId: string,
  connectionId: string
): Promise<{ status: ConnectionRecord["status"]; label?: string }> {
  const store = getStore();
  const c = await store.getConnection(userId, connectionId);
  if (!c) throw new Error("not_found");
  const now = new Date().toISOString();

  try {
    if (c.kind === "mcp") {
      await handshakeAndList(mcpConfig(c), 8000);
      await store.updateConnection(userId, connectionId, { status: "connected", last_health_at: now });
      return { status: "connected" };
    }
    const provider = getProvider(c.provider_key);
    if (!provider) throw new Error("unknown provider");
    const creds = await freshOAuth(userId, c, decryptCreds(c) as OAuthCredentials).catch(() => {
      throw new Error("needs_reauth");
    });
    const res = await provider.healthCheck(creds);
    const status = res.ok ? "connected" : "needs_reauth";
    await store.updateConnection(userId, connectionId, {
      status,
      last_health_at: now,
      ...(res.label ? { metadata: { ...c.metadata, account: res.label } } : {}),
    });
    return { status, label: res.label };
  } catch (err) {
    const status = err instanceof Error && err.message === "needs_reauth" ? "needs_reauth" : "error";
    const note =
      err instanceof McpError ? err.kind : err instanceof Error ? err.message.slice(0, 60) : "error";
    await store.updateConnection(userId, connectionId, {
      status,
      last_health_at: now,
      metadata: { ...c.metadata, last_error: note },
    });
    return { status };
  }
}

/** Run a typed provider action (third-party app). Post-approval only. */
export async function runProviderAction(
  userId: string,
  connectionId: string,
  actionId: string,
  payload: Record<string, unknown>
): Promise<ActionResult> {
  const store = getStore();
  const c = await store.getConnection(userId, connectionId);
  if (!c || c.kind !== "app") return { ok: false, summary: "Connection not found." };
  if (c.status === "revoked") return { ok: false, summary: "This connection was disconnected." };
  const provider = getProvider(c.provider_key);
  if (!provider) return { ok: false, summary: "Unknown provider." };

  try {
    let creds = decryptCreds(c);
    if (c.auth_type === "oauth2") creds = await freshOAuth(userId, c, creds as OAuthCredentials);
    return await provider.execute(actionId, payload, creds);
  } catch (err) {
    if (err instanceof Error && err.message === "needs_reauth") {
      return { ok: false, summary: "This connection needs to be reconnected." };
    }
    logError(newRequestId(), err, { event: "provider_action_failed", provider: c.provider_key });
    return { ok: false, summary: "The provider call didn't go through." };
  }
}

/**
 * Inspect a live connection and report what the account actually contains.
 *
 * Strictly read-only, so it needs no approval — but it still goes through the
 * same credential path as any provider call, including OAuth refresh, so a
 * stale token surfaces as "reconnect" rather than an empty inventory that
 * looks like an empty account.
 *
 * A provider without `discover` returns ok:false with a stated reason. There
 * is deliberately no generic fallback that guesses at contents: for a screen
 * whose whole job is telling the user what is really there, "we don't know
 * yet" is the only honest answer when we don't.
 */
export async function discoverConnection(
  userId: string,
  connectionId: string
): Promise<DiscoveryResult> {
  const none = (error: string): DiscoveryResult => ({ ok: false, facts: [], limitations: [], error });

  const store = getStore();
  const c = await store.getConnection(userId, connectionId);
  if (!c || c.kind !== "app") return none("connection not found.");
  if (c.status === "revoked") return none("this connection was disconnected.");
  const provider = getProvider(c.provider_key);
  if (!provider) return none("unknown provider.");
  if (!provider.discover) {
    return none(`cosigno can't inventory ${provider.name} yet — its actions still work.`);
  }

  try {
    let creds = decryptCreds(c);
    if (c.auth_type === "oauth2") creds = await freshOAuth(userId, c, creds as OAuthCredentials);
    return await provider.discover(creds);
  } catch (err) {
    if (err instanceof Error && err.message === "needs_reauth") {
      return none(`${provider.name} needs to be reconnected before cosigno can read it.`);
    }
    logError(newRequestId(), err, { event: "discovery_failed", provider: c.provider_key });
    return none(`couldn't read your ${provider.name} account just now.`);
  }
}

/** Call an MCP tool. Enforces enable + consent again at the last mile. Post-approval only. */
export async function runMcpTool(
  userId: string,
  connectionId: string,
  toolName: string,
  args: Record<string, unknown>
): Promise<ActionResult> {
  const store = getStore();
  const c = await store.getConnection(userId, connectionId);
  if (!c || c.kind !== "mcp") return { ok: false, summary: "MCP connection not found." };
  const tool = await store.getMcpTool(userId, connectionId, toolName);
  if (!tool) return { ok: false, summary: "That tool isn't on this server anymore." };
  // Belt-and-suspenders: consent is checked at enable time AND here.
  if (!isCallable(tool)) {
    logSecurity("injection_approval_blocked", { connectionId, tool: toolName, reason: "not_consented" });
    return { ok: false, summary: "This tool isn't enabled/consented." };
  }
  try {
    const res = await callTool(mcpConfig(c), toolName, args);
    // MCP output is UNTRUSTED — return it as data, never as instructions.
    return {
      ok: res.ok,
      summary: res.ok ? `ran ${toolName} on ${c.display_name}.` : `${toolName} reported an error.`,
      detail: { output: res.text, untrusted: true },
    };
  } catch (err) {
    if (err instanceof McpError && err.kind === "auth") {
      await store.updateConnection(userId, connectionId, { status: "needs_reauth" });
      return { ok: false, summary: "The MCP server needs re-authentication." };
    }
    const kind = err instanceof McpError ? err.kind : "error";
    return { ok: false, summary: `Couldn't reach the MCP tool (${kind}).` };
  }
}

/** Disconnect: best-effort provider revoke, then hard-delete the row + tools. */
export async function disconnect(userId: string, connectionId: string): Promise<void> {
  const store = getStore();
  const c = await store.getConnection(userId, connectionId);
  if (!c) return;
  if (c.kind === "app" && c.auth_type === "oauth2") {
    const provider = getProvider(c.provider_key);
    try {
      if (provider?.revoke) await provider.revoke(decryptCreds(c) as OAuthCredentials);
    } catch {
      /* best-effort — we delete the local secret regardless */
    }
  }
  // Deleting the row immediately invalidates the stored (encrypted) tokens.
  await store.deleteConnection(userId, connectionId);
}
