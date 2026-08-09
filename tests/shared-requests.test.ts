import { describe, it, expect, beforeEach, vi } from "vitest";
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
 * The shared request cache, as it behaves ON THE SERVER — which is to say, not
 * at all. Its browser behaviour (dedupe, seeding, optimistic writes) lives in
 * shared-requests-browser.test.ts, where a `window` is installed before the
 * module loads.
 *
 * This file also pins the naming discipline that makes sharing possible: a
 * cache key is a string, so two components share a request only if they spell
 * the URL identically.
 */

const src = (p: string) => readFileSync(join(process.cwd(), p), "utf8");

function mockFetch(body: unknown, calls: { n: number }) {
  return vi.fn(async () => {
    calls.n += 1;
    return { ok: true, json: async () => body } as unknown as Response;
  });
}

describe("the cache never crosses a request boundary on the server", () => {
  /**
   * A "use client" module still runs on the server to produce the SSR HTML,
   * and a module-level Map there is ONE map shared by every request — so a
   * write during a server render puts the first user's data where the next
   * user's render will read it. That is a cross-user leak, and it showed up as
   * a hydration mismatch before it showed up as anything worse.
   *
   * These run in the default vitest environment, which has no `window` — the
   * same condition as a server render.
   */
  beforeEach(() => {
    clearResources();
  });

  it("has no window here, which is the condition being tested", () => {
    expect(typeof window).toBe("undefined");
  });

  it("refuses to seed", () => {
    seedResource(PENDING_APPROVALS_KEY, { actions: [{ id: "user-a" }] });
    expect(readResource(PENDING_APPROVALS_KEY)).toBeUndefined();
  });

  it("refuses to write optimistically", () => {
    setResource("/api/hold", { hold: { scope: "all" } });
    expect(readResource("/api/hold")).toBeUndefined();
  });

  it("refuses to fetch", async () => {
    const calls = { n: 0 };
    vi.stubGlobal("fetch", mockFetch({ ok: true }, calls));
    await loadResource("/api/usage");
    expect(calls.n).toBe(0);
    vi.unstubAllGlobals();
  });

  it("so one request can never read what another one rendered", () => {
    // Request A renders and tries to seed its own approvals…
    seedResource(PENDING_APPROVALS_KEY, { actions: [{ id: "belongs-to-user-a" }] });
    // …and request B, rendering next in the same process, sees nothing.
    expect(readResource(PENDING_APPROVALS_KEY)).toBeUndefined();
  });
});

describe("components fall back to their server-fetched props", () => {
  /**
   * With the cache inert on the server, the ONLY thing keeping the server
   * render and the client's hydration render identical is that both fall
   * through to the `initial` prop. Drop that fallback and the page hydrates
   * into a mismatch.
   */
  it("renders from `initial` while the cache is empty", () => {
    expect(src("src/components/app/Dashboard.tsx")).toMatch(/initial\?\.missions/);
    expect(src("src/components/app/Dashboard.tsx")).toMatch(/initial\?\.approvals/);
    expect(src("src/components/app/DecisionInbox.tsx")).toMatch(/\?\? initial \?\?/);
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
