import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { isGuestId, newGuestId, GUEST_HEADER } from "../src/lib/publicMode";

/**
 * Public sandbox mode — the opt-in, no-login way to let anyone try cosigno on
 * an un-provisioned deployment, safely. These pin the guarantees:
 *  - guest ids are unguessable and confined to their own namespace;
 *  - the sandbox only serves when the flag is ON and the real keys are ABSENT
 *    (the real product always wins once configured);
 *  - a guest id is resolved from the forwarded header, and a missing/forged
 *    one never becomes a user id (fails closed to null).
 */

// A mutable header the mocked next/headers returns, so each test can vary it.
let headerValue: string | null = null;
vi.mock("next/headers", () => ({
  headers: async () => ({ get: (k: string) => (k === GUEST_HEADER ? headerValue : null) }),
  cookies: async () => ({ get: () => undefined }),
}));

// NODE_ENV is typed read-only; a mutable alias lets tests toggle it cleanly.
const penv = process.env as Record<string, string | undefined>;

const ENV_KEYS = [
  "NODE_ENV",
  "COSIGNO_PUBLIC_MODE",
  "NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY",
  "CLERK_SECRET_KEY",
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_ANON_KEY",
  "SUPABASE_SERVICE_ROLE_KEY",
  "PLANNER_API_KEY",
  "ANTHROPIC_API_KEY",
] as const;
let saved: Record<string, string | undefined> = {};

beforeEach(() => {
  saved = {};
  for (const k of ENV_KEYS) saved[k] = penv[k];
  headerValue = null;
});
afterEach(() => {
  for (const k of ENV_KEYS) {
    if (saved[k] === undefined) delete penv[k];
    else penv[k] = saved[k];
  }
  vi.resetModules();
});

function clearAllKeys() {
  for (const k of ENV_KEYS) delete penv[k];
}

describe("guest ids", () => {
  it("mints unguessable, namespaced ids that validate", () => {
    const a = newGuestId();
    const b = newGuestId();
    expect(a).toMatch(/^guest_[0-9a-f]{32}$/);
    expect(a).not.toBe(b);
    expect(isGuestId(a)).toBe(true);
  });

  it("rejects forged or reserved ids", () => {
    expect(isGuestId("demo-user")).toBe(false);
    expect(isGuestId("user_123")).toBe(false);
    expect(isGuestId("guest_short")).toBe(false);
    expect(isGuestId(null)).toBe(false);
    expect(isGuestId("guest_" + "z".repeat(32))).toBe(false);
  });
});

describe("env gating — the sandbox only serves when it should", () => {
  it("fails closed in production without keys when the flag is off", async () => {
    clearAllKeys();
    penv.NODE_ENV = "production";
    const env = await import("../src/lib/env");
    expect(env.publicSandboxEnabled()).toBe(false);
    expect(env.servingAllowed()).toBe(false);
    expect(env.publicSandboxActive()).toBe(false);
  });

  it("serves the sandbox in production without keys when the flag is on", async () => {
    clearAllKeys();
    penv.NODE_ENV = "production";
    process.env.COSIGNO_PUBLIC_MODE = "1";
    const env = await import("../src/lib/env");
    expect(env.servingAllowed()).toBe(true);
    expect(env.publicSandboxActive()).toBe(true);
  });

  it("ignores the flag once the real keys are present (real product wins)", async () => {
    clearAllKeys();
    penv.NODE_ENV = "production";
    process.env.COSIGNO_PUBLIC_MODE = "1";
    process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY = "pk";
    process.env.CLERK_SECRET_KEY = "sk";
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://x.supabase.co";
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "anon";
    process.env.SUPABASE_SERVICE_ROLE_KEY = "svc";
    process.env.PLANNER_API_KEY = "key";
    const env = await import("../src/lib/env");
    expect(env.productionReady()).toBe(true);
    expect(env.publicSandboxActive()).toBe(false); // real product, not sandbox
  });
});

describe("getUserId — guest resolution is fail-closed", () => {
  it("returns the forwarded guest id in an active sandbox", async () => {
    clearAllKeys();
    penv.NODE_ENV = "production";
    process.env.COSIGNO_PUBLIC_MODE = "1";
    const id = newGuestId();
    headerValue = id;
    const { getUserId } = await import("../src/lib/auth");
    expect(await getUserId()).toBe(id);
  });

  it("returns null when the sandbox is active but no valid guest id is present", async () => {
    clearAllKeys();
    penv.NODE_ENV = "production";
    process.env.COSIGNO_PUBLIC_MODE = "1";
    headerValue = "not-a-guest";
    const { getUserId } = await import("../src/lib/auth");
    expect(await getUserId()).toBeNull();
  });

  it("never returns a guest id in production without the flag (fails closed)", async () => {
    clearAllKeys();
    penv.NODE_ENV = "production";
    headerValue = newGuestId();
    const { getUserId } = await import("../src/lib/auth");
    expect(await getUserId()).toBeNull();
  });
});
