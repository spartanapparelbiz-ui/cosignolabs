import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { gmailProvider } from "@/lib/integrations/providers/gmail";
import { runProviderAction } from "@/lib/integrations/runtime/connections";
import { completeOAuth } from "@/lib/integrations/oauthFlow";
import { executeAction } from "@/lib/actions/executor";
import { encryptSecret } from "@/lib/integrations/crypto";
import { MemoryStore } from "../../src/lib/store/memory";

/**
 * Multi-tenant Gmail: one shared Google OAuth app, per-user tokens. The
 * guarantees proven here are the ones that make "works for all users" safe:
 *   - a user's Gmail actions only ever touch THAT user's connection,
 *   - the confidential (Google web app) token exchange actually sends the
 *     client secret — the bug that made "connect" silently fail,
 *   - missing Google env → the connector is cleanly "unavailable", no crash,
 *   - stored tokens never surface in a client view or a log line.
 */

const SECRET_A = "ya29.USER-A-SECRET-TOKEN";
const SECRET_B = "ya29.USER-B-SECRET-TOKEN";

let store: MemoryStore;
beforeEach(() => {
  store = new MemoryStore();
  (globalThis as Record<string, unknown>).__cosignoStore = store;
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

async function connectGmailFor(userId: string, token: string): Promise<string> {
  const c = await store.createConnection({
    user_id: userId,
    provider_key: "google",
    kind: "app",
    display_name: "Gmail",
    auth_type: "oauth2",
    encrypted_credentials: encryptSecret({ access_token: token, refresh_token: `${userId}-r` }),
    scopes: "gmail.modify",
    status: "connected",
  });
  return c.id;
}

/* -------------------------------------------------- per-user isolation */
describe("a user's Gmail actions only touch their OWN account", () => {
  it("user A cannot run an action against user B's Gmail connection", async () => {
    const bConn = await connectGmailFor("user-b", SECRET_B);

    // Directly through the runtime: A references B's connection id.
    const viaRuntime = await runProviderAction("user-a", bConn, "search_messages", { query: "x" });
    expect(viaRuntime.ok).toBe(false);
    expect(viaRuntime.summary).toMatch(/connection not found/i);

    // And through the executor's connection_call path with A as the actor.
    const viaExecutor = await executeAction(
      "connection_call",
      { connection_id: bConn, action: "search_messages", args: { query: "x" } },
      { userId: "user-a" }
    );
    expect(viaExecutor.ok).toBe(false);
    expect(viaExecutor.summary).toMatch(/connection not found|missing connection/i);
  });

  it("each user's own connection is the only one they can act through", async () => {
    const aConn = await connectGmailFor("user-a", SECRET_A);
    await connectGmailFor("user-b", SECRET_B);
    // A can load A's; B's id is invisible to A.
    expect(await store.getConnection("user-a", aConn)).not.toBeNull();
    const bList = await store.listConnections("user-b");
    expect(await store.getConnection("user-a", bList[0].id)).toBeNull();
  });
});

/* -------------------------------------------------- confidential exchange */
describe("the Google web-app token exchange sends the client secret", () => {
  it("exchangeCode posts client_id + client_secret (+ code_verifier)", async () => {
    vi.stubEnv("GOOGLE_CLIENT_ID", "shared-app-id");
    vi.stubEnv("GOOGLE_CLIENT_SECRET", "shared-app-secret");
    let sentBody = "";
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url: string, init: RequestInit) => {
        sentBody = String(init.body);
        return {
          ok: true,
          status: 200,
          headers: { get: () => null },
          text: async () => JSON.stringify({ access_token: "at", refresh_token: "rt", expires_in: 3600 }),
        } as unknown as Response;
      })
    );
    const creds = await gmailProvider.exchangeCode!({
      code: "auth-code",
      redirectUri: "https://cosignolabs.com/api/connections/google/callback",
      codeVerifier: "verifier-123",
    });
    expect(creds.access_token).toBe("at");
    expect(sentBody).toContain("client_id=shared-app-id");
    expect(sentBody).toContain("client_secret=shared-app-secret");
    expect(sentBody).toContain("code_verifier=verifier-123");
  });

  it("completeOAuth stores the tokens for the user who STARTED the flow", async () => {
    vi.stubEnv("GOOGLE_CLIENT_ID", "shared-app-id");
    vi.stubEnv("GOOGLE_CLIENT_SECRET", "shared-app-secret");
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        const u = String(url);
        const body = u.includes("googleapis.com/oauth2/v3/userinfo")
          ? { email: "person-b@gmail.com" }
          : { access_token: "at", refresh_token: "rt", expires_in: 3600, scope: "gmail.modify" };
        return { ok: true, status: 200, headers: { get: () => null }, text: async () => JSON.stringify(body) } as unknown as Response;
      })
    );
    await store.createOAuthState({
      state: "state-b",
      user_id: "user-b",
      provider_key: "google",
      code_verifier: "v",
      redirect_uri: "https://cosignolabs.com/api/connections/google/callback",
      expires_at: new Date(Date.now() + 600_000).toISOString(),
    });
    const out = await completeOAuth({ providerKey: "google", code: "c", state: "state-b" });
    expect(out.ok).toBe(true);
    // Bound to user-b only.
    expect((await store.listConnections("user-b")).length).toBe(1);
    expect((await store.listConnections("user-a")).length).toBe(0);
  });
});

/* -------------------------------------------------- graceful missing env */
describe("missing Google env → the connector is cleanly unavailable", () => {
  it("isConfigured is false without both id and secret; true with both", () => {
    vi.stubEnv("GOOGLE_CLIENT_ID", "");
    vi.stubEnv("GOOGLE_CLIENT_SECRET", "");
    expect(gmailProvider.isConfigured()).toBe(false);

    vi.stubEnv("GOOGLE_CLIENT_ID", "id-only");
    expect(gmailProvider.isConfigured()).toBe(false); // secret still missing

    vi.stubEnv("GOOGLE_CLIENT_SECRET", "the-secret");
    expect(gmailProvider.isConfigured()).toBe(true);
  });
});

/* -------------------------------------------------- read content is untrusted */
describe("Gmail read content is carried as untrusted data", () => {
  it("a search result is flagged untrusted (never treated as instructions)", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        status: 200,
        headers: { get: () => null },
        text: async () => JSON.stringify({ messages: [{ id: "m1" }], resultSizeEstimate: 1 }),
      } as unknown as Response))
    );
    const id = await connectGmailFor("user-a", SECRET_A);
    const res = await runProviderAction("user-a", id, "search_messages", { query: "invoice" });
    expect(res.ok).toBe(true);
    expect((res.detail as Record<string, unknown>).untrusted).toBe(true);
  });
});

/* -------------------------------------------------- no token in logs */
describe("stored tokens never appear in a log line", () => {
  it("a failed provider call logs no access token", async () => {
    const lines: string[] = [];
    const spy = (...args: unknown[]) => { lines.push(args.map(String).join(" ")); };
    vi.spyOn(console, "log").mockImplementation(spy);
    vi.spyOn(console, "error").mockImplementation(spy);
    vi.spyOn(console, "warn").mockImplementation(spy);
    // Make the Gmail HTTP call throw so the error-logging path runs.
    vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("network down"); }));

    const id = await connectGmailFor("user-a", SECRET_A);
    const res = await runProviderAction("user-a", id, "archive", { ids: ["m1"] });
    expect(res.ok).toBe(false);
    const all = lines.join("\n");
    expect(all).not.toContain(SECRET_A);
    expect(all).not.toContain("access_token");
  });
});
