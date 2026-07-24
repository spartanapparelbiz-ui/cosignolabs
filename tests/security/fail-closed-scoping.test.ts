import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryStore } from "../../src/lib/store/memory";
import { resetRateLimitsForTests } from "../../src/lib/ratelimit";

/**
 * Fail-closed SCOPING. The marketing surfaces must always render publicly
 * with zero env vars, in any environment; fail-closed applies ONLY to /app/*
 * and the non-preview API routes. This pins that boundary so a future change
 * can't accidentally take the whole site down (or expose the app keyless).
 */

vi.mock("@/lib/auth", () => ({
  authConfigured: () => true,
  DEMO_USER_ID: "demo-user",
  getUserId: vi.fn(async () => null),
}));

beforeEach(() => {
  (globalThis as Record<string, unknown>).__cosignoStore = new MemoryStore();
  resetRateLimitsForTests();
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

function req(path: string, method = "GET"): NextRequest {
  return new NextRequest(`http://localhost${path}`, { method });
}

describe("keyless production boot", () => {
  beforeEach(() => {
    vi.stubEnv("NODE_ENV", "production");
    // No SUPABASE/PLANNER keys → unconfigured production.
    vi.resetModules();
  });

  async function mw() {
    const { default: middleware } = await import("../../src/middleware");
    return middleware;
  }
  const event = undefined as never;

  it("landing / returns publicly (not 503)", async () => {
    const res = await (await mw())(req("/"), event);
    expect(res?.status).not.toBe(503);
  });

  it("/pricing returns publicly (not 503)", async () => {
    const res = await (await mw())(req("/pricing"), event);
    expect(res?.status).not.toBe(503);
  });

  it("/api/health returns publicly (not 503)", async () => {
    const res = await (await mw())(req("/api/health"), event);
    expect(res?.status).not.toBe(503);
  });

  it("/api/preview stays public keyless (the sandbox never dies)", async () => {
    const res = await (await mw())(req("/api/preview", "POST"), event);
    expect(res?.status).not.toBe(503);
  });

  it("/app serves a BRANDED HTML 503, not a raw error", async () => {
    const res = await (await mw())(req("/app"), event);
    expect(res?.status).toBe(503);
    expect(res?.headers.get("content-type")).toContain("text/html");
    const html = await res!.text();
    expect(html).toMatch(/warming up/i);
  });

  it("/app/account also serves the branded 503 page", async () => {
    const res = await (await mw())(req("/app/account"), event);
    expect(res?.status).toBe(503);
    expect(res?.headers.get("content-type")).toContain("text/html");
  });

  it("/api/command serves a JSON 503", async () => {
    const res = await (await mw())(req("/api/command", "POST"), event);
    expect(res?.status).toBe(503);
    expect(res?.headers.get("content-type")).toContain("application/json");
    const body = await res!.json();
    expect(body.error).toBe("not_configured");
  });
});

describe("the preview route runs keyless in production (200, mock only)", () => {
  it("POST /api/preview returns cards with no env vars set", async () => {
    vi.stubEnv("NODE_ENV", "production");
    const { POST } = await import("../../src/app/api/preview/route");
    const res = await POST(
      new NextRequest("http://localhost/api/preview", {
        method: "POST",
        body: JSON.stringify({ command: "clear my inbox of newsletters" }),
        headers: { "Content-Type": "application/json" },
      })
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(Array.isArray(body.cards)).toBe(true);
    expect(body.cards.length).toBeGreaterThan(0);
  });
});
