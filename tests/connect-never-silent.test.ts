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
  it("a provider without credentials is told which variables to set", () => {
    expect(PANEL).toMatch(/can't be connected because this deployment has no/);
    expect(PANEL).toMatch(/names\.join\(" and "\)/);
  });

  it("a missing vault key says so, and why it matters", () => {
    expect(PANEL).toMatch(/INTEGRATIONS_ENCRYPTION_KEY isn't set/);
    expect(PANEL).toMatch(/won't store credentials it can't encrypt/);
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
