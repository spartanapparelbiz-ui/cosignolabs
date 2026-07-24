import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryStore } from "../../src/lib/store/memory";
import { resetRateLimitsForTests } from "../../src/lib/ratelimit";
import { safeRedirect, withRedirect } from "@/components/auth/authRedirect";
import {
  friendlyAuthError,
  isAlreadyRegistered,
  signUpHitExistingUser,
} from "@/components/auth/supabaseErrors";

/**
 * The custom auth surface keeps Supabase Auth as the engine but the look is
 * ours. Three things need pinning:
 *   1. the post-auth redirect is open-redirect-safe (only same-origin paths);
 *   2. provider errors become calm brand copy and never leak the raw cause;
 *   3. the branded /sign-in and /sign-up routes stay public.
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

describe("auth errors → calm copy, never the raw cause", () => {
  const LEAKY = /sk-|supabase|_key|token|http|stack|\.ts:|jwt/i;

  it("maps known codes to brand-voice sentences", () => {
    expect(friendlyAuthError({ code: "invalid_credentials" }, "sign-in")).toMatch(/password/i);
    expect(friendlyAuthError({ code: "user_already_exists" }, "sign-up")).toMatch(
      /already registered — sign in instead/i
    );
    expect(friendlyAuthError({ code: "email_not_confirmed" }, "sign-in")).toMatch(/confirm/i);
    expect(friendlyAuthError({ code: "otp_expired" }, "sign-up")).toMatch(/expired/i);
    expect(friendlyAuthError({ code: "weak_password" }, "sign-up")).toMatch(/stronger/i);
  });

  it("detects the two 'already exists' shapes so signup can recover", () => {
    // the explicit error code…
    expect(isAlreadyRegistered({ code: "email_exists" })).toBe(true);
    expect(isAlreadyRegistered({ code: "invalid_credentials" })).toBe(false);
    // …and the anti-enumeration fake success (user with zero identities)
    expect(signUpHitExistingUser({ identities: [] })).toBe(true);
    expect(signUpHitExistingUser({ identities: [{ id: "x" }] })).toBe(false);
    expect(signUpHitExistingUser(null)).toBe(false);
  });

  it("falls back to a safe generic per mode for unknown/garbage input", () => {
    expect(friendlyAuthError(null, "sign-in")).toMatch(/sign you in/i);
    expect(friendlyAuthError({}, "sign-up")).toMatch(/create your account/i);
    expect(friendlyAuthError("boom", "sign-in")).toMatch(/try again/i);
  });

  it("never echoes the provider's raw message, even when handed one", () => {
    const raw = {
      code: "unknown_x",
      message: "supabase sk-live-secret at auth.ts:42 token=abc https://x.supabase.co jwt",
    };
    for (const mode of ["sign-in", "sign-up"] as const) {
      expect(friendlyAuthError(raw, mode)).not.toMatch(LEAKY);
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

  for (const path of ["/sign-in", "/sign-up", "/terms", "/privacy"]) {
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
