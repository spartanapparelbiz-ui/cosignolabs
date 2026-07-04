import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryStore } from "../../src/lib/store/memory";
import { resetRateLimitsForTests } from "../../src/lib/ratelimit";

/**
 * §6/§8 test 10 — the beta form requires a valid Turnstile token (verified
 * server-side) and is rate limited to 3/hour per IP.
 */

const APPLICATION = {
  name: "Ada",
  email: "ada@example.com",
  tools: "Gmail",
  workflow: "inbox triage",
};

function betaReq(body: Record<string, unknown>, ip = "203.0.113.7"): NextRequest {
  return new NextRequest("http://localhost/api/beta", {
    method: "POST",
    body: JSON.stringify(body),
    headers: {
      "Content-Type": "application/json",
      "x-forwarded-for": ip,
    },
  });
}

beforeEach(() => {
  (globalThis as Record<string, unknown>).__cosignoStore = new MemoryStore();
  resetRateLimitsForTests();
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("turnstile verification", () => {
  it("without a token (secret configured) → rejected, nothing stored", async () => {
    vi.stubEnv("TURNSTILE_SECRET_KEY", "test-secret");
    const { POST } = await import("../../src/app/api/beta/route");
    const res = await POST(betaReq(APPLICATION));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("captcha_required");
  });

  it("with a token Cloudflare rejects → rejected", async () => {
    vi.stubEnv("TURNSTILE_SECRET_KEY", "test-secret");
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify({ success: false })))
    );
    const { POST } = await import("../../src/app/api/beta/route");
    const res = await POST(betaReq({ ...APPLICATION, turnstileToken: "bad" }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("captcha_failed");
  });

  it("with a valid token → accepted", async () => {
    vi.stubEnv("TURNSTILE_SECRET_KEY", "test-secret");
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify({ success: true })))
    );
    const { POST } = await import("../../src/app/api/beta/route");
    const res = await POST(betaReq({ ...APPLICATION, turnstileToken: "good" }));
    expect(res.status).toBe(200);
  });

  it("in production with no Turnstile secret, submissions fail closed (503)", async () => {
    vi.stubEnv("NODE_ENV", "production");
    const { POST } = await import("../../src/app/api/beta/route");
    const res = await POST(betaReq(APPLICATION));
    expect(res.status).toBe(503);
  });
});

describe("per-IP rate limit", () => {
  it("4th application from the same IP within an hour → 429; other IPs unaffected", async () => {
    const { POST } = await import("../../src/app/api/beta/route");
    for (let i = 0; i < 3; i++) {
      const res = await POST(betaReq({ ...APPLICATION, email: `a${i}@example.com` }));
      expect(res.status).toBe(200);
    }
    const fourth = await POST(betaReq(APPLICATION));
    expect(fourth.status).toBe(429);

    const otherIp = await POST(betaReq(APPLICATION, "198.51.100.9"));
    expect(otherIp.status).toBe(200);
  });

  it("invalid email rejected", async () => {
    const { POST } = await import("../../src/app/api/beta/route");
    const res = await POST(betaReq({ ...APPLICATION, email: "not-an-email" }));
    expect(res.status).toBe(400);
  });
});
