import { readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryStore } from "../../src/lib/store/memory";
import { resetRateLimitsForTests } from "../../src/lib/ratelimit";

/**
 * §1 / test 1: every /api route is enumerated from the filesystem (new
 * routes are covered automatically) and must return 401 without a session
 * — except the explicit public allowlist.
 * §1 / test 12: production with missing keys serves 503, never demo mode.
 */

vi.mock("@/lib/auth", () => ({
  clerkConfigured: () => true, // Clerk "configured" but no session
  DEMO_USER_ID: "demo-user",
  getUserId: vi.fn(async () => null),
}));

const API_DIR = join(process.cwd(), "src", "app", "api");
const UUID = "11111111-1111-4111-8111-111111111111";
const PUBLIC_ROUTES = new Set(["/api/health", "/api/beta", "/api/stripe/webhook"]);
const METHODS = ["GET", "POST", "PUT", "PATCH", "DELETE"] as const;

function findRouteFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const p = join(dir, entry);
    if (statSync(p).isDirectory()) out.push(...findRouteFiles(p));
    else if (entry === "route.ts") out.push(p);
  }
  return out;
}

function urlPath(file: string): string {
  return file
    .slice(file.indexOf("/src/app") + "/src/app".length)
    .replace(/\/route\.ts$/, "")
    .replace(/\[id\]/g, UUID);
}

function makeRequest(path: string, method: string): NextRequest {
  return new NextRequest(`http://localhost${path}`, {
    method,
    ...(method === "GET" || method === "DELETE"
      ? {}
      : { body: "{}", headers: { "Content-Type": "application/json" } }),
  });
}

beforeEach(() => {
  (globalThis as Record<string, unknown>).__cosignoStore = new MemoryStore();
  resetRateLimitsForTests();
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("route enumeration: unauthenticated → 401", () => {
  const files = findRouteFiles(API_DIR);

  it("finds the API surface", () => {
    expect(files.length).toBeGreaterThanOrEqual(10);
  });

  for (const file of files) {
    const path = urlPath(file);
    const isPublic = PUBLIC_ROUTES.has(path.replace(UUID, "[id]"));

    it(`${path} ${isPublic ? "is public by design" : "requires auth"}`, async () => {
      const mod = await import(file);
      for (const method of METHODS) {
        const handler = mod[method];
        if (typeof handler !== "function") continue;
        const res = await handler(makeRequest(path, method), {
          params: Promise.resolve({ id: UUID }),
        });
        if (isPublic) {
          expect(res.status, `${method} ${path}`).not.toBe(401);
        } else {
          expect(res.status, `${method} ${path} must 401 without a session`).toBe(401);
        }
      }
    });
  }
});

describe("production fail-closed (test 12)", () => {
  it("requireUser serves 503 when production keys are missing — not demo mode", async () => {
    vi.stubEnv("NODE_ENV", "production");
    const { POST } = await import("../../src/app/api/command/route");
    const res = await POST(
      new NextRequest("http://localhost/api/command", {
        method: "POST",
        body: JSON.stringify({ command: "hello" }),
        headers: { "Content-Type": "application/json" },
      })
    );
    expect(res.status).toBe(503);
    const body = await res.json();
    expect(body.error).toBe("not_configured");
  });

  it("middleware 503s /app and /api in unconfigured production, landing + health stay up", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.resetModules();
    const { default: middleware } = await import("../../src/middleware");
    const event = undefined as unknown as Parameters<typeof middleware>[1];

    for (const path of ["/app", "/app/activity", "/api/command", "/api/usage"]) {
      const res = await middleware(new NextRequest(`http://localhost${path}`), event);
      expect(res?.status, path).toBe(503);
    }
    for (const path of ["/", "/api/health"]) {
      const res = await middleware(new NextRequest(`http://localhost${path}`), event);
      expect(res?.status, path).not.toBe(503);
    }
  });

  it("the store never falls back to memory in production", async () => {
    vi.stubEnv("NODE_ENV", "production");
    const { getStore } = await import("../../src/lib/store");
    delete (globalThis as Record<string, unknown>).__cosignoStore;
    expect(() => getStore()).toThrow("supabase_not_configured");
  });

  it("getUserId never returns the demo user in production", async () => {
    vi.stubEnv("NODE_ENV", "production");
    // Use the real module (unmocked) for this check.
    const actual =
      await vi.importActual<typeof import("../../src/lib/auth")>("../../src/lib/auth");
    expect(await actual.getUserId()).toBeNull();
  });
});
