import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { appUrl } from "../src/lib/stripe";
import { redirectUri } from "../src/lib/integrations/oauthFlow";

/**
 * appUrl() decides where OAuth providers send people back to.
 *
 * It is the one setting whose failure is completely silent: a provider checks
 * the redirect URI against its own registration and refuses BEFORE reaching
 * our code, so there is no exception to catch, no log line, and nothing to
 * show the person — they simply end up back where they started. Which makes
 * "it guessed a domain that isn't this deployment" the worst possible default.
 */

const KEYS = [
  "NEXT_PUBLIC_APP_URL",
  "NEXT_PUBLIC_SITE_URL",
  "DEPLOY_PRIME_URL",
  "URL",
] as const;

let saved: Record<string, string | undefined>;

beforeEach(() => {
  saved = Object.fromEntries(KEYS.map((k) => [k, process.env[k]]));
  for (const k of KEYS) delete process.env[k];
});

afterEach(() => {
  for (const k of KEYS) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
});

describe("appUrl — where this deployment actually lives", () => {
  it("prefers an explicit setting over everything else", () => {
    process.env.NEXT_PUBLIC_APP_URL = "https://explicit.example";
    process.env.DEPLOY_PRIME_URL = "https://preview.netlify.app";
    process.env.URL = "https://production.example";
    expect(appUrl()).toBe("https://explicit.example");
  });

  it("uses the platform's address for THIS deploy when nothing is set by hand", () => {
    // Netlify publishes both on every build. Without this the app used to fall
    // back to a hardcoded domain and send people somewhere they aren't.
    process.env.DEPLOY_PRIME_URL = "https://deploy-preview-8--site.netlify.app";
    process.env.URL = "https://production.example";
    expect(appUrl()).toBe("https://deploy-preview-8--site.netlify.app");
  });

  it("falls back to the site's production domain when there is no preview address", () => {
    process.env.URL = "https://production.example";
    expect(appUrl()).toBe("https://production.example");
  });

  it("strips a trailing slash, which would otherwise break the exact match", () => {
    // "https://x/" + "/api/..." is a DIFFERENT string to the provider than the
    // one registered, and the comparison is exact.
    process.env.NEXT_PUBLIC_APP_URL = "https://x.example/";
    expect(appUrl()).toBe("https://x.example");
    expect(redirectUri("google")).toBe("https://x.example/api/connections/google/callback");
  });

  it("never emits a double slash in a redirect URI", () => {
    for (const value of ["https://x.example", "https://x.example/", "https://x.example///"]) {
      process.env.NEXT_PUBLIC_APP_URL = value;
      expect(redirectUri("github")).not.toMatch(/[^:]\/\//);
    }
  });
});
