import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

/**
 * A connection that loses its sign-in must be heard about where the person
 * already is. Missions that need the app degrade quietly — the failure
 * surfaces as "cosigno didn't do the thing", not as an error — so waiting
 * for someone to visit the connections page is waiting for them to suspect
 * the product. The banner carries the truth to every workspace page instead.
 */

const BANNER = readFileSync("src/components/app/ConnectionHealthBanner.tsx", "utf8");
const LAYOUT = readFileSync("src/app/app/layout.tsx", "utf8");

describe("broken connections are announced everywhere, not just on their page", () => {
  it("the banner is mounted in the workspace layout", () => {
    expect(LAYOUT).toContain("ConnectionHealthBanner");
  });

  it("only repairable states summon it — a deliberate disconnect is not a problem", () => {
    expect(BANNER).toMatch(/needs_reauth/);
    expect(BANNER).toMatch(/=== "error"/);
    expect(BANNER).not.toMatch(/"revoked"/);
  });

  it("stays silent while healthy and on the connections page itself", () => {
    expect(BANNER).toMatch(/broken\.length === 0/);
    expect(BANNER).toMatch(/\/app\/connections/);
  });

  it("the fix is one click away and correctly addressed", () => {
    expect(BANNER).toMatch(/href="\/app\/connections"/);
  });

  it("degrades to nothing when the connections API is unavailable", () => {
    // Demo mode / guests / an unprovisioned backend must never see an error
    // banner about connections they cannot have.
    expect(BANNER).toMatch(/catch\s*\{\s*return \[\]/);
  });
});
