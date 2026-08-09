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
    // Disabled ONLY while this app's own request is in flight — never because
    // of how the workspace is set up.
    expect(PANEL).toMatch(/disabled=\{busy === (p|provider)\.key\}/);
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
    expect(PANEL).toMatch(/connecting apps isn't switched on for this workspace yet/i);
    expect(PANEL).toMatch(/won't hold an account's keys until secure storage is turned on/);
    expect(PANEL).toMatch(/until an administrator enables it/);
  });

  it("no message shown to a customer names a setting they cannot change", () => {
    // Only PROSE matters: `TIER_META` as a constant is fine, "set TIER_META"
    // shown to a founder is not. Comments explaining the rule are stripped.
    const code = PANEL.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
    const prose: string[] = [
      ...(code.match(/"[^"\n]*\s[^"\n]*"/g) ?? []),
      ...(code.match(/`[^`\n]*\s[^`\n]*`/g) ?? []),
    ];
    const leaks = prose.filter((line) => /\b[A-Z][A-Z0-9]{2,}(_[A-Z0-9]+)+\b/.test(line));
    expect(
      leaks,
      `these customer-facing strings name a setting nobody can change from a browser: ${leaks.join(" | ")}`
    ).toEqual([]);
  });

  /**
   * Setting names may be disclosed to whoever can act on them, and to nobody
   * else. The only place that is allowed is DeveloperDetails, which returns
   * null outside a development build — so the guarantee is not "the names are
   * gone", it is "the names are behind that gate".
   */
  it("only discloses setting names behind the development-only gate", () => {
    const code = PANEL.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
    const gate = code.indexOf("function DeveloperDetails");
    expect(gate, "DeveloperDetails must exist as the single disclosure point").toBeGreaterThan(-1);

    /* The gate's real extent, not a guessed window. `at > gate` would have
       passed every component declared BELOW DeveloperDetails — i.e. most of
       the file — so the assertion has to end where the function ends. */
    const rest = code.slice(gate + 1);
    const nextTopLevel = rest.search(/\n(?:export )?function /);
    const end = nextTopLevel === -1 ? code.length : gate + 1 + nextTopLevel;

    // The gate itself refuses outside development.
    const gateBody = code.slice(gate, end);
    expect(gateBody).toMatch(/process\.env\.NODE_ENV !== "development"/);
    expect(gateBody).toMatch(/return null/);

    // Every read of setupEnv, and every literal setting name, is inside it.
    for (const needle of ["setupEnv", "INTEGRATIONS_ENCRYPTION_KEY"]) {
      let at = code.indexOf(needle);
      while (at !== -1) {
        const isDeclaration = code.slice(at, at + 24).startsWith("setupEnv?: string[]");
        if (!isDeclaration) {
          expect(
            at >= gate && at < end,
            `"${needle}" is read outside the body of DeveloperDetails`
          ).toBe(true);
        }
        at = code.indexOf(needle, at + 1);
      }
    }
  });

  it("a server that returns no link is an error, not a silent no-op", () => {
    // window.location.href = undefined would simply do nothing.
    // It must be a CODED failure: readable() maps codes, so a bare Error
    // would collapse into the generic fallback and lose the sentence.
    expect(PANEL).toMatch(/if \(!url\) throw new ApiFailure\("no_signin_link"/);
    // …and that code must have wording, or readable() falls back anyway.
    const map = PANEL.match(/const FAILURE_MESSAGE: Record<string, string> = \{[\s\S]*?\n\};/)?.[0];
    expect(map, "FAILURE_MESSAGE must exist").toBeTruthy();
    expect(map).toMatch(/\n\s*no_signin_link:/);
  });

  /**
   * The inverse of what this once asserted. Rendering the server's sentence
   * is how "Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET, then redeploy"
   * reached a customer: any layer that threw got to write the UI's copy.
   * The panel now maps a failure CODE to its own wording.
   */
  it("never renders the server's own sentence", () => {
    expect(PANEL).not.toMatch(/setError\(e instanceof Error \? e\.message/);
    expect(PANEL).not.toMatch(/toast\("error", e instanceof Error \? e\.message/);
    expect(PANEL).toMatch(/function readable\(err: unknown\)/);
    expect(PANEL).toMatch(/const FAILURE_MESSAGE: Record<string, string>/);
  });

  it("routes every caught failure through that mapping", () => {
    const catches = PANEL.match(/catch \(e\) \{[\s\S]{0,200}?\}/g) ?? [];
    const shown = catches.filter((block) => /setError|setImportMsg|onError|toast\(/.test(block));
    expect(shown.length, "expected some catch blocks that show a message").toBeGreaterThan(4);
    for (const block of shown) {
      expect(block, `this catch shows a message without readable():\n${block}`).toMatch(/readable\(e\)/);
    }
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

  it("names the app, and never the settings, in the not-configured message", () => {
    expect(CONNECT_ROUTE).toMatch(/\$\{provider\.name\} sign-in isn't available right now/);
    // The settings ride in the developer channel, which is stripped in prod.
    expect(CONNECT_ROUTE).toMatch(/provider\.setupEnv \?\? \[\]/);
    const messages = CONNECT_ROUTE.match(/"[^"\n]*\s[^"\n]*"/g) ?? [];
    for (const m of messages) {
      expect(m, `message names a setting: ${m}`).not.toMatch(/\b[A-Z][A-Z0-9]{2,}(_[A-Z0-9]+)+\b/);
    }
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
