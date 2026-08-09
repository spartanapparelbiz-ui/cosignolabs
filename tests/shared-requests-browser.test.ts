import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from "vitest";

/**
 * The shared request cache, as it behaves IN A BROWSER.
 *
 * `lib/client/resource.ts` decides once, at module evaluation, whether it is
 * running in a browser — and is deliberately inert when it is not, because a
 * module-level Map on the server is shared by every request and every user
 * (see shared-requests.test.ts for that half). So this file has to install a
 * `window` BEFORE the module is first imported, which is why the import is
 * dynamic and lives in `beforeAll`. A static import at the top of the file
 * would evaluate the module first and test the server path by accident.
 *
 * No jsdom: the cache touches `window` only to know where it is, plus
 * `document.visibilityState` behind the polling option, which nothing here
 * exercises. A two-property stub is a truer test than a whole fake DOM.
 */

type Resource = typeof import("@/lib/client/resource");
let R: Resource;
let PENDING_APPROVALS_KEY: string;

function mockFetch(body: unknown, calls: { n: number }) {
  return vi.fn(async () => {
    calls.n += 1;
    return { ok: true, json: async () => body } as unknown as Response;
  });
}

beforeAll(async () => {
  vi.stubGlobal("window", {});
  vi.stubGlobal("document", { visibilityState: "visible" });
  R = await import("@/lib/client/resource");
  ({ PENDING_APPROVALS_KEY } = await import("@/lib/client/keys"));
});

describe("in a browser, the cache asks each question once", () => {
  beforeEach(() => {
    R.clearResources();
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    // The window stub must survive between tests — unstubbing removes it, and
    // the module already captured its decision, so restore it for readability.
    vi.stubGlobal("window", {});
    vi.stubGlobal("document", { visibilityState: "visible" });
  });

  it("collapses concurrent readers of one key into a single request", async () => {
    const calls = { n: 0 };
    vi.stubGlobal("fetch", mockFetch({ ok: true }, calls));
    // Five components mounting in the same tick, all wanting the same fact.
    await Promise.all(Array.from({ length: 5 }, () => R.loadResource("/api/hold")));
    expect(calls.n).toBe(1);
  });

  it("keeps different keys separate", async () => {
    const calls = { n: 0 };
    vi.stubGlobal("fetch", mockFetch({ ok: true }, calls));
    await Promise.all([R.loadResource("/api/hold"), R.loadResource("/api/usage")]);
    expect(calls.n).toBe(2);
  });

  it("serves what the server already sent without asking again", () => {
    const calls = { n: 0 };
    vi.stubGlobal("fetch", mockFetch({ actions: [] }, calls));
    R.seedResource(PENDING_APPROVALS_KEY, { actions: [{ id: "a1" }] });
    expect(R.readResource<{ actions: unknown[] }>(PENDING_APPROVALS_KEY)?.actions).toHaveLength(1);
    expect(calls.n).toBe(0);
  });

  it("never lets a seed overwrite something the client fetched since", async () => {
    const calls = { n: 0 };
    vi.stubGlobal("fetch", mockFetch({ actions: [{ id: "fresh" }] }, calls));
    await R.loadResource(PENDING_APPROVALS_KEY);
    // A remount re-seeds from stale server props — that must not win.
    R.seedResource(PENDING_APPROVALS_KEY, { actions: [{ id: "stale" }] });
    const held = R.readResource<{ actions: { id: string }[] }>(PENDING_APPROVALS_KEY);
    expect(held?.actions[0].id).toBe("fresh");
  });

  it("applies an optimistic write immediately, before any round trip", () => {
    R.setResource("/api/hold", { hold: { scope: "all" } });
    expect(R.readResource<{ hold: { scope: string } }>("/api/hold")?.hold.scope).toBe("all");
  });

  it("keeps the last good value when a refresh fails", async () => {
    const calls = { n: 0 };
    vi.stubGlobal("fetch", mockFetch({ rules: [{ id: "r1" }] }, calls));
    await R.loadResource("/api/rules");

    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("network down");
      })
    );
    await R.loadResource("/api/rules").catch(() => undefined);

    // A failed refresh must not blank a page that was showing something true.
    expect(R.readResource<{ rules: unknown[] }>("/api/rules")?.rules).toHaveLength(1);
  });

  it("invalidates a whole family from one prefix", async () => {
    const calls = { n: 0 };
    vi.stubGlobal("fetch", mockFetch({ actions: [] }, calls));
    await R.loadResource(PENDING_APPROVALS_KEY);
    await R.loadResource("/api/actions?limit=10");
    const before = calls.n;

    // Nothing is subscribed, so this marks stale rather than refetching — the
    // next reader pays for the request, and only if there is one.
    R.invalidate("/api/actions");
    expect(calls.n).toBe(before);

    await R.loadResource(PENDING_APPROVALS_KEY);
    expect(calls.n).toBe(before + 1);
  });
});
