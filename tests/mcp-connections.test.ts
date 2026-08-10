import { describe, expect, it } from "vitest";
import { parseMcpConfig, redact } from "../src/lib/integrations/mcp/config";
import {
  CATEGORY_RISK,
  classifyTool,
  categoryIsSensitive,
} from "../src/lib/integrations/mcp/classify";
import { listCatalog, searchCatalog } from "../src/lib/integrations/mcp/catalog";
import { mcpToolRisk, RISK_TIER } from "../src/lib/integrations/tiers";
import { isSensitiveTool } from "../src/lib/integrations/mcp/consent";

/**
 * Connections are built around MCP: paste a configuration, and whatever tools
 * the server offers are discovered and governed with no code written for them.
 * Two pieces carry that promise — the parser that accepts what people actually
 * paste, and the classifier that decides how carefully each tool is treated.
 * Both are pure, so both are tested directly.
 */

describe("pasting a configuration", () => {
  it("reads the standard client format", () => {
    const out = parseMcpConfig(
      JSON.stringify({ mcpServers: { github: { url: "https://mcp.example.com/mcp" } } })
    );
    expect(out.ok).toBe(true);
    expect(out.servers).toHaveLength(1);
    expect(out.servers[0].name).toBe("github");
    expect(out.servers[0].transport).toBe("http");
    expect(out.servers[0].runnable).toBe(true);
  });

  it("reads the VS Code 'servers' wrapper and a bare named entry", () => {
    const vscode = parseMcpConfig(JSON.stringify({ servers: { a: { url: "https://a.example/mcp" } } }));
    expect(vscode.servers[0].name).toBe("a");

    const bare = parseMcpConfig(JSON.stringify({ linear: { url: "https://b.example/mcp" } }));
    expect(bare.servers[0].name).toBe("linear");
  });

  it("reads a bare server object and a plain URL", () => {
    const obj = parseMcpConfig(JSON.stringify({ url: "https://c.example/mcp" }));
    expect(obj.ok).toBe(true);
    expect(obj.servers[0].url).toBe("https://c.example/mcp");

    const url = parseMcpConfig("https://mcp.example.com/mcp");
    expect(url.ok).toBe(true);
    expect(url.servers[0].transport).toBe("http");
    // A URL with no name still gets a usable one, from its host.
    expect(url.servers[0].name).toBe("mcp");
  });

  it("recognises a local process and marks it unrunnable rather than rejecting it", () => {
    const out = parseMcpConfig(
      JSON.stringify({
        mcpServers: {
          filesystem: { command: "npx", args: ["-y", "@modelcontextprotocol/server-filesystem", "/tmp"] },
        },
      })
    );
    expect(out.ok).toBe(true);
    const server = out.servers[0];
    expect(server.transport).toBe("stdio");
    expect(server.command).toBe("npx");
    expect(server.args).toContain("/tmp");
    // Parsed correctly AND honestly reported as something we can't run.
    expect(server.runnable).toBe(false);
  });

  it("lifts credentials out of env, headers and the query string", () => {
    const out = parseMcpConfig(
      JSON.stringify({
        mcpServers: {
          s: {
            url: "https://s.example/mcp?api_key=zzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzz",
            headers: {
              Authorization: "Bearer sk-secret-token-value",
              "X-Trace": "on",
            },
          },
        },
      })
    );
    const server = out.servers[0];
    expect(server.bearer).toBe("sk-secret-token-value");
    // The non-secret header survives; the secret ones are quarantined.
    expect(server.headers).toEqual({ "X-Trace": "on" });
    expect(server.secrets.some((s) => s.source === "url" && s.key === "api_key")).toBe(true);

    // And none of it is renderable.
    const shown = JSON.stringify(redact(server));
    expect(shown).not.toContain("sk-secret-token-value");
    expect(shown).not.toContain("zzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzz");
    expect(shown).toContain("••••••••");
  });

  it("reports unfilled placeholders instead of treating them as tokens", () => {
    const out = parseMcpConfig(
      JSON.stringify({
        mcpServers: {
          github: {
            command: "npx",
            args: ["-y", "server"],
            env: { GITHUB_TOKEN: "${GITHUB_TOKEN}", REGION: "eu" },
          },
        },
      })
    );
    const server = out.servers[0];
    expect(server.placeholders).toContain("GITHUB_TOKEN");
    // A placeholder is never stored as a value, secret or otherwise.
    expect(server.env).toEqual({ REGION: "eu" });
    expect(server.secrets).toHaveLength(0);
  });

  it("fails with a fixable sentence rather than throwing", () => {
    for (const bad of ["", "not json at all", '{"mcpServers":{}}', '{"a":{"b":1}}', "{oops"]) {
      const out = parseMcpConfig(bad);
      expect(out.ok).toBe(false);
      expect(out.error && out.error.length).toBeGreaterThan(0);
      // No configuration name or stack trace leaks into the message.
      expect(out.error).not.toMatch(/undefined|Error:/);
    }
  });

  it("never lets one paste flood the system", () => {
    const many = Object.fromEntries(
      Array.from({ length: 50 }, (_, i) => [`s${i}`, { url: `https://s${i}.example/mcp` }])
    );
    const out = parseMcpConfig(JSON.stringify({ mcpServers: many }));
    expect(out.servers.length).toBeLessThanOrEqual(20);
    expect(out.warnings.join(" ")).toMatch(/only the first/);
  });
});

describe("classifying what a tool does", () => {
  const cases: [string, string][] = [
    ["search_messages", "search"],
    ["list_repositories", "search"],
    ["get_user", "read"],
    ["create_issue", "create"],
    ["update_record", "update"],
    ["send_email", "send"],
    ["delete_file", "delete"],
    ["create_refund", "payment"],
    ["grant_role", "admin"],
    ["execute_sql", "execute"],
  ];

  it.each(cases)("%s → %s", (name, expected) => {
    expect(classifyTool({ name }).category).toBe(expected);
  });

  it("maps every category to a tier, and the risky ones to the strictest", () => {
    expect(RISK_TIER[CATEGORY_RISK.read]).toBe(1);
    expect(RISK_TIER[CATEGORY_RISK.search]).toBe(1);
    expect(RISK_TIER[CATEGORY_RISK.create]).toBe(2);
    expect(RISK_TIER[CATEGORY_RISK.update]).toBe(2);
    expect(RISK_TIER[CATEGORY_RISK.send]).toBe(2);
    for (const c of ["delete", "payment", "admin", "execute"] as const) {
      expect(RISK_TIER[CATEGORY_RISK[c]], `${c} must need typed confirmation`).toBe(3);
    }
  });

  it("breaks a tie towards the more cautious category", () => {
    // Reads and deletes in one name: the delete has to win.
    const verdict = classifyTool({ name: "get_and_delete_record" });
    expect(CATEGORY_RISK[verdict.category]).toBe("destructive");
  });

  it("admits when it is guessing instead of asserting a category", () => {
    const opaque = classifyTool({ name: "xyzzy", description: "" });
    expect(opaque.confidence).toBe(0);
    expect(opaque.needsReview).toBe(true);
    // And an unknown tool is never treated as a harmless read.
    expect(categoryIsSensitive(opaque.category, opaque.needsReview)).toBe(true);
  });

  it("stops trusting a 'read' that takes required parameters", () => {
    const plain = classifyTool({ name: "get_report" });
    const withBody = classifyTool({
      name: "get_report",
      input_schema: { type: "object", properties: { body: {} }, required: ["body"] },
    });
    // The NAME is equally read-ish in both, so confidence is unchanged — the
    // reason to ask is the required body, not doubt about the word "get".
    // Keeping the two signals separate is the point: a reason to ask a human
    // must not be expressible only as a number that rounding could erase.
    expect(plain.needsReview).toBe(false);
    expect(withBody.needsReview).toBe(true);
    expect(withBody.confidence).toBe(plain.confidence);
  });

  it("weights the leading verb over a mention in the description", () => {
    const verdict = classifyTool({
      name: "list_files",
      description: "lists files. does not delete or send anything.",
    });
    expect(CATEGORY_RISK[verdict.category]).toBe("read");
  });

  it("keeps the consent gate and the badge in agreement", () => {
    // The gate is derived from the same classification the badge shows, so a
    // tool cannot display "read" while being treated as a write, or vice versa.
    for (const [name] of cases) {
      const verdict = classifyTool({ name });
      const sensitive = categoryIsSensitive(verdict.category, verdict.needsReview);
      expect(isSensitiveTool({ name, description: "" })).toBe(sensitive);
      if (CATEGORY_RISK[verdict.category] !== "read") expect(sensitive).toBe(true);
    }
  });
});

describe("the tier engine honours a settled category", () => {
  it("prefers the stored category over the name-based fallback", () => {
    // A human said this only reads, despite the alarming name.
    expect(mcpToolRisk({ name: "delete_draft", sensitive: true, category: "read" })).toBe("read");
    // With no category, the conservative name rule still applies.
    expect(mcpToolRisk({ name: "delete_draft", sensitive: true })).toBe("destructive");
  });

  it("never lets an unknown category silently downgrade a tool", () => {
    expect(mcpToolRisk({ name: "wipe_database", sensitive: true, category: "not-a-category" })).toBe(
      "destructive"
    );
  });
});

describe("the gallery", () => {
  it("is data only — no entry carries an implementation", () => {
    for (const e of listCatalog()) {
      expect(e.id).toMatch(/^[a-z0-9-]+$/);
      expect(e.tagline.length).toBeGreaterThan(0);
      // Remote and local entries pre-fill a config; native adapters connect by
      // OAuth and name the provider that handles them instead.
      if (e.deployment === "native") expect(e.providerKey).toBeTruthy();
      else expect(e.config).toBeTruthy();
    }
  });

  it("every pre-filled configuration is one the parser accepts", () => {
    for (const e of listCatalog()) {
      if (!e.config) continue;
      const out = parseMcpConfig(e.config);
      expect(out.ok, `${e.id} ships a config the parser rejects`).toBe(true);
      expect(out.servers[0].transport).toBe(e.deployment === "local" ? "stdio" : "http");
    }
  });

  it("every native adapter names a provider that actually exists", async () => {
    const { getProvider } = await import("../src/lib/integrations/registry");
    for (const e of listCatalog()) {
      if (e.deployment !== "native" || !e.providerKey) continue;
      expect(getProvider(e.providerKey), `${e.id} points at a missing provider`).toBeTruthy();
    }
  });

  it("searches by name, purpose and alias", () => {
    expect(searchCatalog("github").map((e) => e.id)).toContain("github");
    expect(searchCatalog("email").map((e) => e.id)).toContain("google");
    expect(searchCatalog("browser").map((e) => e.id)).toContain("playwright");
    // Every term must match — a two-word query narrows, it doesn't widen.
    expect(searchCatalog("zzzz nothing")).toHaveLength(0);
    expect(searchCatalog("")).toHaveLength(listCatalog().length);
  });
});
