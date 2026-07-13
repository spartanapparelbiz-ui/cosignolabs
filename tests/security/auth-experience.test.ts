import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryStore } from "../../src/lib/store/memory";
import { resetRateLimitsForTests } from "../../src/lib/ratelimit";
import { safeRedirect, withRedirect } from "@/components/auth/authRedirect";
import { friendlyClerkError } from "@/components/auth/clerkErrors";

/**
 * The custom auth surface keeps Clerk as the engine but replaces the look and
 * adds the redirect plumbing. Three things need pinning:
 *   1. the post-auth redirect is open-redirect-safe (only same-origin paths);
 *   2. provider errors become calm brand copy and never leak the raw cause;
 *   3. the branded /sign-in, /sign-up, /sso-callback routes stay public.
 */

describe("post-auth redirect is open-redirect-safe", () => {
  it("keeps ordinary same-origin paths", () => {
    expect(safeRedirect("/app")).toBe("/app");
    expect(safeRedirect("/app/account?tab=billing")).toBe(
      "/app/account?tab=billing"
    );
  });

  it("rejects anything that could leave the origin", () => {
    for (const evil of [
      "//evil.com",
      "/\\evil.com",
      "https://evil.com",
      "http://evil.com",
      "javascript:alert(1)",
      "evil.com",
      "",
      undefined,
      null,
    ]) {
      expect(safeRedirect(evil as string | undefined)).toBe("/app");
    }
  });

  it("preserves the destination when linking between modes, but not the default", () => {
    expect(withRedirect("/sign-up", "/app/account")).toBe(
      "/sign-up?redirect_url=%2Fapp%2Faccount"
    );
    expect(withRedirect("/sign-up", "/app")).toBe("/sign-up");
  });
});

describe("clerk errors → calm copy, never the raw cause", () => {
  const LEAKY = /sk-|clerk|_key|token|http|stack|\.ts:|instance/i;

  it("maps known codes to brand-voice sentences", () => {
    expect(
      friendlyClerkError({ errors: [{ code: "form_password_incorrect" }] }, "sign-in")
    ).toMatch(/password/i);
    expect(
      friendlyClerkError({ errors: [{ code: "form_identifier_exists" }] }, "sign-up")
    ).toMatch(/already exists/i);
    expect(
      friendlyClerkError({ errors: [{ code: "form_code_incorrect" }] }, "sign-up")
    ).toMatch(/code/i);
  });

  it("maps production bot-protection and restriction failures honestly (never a silent shrug)", () => {
    // The codes a production Clerk instance produces when the sign-up CAPTCHA
    // can't run or sign-ups are restricted — the failures that previously fell
    // into the generic bucket and made "sign-up is broken" undiagnosable.
    expect(
      friendlyClerkError({ errors: [{ code: "captcha_invalid" }] }, "sign-up")
    ).toMatch(/robot check/i);
    expect(
      friendlyClerkError({ errors: [{ code: "captcha_unavailable" }] }, "sign-up")
    ).toMatch(/robot check/i);
    expect(
      friendlyClerkError({ errors: [{ code: "sign_up_restricted" }] }, "sign-up")
    ).toMatch(/limited|invitation/i);
  });

  it("falls back to a safe generic per mode for unknown/garbage input", () => {
    expect(friendlyClerkError(null, "sign-in")).toMatch(/sign you in/i);
    expect(friendlyClerkError({}, "sign-up")).toMatch(/create your account/i);
    expect(friendlyClerkError("boom", "sign-in")).toMatch(/try again/i);
  });

  it("never echoes the provider's raw message, even when handed one", () => {
    const raw = {
      errors: [
        {
          code: "unknown_x",
          message:
            "clerk_instance sk-live-secret at auth.ts:42 token=abc https://api.clerk.dev",
        },
      ],
    };
    for (const mode of ["sign-in", "sign-up"] as const) {
      expect(friendlyClerkError(raw, mode)).not.toMatch(LEAKY);
    }
  });
});

describe("branded auth routes stay public in middleware", () => {
  beforeEach(() => {
    (globalThis as Record<string, unknown>).__cosignoStore = new MemoryStore();
    resetRateLimitsForTests();
    // Unconfigured production exercises the fail-closed branch: auth pages must
    // still be reachable there (never a 503 that hides the sign-in surface).
    vi.stubEnv("NODE_ENV", "production");
    vi.resetModules();
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  const event = undefined as never;

  for (const path of ["/sign-in", "/sign-up", "/sso-callback", "/terms", "/privacy"]) {
    it(`${path} is not gated behind a 503`, async () => {
      const { default: middleware } = await import("../../src/middleware");
      const res = await middleware(
        new NextRequest(`http://localhost${path}`),
        event
      );
      expect(res?.status).not.toBe(503);
    });
  }
});
