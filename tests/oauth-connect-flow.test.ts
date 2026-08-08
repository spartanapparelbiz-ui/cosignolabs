import { beforeEach, describe, expect, it } from "vitest";
import { completeOAuth, redirectUri, startOAuth } from "../src/lib/integrations/oauthFlow";
import { getProvider, listProviderMeta } from "../src/lib/integrations/registry";
import { decryptSecret } from "../src/lib/integrations/crypto";
import { getStore } from "../src/lib/store";
import { MemoryStore } from "../src/lib/store/memory";
import type { IntegrationProvider, OAuthCredentials } from "../src/lib/integrations/types";

/**
 * The connect flow, end to end, for every OAuth provider — with the third
 * party stubbed and everything else real.
 *
 * What is exercised for real: state creation and persistence, CSRF rejection,
 * single-use consumption, expiry, the authorize URL each provider builds,
 * credential encryption, the connection write, the resulting status, and
 * disconnect/reconnect.
 *
 * What is NOT exercised: the provider's own authorize page and token endpoint.
 * Those need real OAuth apps and a public callback URL. Everything up to and
 * after that hop is covered here.
 */

const USER = "demo-user";

function freshStore(): MemoryStore {
  const store = new MemoryStore();
  (globalThis as unknown as { __cosignoStore?: unknown }).__cosignoStore = store;
  return store;
}
beforeEach(() => {
  freshStore();
  restoreProviders();
});

const OAUTH_PROVIDERS = listProviderMeta()
  .filter((m) => m.authType === "oauth2")
  .map((m) => m.key);

const FAKE_TOKENS: OAuthCredentials = {
  access_token: "at_test_value",
  refresh_token: "rt_test_value",
  expires_at: Math.floor(Date.now() / 1000) + 3600,
  token_type: "Bearer",
  scope: "test.scope",
};

/**
 * Stub only the two calls that leave the machine. `exchangeCode` is optional on
 * the interface, so it is replaced directly rather than through vi.spyOn —
 * which cannot type a possibly-undefined member. `vi.restoreAllMocks` does not
 * cover a direct assignment, so each test gets a fresh provider snapshot via
 * `restoreProviders` in beforeEach.
 */
type Mutable = {
  exchangeCode?: IntegrationProvider["exchangeCode"];
  healthCheck: IntegrationProvider["healthCheck"];
};

function stubProvider(
  key: string,
  opts: { exchange?: "ok" | "fail"; health?: boolean } = {}
): IntegrationProvider {
  const provider = getProvider(key);
  if (!provider) throw new Error(`no provider ${key}`);
  const m = provider as unknown as Mutable;
  m.exchangeCode =
    opts.exchange === "fail"
      ? async () => {
          throw new Error("provider said no");
        }
      : async () => FAKE_TOKENS;
  m.healthCheck = async () =>
    opts.health === false ? { ok: false } : { ok: true, label: `${provider.name} account` };
  return provider;
}

/** Snapshot every provider's real methods once, and put them back per test. */
const ORIGINALS = new Map<string, Mutable>();
function restoreProviders() {
  for (const key of OAUTH_PROVIDERS) {
    const provider = getProvider(key) as unknown as Mutable | undefined;
    if (!provider) continue;
    if (!ORIGINALS.has(key)) {
      ORIGINALS.set(key, { exchangeCode: provider.exchangeCode, healthCheck: provider.healthCheck });
      continue;
    }
    const original = ORIGINALS.get(key)!;
    provider.exchangeCode = original.exchangeCode;
    provider.healthCheck = original.healthCheck;
  }
}

describe("every OAuth provider is registered and connectable", () => {
  it("finds the providers (an empty list would pass everything below)", () => {
    expect(OAUTH_PROVIDERS.length).toBeGreaterThanOrEqual(6);
  });

  it.each(OAUTH_PROVIDERS)("%s: builds an authorize URL with state and the right redirect", async (key) => {
    const provider = getProvider(key)!;
    const url = new URL(await startOAuth(USER, provider));

    expect(url.protocol).toBe("https:");
    const state = url.searchParams.get("state");
    expect(state, "authorize URL must carry state (CSRF)").toBeTruthy();
    expect(url.searchParams.get("redirect_uri")).toBe(redirectUri(key));
    expect(redirectUri(key)).toMatch(new RegExp(`/api/connections/${key}/callback$`));

    // The state row is persisted, bound to this user and this provider.
    const row = await getStore().consumeOAuthState(state!);
    expect(row?.user_id).toBe(USER);
    expect(row?.provider_key).toBe(key);
    expect(row?.redirect_uri).toBe(redirectUri(key));
  });

  it.each(OAUTH_PROVIDERS)("%s: a full connect stores encrypted tokens and marks it connected", async (key) => {
    const provider = stubProvider(key);
    const url = new URL(await startOAuth(USER, provider));
    const state = url.searchParams.get("state")!;

    const result = await completeOAuth({ providerKey: key, code: "auth_code", state });
    expect(result.ok, `completeOAuth failed for ${key}`).toBe(true);
    if (!result.ok) return;

    const conn = result.connection;
    expect(conn.status).toBe("connected");
    expect(conn.provider_key).toBe(key);
    expect(conn.kind).toBe("app");
    expect(conn.auth_type).toBe("oauth2");

    // Credentials are stored ENCRYPTED — the plaintext must not appear.
    expect(conn.encrypted_credentials).toBeTruthy();
    expect(conn.encrypted_credentials).not.toContain(FAKE_TOKENS.access_token);
    expect(conn.encrypted_credentials).not.toContain(FAKE_TOKENS.refresh_token);

    // …and decrypt back to exactly what the provider returned, refresh token
    // included — losing that is how a connection silently dies in a month.
    const back = decryptSecret<OAuthCredentials>(conn.encrypted_credentials!);
    expect(back.access_token).toBe(FAKE_TOKENS.access_token);
    expect(back.refresh_token).toBe(FAKE_TOKENS.refresh_token);
    expect(back.expires_at).toBe(FAKE_TOKENS.expires_at);

    // It shows up as a connection for that user.
    const listed = await getStore().listConnections(USER);
    expect(listed.map((c) => c.provider_key)).toContain(key);
  });

  it.each(OAUTH_PROVIDERS)("%s: a failing health check connects as needs_reauth, not connected", async (key) => {
    const provider = stubProvider(key, { health: false });
    const url = new URL(await startOAuth(USER, provider));
    const result = await completeOAuth({
      providerKey: key,
      code: "auth_code",
      state: url.searchParams.get("state")!,
    });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.connection.status).toBe("needs_reauth");
  });
});

describe("state is the CSRF boundary and it holds", () => {
  const key = OAUTH_PROVIDERS[0];

  it("an unknown state is rejected", async () => {
    stubProvider(key);
    const out = await completeOAuth({ providerKey: key, code: "c", state: "never-issued" });
    expect(out).toEqual({ ok: false, reason: "bad_state" });
  });

  it("a state is single-use — a replayed callback is rejected", async () => {
    const provider = stubProvider(key);
    const url = new URL(await startOAuth(USER, provider));
    const state = url.searchParams.get("state")!;

    expect((await completeOAuth({ providerKey: key, code: "c", state })).ok).toBe(true);
    expect(await completeOAuth({ providerKey: key, code: "c", state })).toEqual({
      ok: false,
      reason: "bad_state",
    });
  });

  it("a state issued for one provider cannot be redeemed at another", async () => {
    const other = OAUTH_PROVIDERS.find((k) => k !== key)!;
    stubProvider(key);
    stubProvider(other);
    const url = new URL(await startOAuth(USER, getProvider(key)!));
    const out = await completeOAuth({
      providerKey: other,
      code: "c",
      state: url.searchParams.get("state")!,
    });
    expect(out).toEqual({ ok: false, reason: "bad_state" });
  });

  it("an expired state is rejected", async () => {
    const store = getStore();
    await store.createOAuthState({
      state: "stale",
      user_id: USER,
      provider_key: key,
      code_verifier: null,
      redirect_uri: redirectUri(key),
      expires_at: new Date(Date.now() - 1000).toISOString(),
    });
    expect(await completeOAuth({ providerKey: key, code: "c", state: "stale" })).toEqual({
      ok: false,
      reason: "bad_state",
    });
  });

  it("every state issued is unique", async () => {
    const provider = stubProvider(key);
    const seen = new Set<string>();
    for (let i = 0; i < 25; i++) {
      seen.add(new URL(await startOAuth(USER, provider)).searchParams.get("state")!);
    }
    expect(seen.size).toBe(25);
  });

  it("a failed token exchange reports exchange_failed and stores nothing", async () => {
    const provider = stubProvider(key, { exchange: "fail" });
    const url = new URL(await startOAuth(USER, provider));
    const out = await completeOAuth({
      providerKey: key,
      code: "c",
      state: url.searchParams.get("state")!,
    });
    expect(out).toEqual({ ok: false, reason: "exchange_failed" });
    expect(await getStore().listConnections(USER)).toHaveLength(0);
  });
});

describe("connect → disconnect → reconnect", () => {
  it.each(OAUTH_PROVIDERS)("%s survives the full cycle", async (key) => {
    const provider = stubProvider(key);

    const first = await completeOAuth({
      providerKey: key,
      code: "c1",
      state: new URL(await startOAuth(USER, provider)).searchParams.get("state")!,
    });
    expect(first.ok).toBe(true);
    if (!first.ok) return;

    await getStore().updateConnection(USER, first.connection.id, { status: "revoked" });
    const afterDisconnect = await getStore().getConnection(USER, first.connection.id);
    expect(afterDisconnect?.status).toBe("revoked");

    const second = await completeOAuth({
      providerKey: key,
      code: "c2",
      state: new URL(await startOAuth(USER, provider)).searchParams.get("state")!,
    });
    expect(second.ok, "reconnect must succeed").toBe(true);
    if (second.ok) expect(second.connection.status).toBe("connected");
  });
});
