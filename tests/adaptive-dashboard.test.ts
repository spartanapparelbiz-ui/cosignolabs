import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { getProvider, listProviderMeta } from "../src/lib/integrations/registry";

/**
 * The dashboard is generated from what a company actually connected, and the
 * single rule that keeps it honest is this: an unconnected app produces an
 * INVITATION, never a metric.
 *
 * "Revenue $0" and "no Stripe connection" are indistinguishable to a reader,
 * and only one of them is true. The invitation answers the question the zero
 * would have silently answered wrong.
 */

const ADAPTIVE = readFileSync("src/lib/dashboard/adaptive.ts", "utf8");
const PANEL = readFileSync("src/components/app/AdaptiveDashboard.tsx", "utf8");

/**
 * Comments explain why a thing is NOT done, so they contain the very phrases
 * these assertions forbid. Strip them: the rule is about behaviour, not prose.
 */
const codeOnly = (src: string) =>
  src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

describe("connectors declare what they would show", () => {
  it("every provider that can appear on the dashboard says what it tracks", () => {
    const missing = listProviderMeta()
      .map((m) => ({ key: m.key, tracks: getProvider(m.key)?.tracks }))
      .filter((p) => !p.tracks || p.tracks.length === 0);
    expect(missing).toEqual([]);
  });

  it("describes them in business words, not scopes or endpoints", () => {
    for (const meta of listProviderMeta()) {
      for (const t of getProvider(meta.key)?.tracks ?? []) {
        expect(t).not.toMatch(/scope|oauth|api|endpoint|token|:/i);
        expect(t).toBe(t.toLowerCase());
      }
    }
  });
});

describe("an unconnected app never renders a number", () => {
  it("invitations carry what they track, and no value field", () => {
    // The type itself is the guarantee: there is nowhere to put a zero.
    expect(ADAPTIVE).toMatch(/interface DashboardInvitation \{[^}]*tracks: string;[^}]*\}/s);
    expect(ADAPTIVE).not.toMatch(/interface DashboardInvitation \{[^}]*value[^}]*\}/s);
  });

  it("skips an app that can't say what it would give you", () => {
    // An invitation with nothing to promise is just an advert.
    expect(ADAPTIVE).toMatch(/if \(tracks\.length === 0\) continue;/);
  });

  it("the card invites rather than measures", () => {
    expect(PANEL).toMatch(/Connect \{i\.name\}/);
    expect(PANEL).toMatch(/Track \{i\.tracks\} here/);
  });
});

describe("a connected panel shows facts or the reason there are none", () => {
  it("never both, and never neither", () => {
    expect(ADAPTIVE).toMatch(/note: model\.facts\.length > 0 \? null :/);
    expect(PANEL).toMatch(/p\.facts\.length > 0 \?/);
    expect(PANEL).toMatch(/p\.note \?\?/);
  });

  it("renders a capped total as a floor, not an exact number", () => {
    expect(PANEL).toMatch(/f\.atLeast \? "\+" : ""/);
  });
});

describe("health is sentences, never a score", () => {
  it("carries no numeric rating", () => {
    // A number out of 100 implies a measurement nobody took, and invites
    // people to watch it instead of reading what it says.
    expect(codeOnly(ADAPTIVE)).not.toMatch(/healthScore|score\s*[:=]\s*\d|out of 100|\/100/i);
    expect(codeOnly(PANEL)).not.toMatch(/healthScore|\/100/);
  });

  it("only says everything is healthy when there is something to be healthy about", () => {
    // "Everything looks healthy" on an empty workspace is a reassuring
    // sentence about nothing.
    expect(ADAPTIVE).toMatch(/lines\.length === 0 && panels\.length > 0/);
  });

  it("names a broken connection specifically", () => {
    expect(ADAPTIVE).toMatch(/needs reconnecting/);
    expect(ADAPTIVE).toMatch(/isn't responding/);
  });

  it("counts decisions that are actually blocking work", () => {
    expect(ADAPTIVE).toMatch(/decisions? (is|are) waiting on you/);
  });
});

describe("the dashboard is generated, not templated", () => {
  it("builds panels from live connections rather than a fixed widget list", () => {
    expect(ADAPTIVE).toMatch(/describeConnection\(userId, c\.id\)/);
    // No hardcoded per-app widget map.
    expect(ADAPTIVE).not.toMatch(/const WIDGETS|DASHBOARD_WIDGETS|widgetFor/);
  });

  it("routes every kind through the one connector engine", () => {
    // A custom API or MCP server appears exactly like a built-in.
    expect(ADAPTIVE).toContain("integrations/engine/describe");
  });

  it("holds invitations to a couple, so they can't bury the real work", () => {
    expect(PANEL).toMatch(/\.slice\(0, 2\)/);
  });

  it("renders nothing at all rather than an empty shell", () => {
    expect(PANEL).toMatch(/return null/);
  });
});
