import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import {
  capabilitiesFromCustomApi,
  capabilitiesFromMcp,
  capabilitiesFromProvider,
} from "../src/lib/integrations/engine/model";
import { listProviderMeta } from "../src/lib/integrations/registry";
import type { CustomApiConfig, McpToolRecord } from "../src/lib/integrations/types";

/**
 * One engine, three kinds. A built-in provider, a user-mapped HTTP API, and an
 * MCP server all normalize to the same capability shape — which is what lets a
 * connector cosigno has never seen render exactly like a first-party one.
 *
 * Normalizing is not flattening. MCP tools carry an enable/consent gate the
 * other kinds don't have, and erasing that to make rows look uniform would
 * present a tool as ready when calling it would be refused.
 *
 * Nothing was removed to get here: the built-in presets must still be there.
 */

const PANEL = readFileSync("src/components/account/ConnectionsPanel.tsx", "utf8");

const customConfig: CustomApiConfig = {
  base_url: "https://api.example.com",
  auth: { placement: "header", name: "authorization" },
  actions: [
    { id: "create_order", summary: "", method: "POST", path: "/v1/orders", risk: "write" },
    { id: "remove_order", summary: "", method: "DELETE", path: "/v1/orders/{id}", risk: "destructive" },
    { id: "list_orders", summary: "", method: "GET", path: "/v1/orders", risk: "read" },
  ],
} as CustomApiConfig;

function mcpTool(over: Partial<McpToolRecord> = {}): McpToolRecord {
  return {
    connection_id: "c1",
    name: "create_ticket",
    description: "opens a support ticket",
    input_schema: {},
    enabled: true,
    sensitive: false,
    consented_at: null,
    ...over,
  } as McpToolRecord;
}

describe("built-in connectors are preserved as presets", () => {
  it("the prebuilt providers still exist", () => {
    const keys = listProviderMeta().map((p) => p.key);
    for (const expected of ["github", "google", "slack", "notion", "outlook"]) {
      expect(keys).toContain(expected);
    }
  });

  it("a preset's capabilities come through the same engine", () => {
    const caps = capabilitiesFromProvider("github");
    expect(caps.length).toBeGreaterThan(0);
    for (const c of caps) {
      expect(c.label.length).toBeGreaterThan(0);
      expect(["read", "write", "destructive"]).toContain(c.risk);
      expect([1, 2, 3]).toContain(c.tier);
    }
  });
});

describe("every kind produces the same shape", () => {
  const sets = [
    ["provider", capabilitiesFromProvider("github")],
    ["custom api", capabilitiesFromCustomApi(customConfig)],
    ["mcp", capabilitiesFromMcp([mcpTool()])],
  ] as const;

  it.each(sets)("%s capabilities carry every required field", (_kind, caps) => {
    expect(caps.length).toBeGreaterThan(0);
    for (const c of caps) {
      expect(typeof c.id).toBe("string");
      expect(typeof c.label).toBe("string");
      expect(typeof c.summary).toBe("string");
      expect(["read", "write", "destructive"]).toContain(c.risk);
      expect([1, 2, 3]).toContain(c.tier);
      expect(["runs automatically", "your approval", "typed confirmation"]).toContain(c.requires);
      expect(typeof c.available).toBe("boolean");
    }
  });

  it.each(sets)("%s labels are business language, not endpoints", (_kind, caps) => {
    for (const c of caps) {
      expect(c.label).not.toMatch(/^(GET|POST|PUT|PATCH|DELETE)\s/);
      expect(c.label).not.toContain("/");
      expect(c.label).not.toContain("_");
    }
  });

  it("the tier always matches the stated requirement", () => {
    for (const [, caps] of sets) {
      for (const c of caps) {
        const expected =
          c.tier === 1 ? "runs automatically" : c.tier === 2 ? "your approval" : "typed confirmation";
        expect(c.requires).toBe(expected);
      }
    }
  });
});

describe("custom API risk is derived, never taken on trust", () => {
  it("labels a DELETE destructive even if the mapping claimed otherwise", () => {
    const [cap] = capabilitiesFromCustomApi({
      ...customConfig,
      // A user (or an import) claiming a DELETE is a harmless read must not
      // be able to talk it down to auto-run.
      actions: [{ id: "sync", summary: "", method: "DELETE", path: "/v1/orders/{id}", risk: "read" }],
    } as CustomApiConfig);
    expect(cap.risk).toBe("destructive");
    expect(cap.tier).toBe(3);
  });

  it("keeps a stricter declared risk rather than loosening it", () => {
    const [cap] = capabilitiesFromCustomApi({
      ...customConfig,
      actions: [{ id: "fetch", summary: "", method: "GET", path: "/v1/orders", risk: "destructive" }],
    } as CustomApiConfig);
    expect(cap.risk).toBe("destructive");
  });

  it("renders endpoints as business language", () => {
    const labels = capabilitiesFromCustomApi(customConfig).map((c) => c.label);
    expect(labels).toContain("Create Order");
    expect(labels).toContain("Delete Order");
  });
});

describe("MCP gates are preserved, not normalized away", () => {
  it("a disabled tool reports unavailable with the reason", () => {
    const [cap] = capabilitiesFromMcp([mcpTool({ enabled: false })]);
    expect(cap.available).toBe(false);
    expect(cap.unavailableReason).toMatch(/turned off/i);
  });

  it("a sensitive tool without consent reports unavailable", () => {
    const [cap] = capabilitiesFromMcp([mcpTool({ sensitive: true, consented_at: null })]);
    expect(cap.available).toBe(false);
    expect(cap.unavailableReason).toMatch(/consent/i);
  });

  it("a consented, enabled tool is available", () => {
    const [cap] = capabilitiesFromMcp([
      mcpTool({ sensitive: true, consented_at: new Date().toISOString() }),
    ]);
    expect(cap.available).toBe(true);
    expect(cap.unavailableReason).toBeUndefined();
  });

  it("bounds a third-party description so it can't take over the approval surface", () => {
    const [cap] = capabilitiesFromMcp([mcpTool({ description: "x".repeat(5000) })]);
    expect(cap.summary.length).toBeLessThanOrEqual(300);
  });

  it("says so plainly when the server supplied no description", () => {
    const [cap] = capabilitiesFromMcp([mcpTool({ description: "" })]);
    expect(cap.summary).toMatch(/no description/i);
  });
});

describe("the UI leads with meaning and keeps the identifier", () => {
  it("custom actions show a generated label plus the raw endpoint", () => {
    expect(PANEL).toMatch(/humanizeEndpoint\(a\.method, a\.path\)/);
    expect(PANEL).toMatch(/\{a\.method\} \{a\.path\}/);
  });

  it("mcp tools show a generated label plus the raw tool name", () => {
    expect(PANEL).toMatch(/humanizeActionId\(tool\.name\)/);
    expect(PANEL).toMatch(/\{tool\.name\}/);
  });
});
