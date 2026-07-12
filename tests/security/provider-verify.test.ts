import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryStore } from "../../src/lib/store/memory";
import { encryptSecret } from "../../src/lib/integrations/crypto";
import { verifyCalendarEvent, verifyDriveFile, verifyGmailSend } from "../../src/lib/missions/verify";

/**
 * Provider verification never trusts an API success as proof. Each verifier
 * reads the outcome back and confirms it; a missing or mismatched result is
 * ok:false so the UI shows "submitted, but not fully verified" — never a
 * false green. One normalized result model across Gmail, Calendar, Drive.
 */

let store: MemoryStore;
beforeEach(() => {
  store = new MemoryStore();
  (globalThis as Record<string, unknown>).__cosignoStore = store;
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

async function connect(userId: string, providerKey: string) {
  await store.createConnection({
    user_id: userId,
    provider_key: providerKey,
    kind: "app",
    display_name: providerKey,
    auth_type: "oauth2",
    encrypted_credentials: encryptSecret({ access_token: "tok" }),
    scopes: "",
    status: "connected",
  });
}

/** Stub the outbound provider fetch with a canned JSON body. */
function stub(body: unknown) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => ({
      ok: true,
      status: 200,
      headers: { get: () => null },
      text: async () => JSON.stringify(body),
    } as unknown as Response))
  );
}

describe("calendar verification", () => {
  it("confirms the event on read-back; fails when absent", async () => {
    await connect("user-a", "google-calendar");
    stub({ items: [{ id: "1", summary: "Q3 planning" }] });
    const ok = await verifyCalendarEvent("user-a", { title: "Q3 planning" });
    expect(ok.ok).toBe(true);
    expect(ok.detail).toMatch(/verified/i);

    stub({ items: [{ id: "2", summary: "something else" }] });
    const miss = await verifyCalendarEvent("user-a", { title: "Q3 planning" });
    expect(miss.ok).toBe(false);
    expect(miss.detail).toMatch(/unverified/i);
  });

  it("fails cleanly when the connection is gone", async () => {
    const r = await verifyCalendarEvent("user-a", { title: "x" });
    expect(r.ok).toBe(false);
    expect(r.detail).toMatch(/no longer connected/i);
  });
});

describe("drive verification", () => {
  it("confirms the file by name on read-back; fails on mismatch", async () => {
    await connect("user-a", "google-drive");
    stub({ files: [{ id: "1", name: "report.md" }] });
    expect((await verifyDriveFile("user-a", { name: "report.md" })).ok).toBe(true);

    stub({ files: [{ id: "1", name: "other.md" }] });
    const miss = await verifyDriveFile("user-a", { name: "report.md" });
    expect(miss.ok).toBe(false);
    expect(miss.detail).toMatch(/unverified/i);
  });
});

describe("gmail verification", () => {
  it("confirms the message is in Sent Mail; fails when not found", async () => {
    await connect("user-a", "google");
    stub({ messages: [{ id: "m1" }], resultSizeEstimate: 1 });
    expect((await verifyGmailSend("user-a", { subject: "hi" })).ok).toBe(true);

    stub({ messages: [] });
    expect((await verifyGmailSend("user-a", { subject: "hi" })).ok).toBe(false);
  });
});
