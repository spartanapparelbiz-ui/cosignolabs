import { describe, expect, it } from "vitest";
import { parseMcpPaste } from "../src/lib/integrations/mcp/import";

/**
 * Connecting a capability from one paste.
 *
 * The manual form asked three questions before anything happened — URL,
 * transport, display name — and two of them the server can answer itself.
 * These pin what a paste is allowed to mean, and in particular the case that
 * would otherwise fail confusingly: a config that launches a program on the
 * user's own machine, which a hosted app cannot do at all.
 */

describe("what a paste can be", () => {
  it("takes a bare URL", () => {
    const { servers } = parseMcpPaste("  https://mcp.example.com/rpc  ");
    expect(servers).toEqual([{ url: "https://mcp.example.com/rpc" }]);
  });

  it("takes the standard config block people already copy between apps", () => {
    const { servers } = parseMcpPaste(
      JSON.stringify({
        mcpServers: {
          docs: { url: "https://docs.example.com/mcp", type: "http" },
          search: { url: "https://search.example.com/sse", type: "sse" },
        },
      })
    );
    expect(servers).toHaveLength(2);
    expect(servers[0]).toMatchObject({ displayName: "docs", url: "https://docs.example.com/mcp", transport: "http" });
    expect(servers[1]).toMatchObject({ displayName: "search", transport: "sse" });
  });

  it("accepts the wrappers editors put around that block", () => {
    expect(parseMcpPaste(JSON.stringify({ servers: { a: { url: "https://a.example/mcp" } } })).servers).toHaveLength(1);
    expect(parseMcpPaste(JSON.stringify({ mcp: { servers: { a: { url: "https://a.example/mcp" } } } })).servers).toHaveLength(1);
    expect(parseMcpPaste(JSON.stringify({ url: "https://solo.example/mcp" })).servers).toHaveLength(1);
  });

  it("moves a bearer token out of the headers, so it can be encrypted", () => {
    const { servers } = parseMcpPaste(
      JSON.stringify({
        mcpServers: {
          private: {
            url: "https://private.example/mcp",
            headers: { Authorization: "Bearer sk-secret-123", "X-Tenant": "acme" },
          },
        },
      })
    );
    // The credential belongs in the encrypted field, not sitting in a header
    // map that gets stored and displayed alongside ordinary config.
    expect(servers[0].bearer).toBe("sk-secret-123");
    expect(servers[0].headers).toEqual({ "X-Tenant": "acme" });
    expect(JSON.stringify(servers[0].headers)).not.toContain("sk-secret");
  });

  it("leaves the transport unset when the config doesn't say, so it can be discovered", () => {
    const { servers } = parseMcpPaste(JSON.stringify({ mcpServers: { x: { url: "https://x.example/mcp" } } }));
    // Guessing here is what makes a working server look broken; the caller
    // tries both instead.
    expect(servers[0].transport).toBeUndefined();
  });
});

describe("configs that cannot work in a hosted app", () => {
  it("explains a command-based server instead of failing cryptically", () => {
    const { servers, skipped } = parseMcpPaste(
      JSON.stringify({
        mcpServers: {
          filesystem: { command: "npx", args: ["-y", "@modelcontextprotocol/server-filesystem", "/tmp"] },
        },
      })
    );
    // This is the most common shape of config in the wild. It launches a
    // process on the user's own computer — there is no such computer here.
    expect(servers).toHaveLength(0);
    expect(skipped).toHaveLength(1);
    expect(skipped[0].name).toBe("filesystem");
    expect(skipped[0].reason).toMatch(/your own computer/i);
    expect(skipped[0].reason).toMatch(/hosted URL/i);
  });

  it("connects the usable servers in a mixed config and names the ones it skipped", () => {
    const { servers, skipped } = parseMcpPaste(
      JSON.stringify({
        mcpServers: {
          local: { command: "npx", args: ["thing"] },
          remote: { url: "https://remote.example/mcp" },
        },
      })
    );
    // One unusable entry must not cost the user the entry that works.
    expect(servers.map((s) => s.displayName)).toEqual(["remote"]);
    expect(skipped.map((s) => s.name)).toEqual(["local"]);
  });
});

describe("input that isn't a config at all", () => {
  it("returns nothing rather than guessing", () => {
    for (const junk of ["", "   ", "hello there", "not json {", "ftp://files.example.com"]) {
      const { servers } = parseMcpPaste(junk);
      expect(servers).toHaveLength(0);
    }
  });

  it("ignores an entry with no URL and no command", () => {
    const { servers, skipped } = parseMcpPaste(JSON.stringify({ mcpServers: { odd: { note: "hi" } } }));
    expect(servers).toHaveLength(0);
    expect(skipped[0].reason).toMatch(/no URL/i);
  });

  it("bounds a huge paste instead of doing unbounded work", () => {
    const many: Record<string, unknown> = {};
    for (let i = 0; i < 200; i++) many[`s${i}`] = { url: `https://s${i}.example/mcp` };
    const { servers } = parseMcpPaste(JSON.stringify({ mcpServers: many }));
    expect(servers.length).toBeLessThanOrEqual(20);
  });

  it("refuses a non-http scheme, at the parser and at the validator", async () => {
    // A bare file:// paste is not a URL this accepts at all.
    expect(parseMcpPaste("file:///etc/passwd").servers).toHaveLength(0);

    // Inside a JSON config it parses as a string, so the guarantee has to come
    // from the validator that runs before any request is made. Assert that
    // directly rather than trusting a comment.
    const { validateMcpUrl } = await import("../src/lib/integrations/mcp/register");
    for (const bad of ["file:///etc/passwd", "ftp://x.example/a", "gopher://x", "javascript:alert(1)"]) {
      expect(validateMcpUrl(bad).ok).toBe(false);
    }
    // Plain http to a remote host is refused too — only localhost may skip TLS.
    expect(validateMcpUrl("http://remote.example/mcp").ok).toBe(false);
    expect(validateMcpUrl("http://localhost:3000/mcp").ok).toBe(true);
    expect(validateMcpUrl("https://remote.example/mcp").ok).toBe(true);
  });
});
