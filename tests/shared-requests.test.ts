import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  clearResources,
  invalidate,
  loadResource,
  readResource,
  seedResource,
  setResource,
} from "@/lib/client/resource";
import { PENDING_APPROVALS_KEY } from "@/lib/client/keys";

/**
 * The workspace asks each question once.
 *
 * Every duplicate request is a round trip somebody waits through for an answer
 * the app already had in flight — and worse, two independent reads of one fact
 * can disagree, which is how a "Stop" button ends up claiming work is flowing
 * while everything is frozen. These tests pin the three properties that make
 * that impossible: dedupe, instant-on-return, and seedability.
 */

const src = (p: string) => readFileSync(join(process.cwd(), p), "utf8");

function mockFetch(body: unknown, calls: { n: number }) {
  return vi.fn(async () => {
    calls.n += 1;
    return { ok: true, json: async () => body } as unknown as Response;
  });
}

describe("the shared request cache", () => {
  beforeEach(() => {
    clearResources();
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("collapses concurrent readers of one key into a single request", async () => {
    const calls = { n: 0 };
    vi.stubGlobal("fetch", mockFetch({ ok: true }, calls));

    // Five components mounting in the same tick, all wanting the same fact.
    await Promise.all([
      loadResource("/api/hold"),
      loadResource("/api/hold"),
      loadResource("/api/hold"),
      loadResource("/api/hold"),
      loadResource("/api/hold"),
    ]);

    expect(calls.n).toBe(1);
  });

  it("keeps different keys separate", async () => {
    const calls = { n: 0 };
    vi.stubGlobal("fetch", mockFetch({ ok: true }, calls));
    await Promise.all([loadResource("/api/hold"), loadResource("/api/usage")]);
    expect(calls.n).toBe(2);
  });

  it("serves what the server already sent without asking again", async () => {
    const calls = { n: 0 };
    vi.stubGlobal("fetch", mockFetch({ actions: [] }, calls));

    seedResource(PENDING_APPROVALS_KEY, { actions: [{ id: "a1" }] });
    expect(readResource<{ actions: unknown[] }>(PENDING_APPROVALS_KEY)?.actions).toHaveLength(1);
    expect(calls.n).toBe(0);
  });

  it("never lets a seed overwrite something the client fetched since", async () => {
    const calls = { n: 0 };
    vi.stubGlobal("fetch", mockFetch({ actions: [{ id: "fresh" }] }, calls));

    await loadResource(PENDING_APPROVALS_KEY);
    // A remount re-seeds from stale server props — that must not win.
    seedResource(PENDING_APPROVALS_KEY, { actions: [{ id: "stale" }] });

    const held = readResource<{ actions: { id: string }[] }>(PENDING_APPROVALS_KEY);
    expect(held?.actions[0].id).toBe("fresh");
  });

  it("applies an optimistic write immediately, before any round trip", () => {
    setResource("/api/hold", { hold: { scope: "all" } });
    expect(readResource<{ hold: { scope: string } }>("/api/hold")?.hold.scope).toBe("all");
  });

  it("keeps the last good value when a refresh fails", async () => {
    const calls = { n: 0 };
    vi.stubGlobal("fetch", mockFetch({ rules: [{ id: "r1" }] }, calls));
    await loadResource("/api/rules");

    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("network down");
      })
    );
    await loadResource("/api/rules").catch(() => undefined);

    // A failed refresh must not blank a page that was showing something true.
    expect(readResource<{ rules: unknown[] }>("/api/rules")?.rules).toHaveLength(1);
  });

  it("invalidates a whole family from one prefix", async () => {
    const calls = { n: 0 };
    vi.stubGlobal("fetch", mockFetch({ actions: [] }, calls));
    await loadResource("/api/actions?status=proposed&limit=200");
    await loadResource("/api/actions?limit=10");
    const before = calls.n;

    // Nothing is subscribed, so this marks stale rather than refetching —
    // the next reader pays for the request, and only if there is one.
    invalidate("/api/actions");
    expect(calls.n).toBe(before);

    await loadResource("/api/actions?status=proposed&limit=200");
    expect(calls.n).toBe(before + 1);
  });
});

describe("the surfaces that share a question spell it the same way", () => {
  /**
   * A cache key is a string, so two components share a request only if they
   * spell the URL identically — `limit=20` and `limit=200` are one question to
   * a person and two to a cache. Naming them centrally is the only thing
   * stopping that from drifting back apart.
   */
  it("reads the pending queue through the shared key, never a literal URL", () => {
    for (const file of [
      "src/components/AppRail.tsx",
      "src/components/app/Dashboard.tsx",
      "src/components/app/DecisionInbox.tsx",
    ]) {
      const code = src(file);
      expect(code, `${file} should use the shared key`).toContain("PENDING_APPROVALS_KEY");
      expect(code, `${file} should not fetch the queue directly`).not.toMatch(
        /fetch\(["'`]\/api\/actions\?status=proposed/
      );
    }
  });

  it("reads the hold through one hook, so the banner and the stop button agree", () => {
    for (const file of ["src/components/app/HoldBanner.tsx", "src/components/app/EmergencyStop.tsx"]) {
      const code = src(file);
      expect(code, `${file} should use the shared hold state`).toContain("useHoldScope");
      // Writing a hold from these controls is exactly their job; READING one
      // independently is what has to stay impossible, so the assertion is on
      // parsing the scope out of a response rather than on touching the URL.
      expect(code, `${file} should not read the hold scope itself`).not.toMatch(
        /hold[?]?\.scope/
      );
    }
  });

  it("reads the rules once for the whole connections page", () => {
    for (const file of [
      "src/components/account/ConnectionsPanel.tsx",
      "src/components/account/PermissionRules.tsx",
    ]) {
      expect(src(file), `${file} should use the shared rules key`).toContain("RULES_KEY");
    }
  });

  it("never asks for a thousand rows to render a list", () => {
    // A page that transfers the whole ledger to count a few things is slow in
    // exactly the way nobody notices until it is somebody's real account.
    for (const file of [
      "src/components/account/ConnectionsPanel.tsx",
      "src/app/app/missions/page.tsx",
      "src/components/app/Dashboard.tsx",
    ]) {
      expect(src(file), `${file} still requests limit=1000`).not.toMatch(/limit=1000/);
    }
  });
});
