import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { githubProvider } from "../src/lib/integrations/providers/github";
import { getProvider, listProviderMeta } from "../src/lib/integrations/registry";
import { capabilityRisk, serverTier } from "../src/lib/integrations/tiers";

/**
 * Discovery tells the user what is really in their account. That makes it the
 * worst possible place to approximate: a plausible wrong number here is
 * indistinguishable from a right one, so it gets trusted and acted on.
 *
 * These tests pin the two ways that guarantee could quietly rot — a provider
 * gaining a fabricating fallback, and a count being taken from a page of
 * results rather than a real total.
 */

const GITHUB_SRC = readFileSync("src/lib/integrations/providers/github.ts", "utf8");
const RUNTIME_SRC = readFileSync("src/lib/integrations/runtime/connections.ts", "utf8");
const PANEL_SRC = readFileSync("src/components/account/ConnectionInsight.tsx", "utf8");

describe("discovery is optional, and its absence is stated rather than filled", () => {
  it("a provider without discover() gets no generic substitute", () => {
    // The runtime must bail with a reason, not synthesize an inventory.
    expect(RUNTIME_SRC).toMatch(/if \(!provider\.discover\)/);
    expect(RUNTIME_SRC).toMatch(/can't inventory .*yet/);
  });

  it("providers that cannot be inventoried simply don't implement it", () => {
    // Only claim discovery where it is genuinely built. This asserts the
    // shape, not a specific roster, so adding a real one doesn't break it.
    for (const meta of listProviderMeta()) {
      const provider = getProvider(meta.key);
      if (!provider?.discover) continue;
      expect(typeof provider.discover).toBe("function");
    }
  });

  it("github implements it", () => {
    expect(typeof githubProvider.discover).toBe("function");
  });
});

describe("github counts come from real totals, not page sizes", () => {
  it("reads repository totals off the account, not a listing page", () => {
    // /user carries exact totals. Counting /user/repos rows would cap at the
    // page size and publish "100" for an account with thousands.
    expect(GITHUB_SRC).toMatch(/public_repos/);
    expect(GITHUB_SRC).toMatch(/owned_private_repos|total_private_repos/);
  });

  it("uses search total_count, and asks for only one row since the count is the point", () => {
    expect(GITHUB_SRC).toMatch(/total_count/);
    expect(GITHUB_SRC).toMatch(/per_page=1/);
  });

  it("marks a capped or timed-out total as a floor instead of an exact number", () => {
    expect(GITHUB_SRC).toMatch(/incomplete_results/);
    expect(GITHUB_SRC).toMatch(/atLeast: true/);
    // ...and the UI actually renders that distinction.
    expect(PANEL_SRC).toMatch(/f\.atLeast \? "\+" : ""/);
  });

  it("names a count it could not obtain rather than omitting the row", () => {
    // A row that silently disappears reads as zero.
    expect(GITHUB_SRC).toMatch(/limitations\.push/);
    expect(PANEL_SRC).toMatch(/data\.limitations\.map/);
  });

  it("labels say precisely what was counted", () => {
    // "136 pull requests" invites the reader to supply a meaning; a scoped
    // label cannot be misread.
    expect(GITHUB_SRC).toContain("open pull requests you opened");
    expect(GITHUB_SRC).toContain("open issues assigned to you");
  });
});

describe("the capability checklist matches what the engine will actually enforce", () => {
  it("derives every entry from the provider's declared actions", () => {
    const actions = githubProvider.listActions();
    expect(actions.length).toBeGreaterThan(0);
    for (const a of actions) {
      expect(typeof a.summary).toBe("string");
      expect(a.summary.length).toBeGreaterThan(0);
    }
  });

  it("uses the server tier rule, so the checklist can't promise a weaker gate than execution applies", () => {
    const byId = Object.fromEntries(githubProvider.listActions().map((a) => [a.id, a]));

    // Reads are auto-eligible; the write is not.
    expect(serverTier(byId.list_repos)).toBe(1);
    expect(serverTier(byId.list_issues)).toBe(1);
    expect(serverTier(byId.create_issue)).toBe(2);

    expect(capabilityRisk(byId.list_repos)).toBe("read");
    expect(capabilityRisk(byId.create_issue)).toBe("write");
  });

  it("every declared action resolves to a real approval requirement", () => {
    for (const a of githubProvider.listActions()) {
      expect([1, 2, 3]).toContain(serverTier(a));
    }
  });
});

describe("the panel has no example mode", () => {
  it("renders a stated reason where numbers would be, when there are none", () => {
    expect(PANEL_SRC).toMatch(/data\.error \?\?/);
    expect(PANEL_SRC).toMatch(/can't inventory/);
  });

  it("carries no hardcoded sample metrics", () => {
    // The brief's example screen ("48 repositories", "$1.8M processed") is
    // exactly what must never ship as a literal.
    expect(PANEL_SRC).not.toMatch(/\b48 repositories\b/);
    expect(PANEL_SRC).not.toMatch(/\$1\.8M/);
    expect(PANEL_SRC).not.toMatch(/12,441|1,932/);
  });
});
