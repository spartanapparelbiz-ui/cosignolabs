import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { getProvider, listProviderMeta } from "../src/lib/integrations/registry";

/**
 * A Connect button must never do nothing.
 *
 * It used to be `disabled` whenever the deployment had no credentials for that
 * provider, or no vault key. Disabling is how the code said "you can't connect
 * this" — but a greyed-out button that swallows the click is indistinguishable
 * from a broken one, and it hides the single fact that would let someone fix
 * it: which environment variables are missing.
 *
 * Every control now stays clickable and answers.
 */

const PANEL = readFileSync("src/components/account/ConnectionsPanel.tsx", "utf8");
const CONNECT_ROUTE = readFileSync("src/app/api/connections/[key]/connect/route.ts", "utf8");

describe("no control is disabled by configuration state", () => {
  it("the connect button is only disabled while its own request is in flight", () => {
    expect(PANEL).toMatch(/disabled=\{busy === p\.key\}/);
    // The old guards would swallow the click and say nothing.
    expect(PANEL).not.toMatch(/disabled=\{!p\.configured/);
    expect(PANEL).not.toMatch(/disabled=\{!data\?\.vaultReady\}/);
    expect(PANEL).not.toMatch(/disabled=\{!data\.vaultReady/);
  });

  it("the MCP and custom-API controls open and explain instead of greying out", () => {
    expect(PANEL).toMatch(/onClick=\{\(\) => requireVault\(\) && setAddOpen/);
    expect(PANEL).toMatch(/onClick=\{\(\) => requireVault\(\) && setAddApiOpen/);
  });
});

describe("every refusal names what is missing", () => {
  /**
   * A refusal has three jobs: name what happened, say why, and say who can
   * change it. It must do all three WITHOUT a variable name — the person
   * reading it in a browser cannot set one, so naming it only tells them they
   * are not the audience. Setting names belong in diagnostics, for whoever is.
   */
  it("a provider that is switched off names the app and who can enable it", () => {
    expect(PANEL).toMatch(/isn't switched on for this workspace yet/);
    expect(PANEL).toMatch(/an administrator can enable it/);
    expect(PANEL).toMatch(/nothing to fix on your side/);
  });

  it("a workspace without secure storage says so, and why it matters", () => {
    expect(PANEL).toMatch(/connecting apps isn't switched on for this workspace yet/);
    expect(PANEL).toMatch(/won't hold an account's keys until secure storage is turned on/);
    expect(PANEL).toMatch(/until an administrator enables it/);
  });

  it("no message shown to a customer names a setting they cannot change", () => {
    // Only PROSE matters: `TIER_META` as a constant is fine, "set TIER_META"
    // shown to a founder is not. Comments explaining the rule are stripped.
    const code = PANEL.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
    const prose = (code.match(/"[^"\n]*\s[^"\n]*"/g) ?? []).concat(
      code.match(/`[^`\n]*\s[^`\n]*`/g) ?? []
    );
    const leaks = prose.filter((line) => /\b[A-Z][A-Z0-9]{2,}(_[A-Z0-9]+)+\b/.test(line));
    expect(
      leaks,
      `these customer-facing strings name a setting nobody can change from a browser: ${leaks.join(" | ")}`
    ).toEqual([]);
  });

  it("never renders the list of settings an administrator must set", () => {
    const code = PANEL.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
    // The field may exist on the type — it must never be read into a message.
    const declarations = code.match(/setupEnv\?: string\[\];/g) ?? [];
    const allMentions = code.match(/setupEnv/g) ?? [];
    expect(
      allMentions.length,
      "setupEnv is read somewhere other than its type declaration — check it is not being shown"
    ).toBe(declarations.length);
  });

  it("a server that returns no link is an error, not a silent no-op", () => {
    // window.location.href = undefined would simply do nothing.
    expect(PANEL).toMatch(/if \(!url\) throw new Error/);
  });

  it("an API failure surfaces the server's own message", () => {
    expect(PANEL).toMatch(/setError\(e instanceof Error \? e\.message/);
  });
});

describe("the server states the reason too, so the client can relay it", () => {
  it.each([
    ["vault missing", /vault_unconfigured/],
    ["unknown provider", /unknown_provider/],
    ["provider not configured", /not_configured/],
  ])("%s is an explicit error", (_name, re) => {
    expect(CONNECT_ROUTE).toMatch(re);
  });

  it("names the provider in the not-configured message", () => {
    expect(CONNECT_ROUTE).toMatch(/\$\{provider\.name\} isn't set up on this server yet/);
  });
});

describe("every oauth provider can say what it needs", () => {
  it("declares its environment variable names", () => {
    const missing = listProviderMeta()
      .filter((m) => m.authType === "oauth2")
      .map((m) => ({ key: m.key, env: getProvider(m.key)?.setupEnv ?? [] }))
      .filter((p) => p.env.length === 0);
    expect(missing).toEqual([]);
  });

  it("declares names only — never a value", () => {
    for (const meta of listProviderMeta()) {
      for (const name of getProvider(meta.key)?.setupEnv ?? []) {
        // Env var NAMES are safe to show. A value never is.
        expect(name).toMatch(/^[A-Z][A-Z0-9_]+$/);
        expect(process.env[name] === undefined || name !== process.env[name]).toBe(true);
      }
    }
  });

  it("surfaces those names to the client, so the message can be specific", () => {
    const registry = readFileSync("src/lib/integrations/registry.ts", "utf8");
    expect(registry).toMatch(/setupEnv: p\.setupEnv \?\? \[\]/);
  });

  it("derives them in the shared factory rather than restating them", () => {
    // A second copy is a second thing to forget when one changes.
    const oauth = readFileSync("src/lib/integrations/providers/oauth.ts", "utf8");
    expect(oauth).toMatch(/setupEnv: \[cfg\.clientIdEnv/);
  });
});
