import { createHash } from "node:crypto";
import { appUrl } from "../stripe";
import { getStore } from "../store";
import { recordSecurityEvent } from "../securityEvents";
import { encryptSecret, randomToken } from "./crypto";
import { getProvider } from "./registry";
import type { ConnectionRecord, IntegrationProvider } from "./types";

/**
 * OAuth 2.0 orchestration shared by the connect + callback routes. PKCE is
 * used for public clients (usesPkce providers); confidential clients (GitHub)
 * use the client secret. The state row carries the CSRF token + PKCE verifier
 * and is single-use: consumed on callback and never reusable.
 */

const STATE_TTL_MS = 10 * 60 * 1000;

export function redirectUri(providerKey: string): string {
  return `${appUrl()}/api/connections/${providerKey}/callback`;
}

function pkcePair(): { verifier: string; challenge: string } {
  const verifier = randomToken(32);
  const challenge = createHash("sha256").update(verifier).digest("base64url");
  return { verifier, challenge };
}

/** Begin an OAuth connect: persist state + return the provider authorize URL. */
export async function startOAuth(
  userId: string,
  provider: IntegrationProvider
): Promise<string> {
  if (!provider.buildAuthUrl) throw new Error("provider is not OAuth");
  const state = randomToken(24);
  const uri = redirectUri(provider.key);
  const pkce = provider.usesPkce ? pkcePair() : null;

  await getStore().createOAuthState({
    state,
    user_id: userId,
    provider_key: provider.key,
    code_verifier: pkce?.verifier ?? null,
    redirect_uri: uri,
    expires_at: new Date(Date.now() + STATE_TTL_MS).toISOString(),
  });

  return provider.buildAuthUrl({ state, redirectUri: uri, codeChallenge: pkce?.challenge });
}

export type OAuthOutcome =
  | { ok: true; connection: ConnectionRecord }
  | { ok: false; reason: "bad_state" | "exchange_failed" | "unknown_provider" };

/** Complete an OAuth callback: verify state, exchange code, store the connection. */
export async function completeOAuth(args: {
  providerKey: string;
  code: string;
  state: string;
}): Promise<OAuthOutcome> {
  const store = getStore();
  const stateRow = await store.consumeOAuthState(args.state);
  // State must exist, be unexpired, and match the provider it was issued for.
  // A missing/mismatched state is exactly what an account-swap or CSRF attempt
  // looks like — record it (bound to the initiating user when we know them).
  if (!stateRow || stateRow.provider_key !== args.providerKey) {
    if (stateRow?.user_id) {
      await recordSecurityEvent(stateRow.user_id, "oauth_state_rejected", {
        detail: { provider: args.providerKey },
      });
    }
    return { ok: false, reason: "bad_state" };
  }
  const provider = getProvider(args.providerKey);
  if (!provider?.exchangeCode) return { ok: false, reason: "unknown_provider" };

  try {
    const creds = await provider.exchangeCode({
      code: args.code,
      redirectUri: stateRow.redirect_uri,
      codeVerifier: stateRow.code_verifier ?? undefined,
    });
    const health = await provider.healthCheck(creds).catch(() => ({ ok: false as const }));
    const connection = await store.createConnection({
      user_id: stateRow.user_id,
      provider_key: provider.key,
      kind: "app",
      display_name: provider.name,
      auth_type: "oauth2",
      encrypted_credentials: encryptSecret(creds),
      scopes: creds.scope ?? provider.scopeSummary,
      status: health.ok ? "connected" : "needs_reauth",
      metadata: health.ok && health.label ? { account: health.label } : {},
    });
    await recordSecurityEvent(stateRow.user_id, "oauth_connected", {
      detail: { provider: provider.key, scopes: creds.scope ?? provider.scopeSummary },
    });
    return { ok: true, connection };
  } catch {
    return { ok: false, reason: "exchange_failed" };
  }
}
