import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryStore } from "../../src/lib/store/memory";
import { resetRateLimitsForTests } from "../../src/lib/ratelimit";

/**
 * §2 — cost protection: rate limits fire before the model, the usage meter
 * counts planning calls, oversized commands are rejected pre-model, and the
 * global circuit breaker bounds total daily spend.
 */

const planSpy = vi.hoisted(() => ({ calls: 0 }));

vi.mock("@/lib/auth", () => ({
  clerkConfigured: () => true,
  DEMO_USER_ID: "demo-user",
  getUserId: vi.fn(async () => "cost-user"),
}));

vi.mock("@/lib/agent/operator", async (importOriginal) => {
  const original =
    await importOriginal<typeof import("../../src/lib/agent/operator")>();
  return {
    ...original,
    planCommand: vi.fn(async (...args: Parameters<typeof original.planCommand>) => {
      planSpy.calls += 1;
      return original.planCommand(...args);
    }),
  };
});

function commandRequest(command: string): NextRequest {
  return new NextRequest("http://localhost/api/command", {
    method: "POST",
    body: JSON.stringify({ command }),
    headers: { "Content-Type": "application/json" },
  });
}

let store: MemoryStore;

beforeEach(() => {
  store = new MemoryStore();
  (globalThis as Record<string, unknown>).__cosignoStore = store;
  resetRateLimitsForTests();
  planSpy.calls = 0;
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("per-user command rate limit (test 5)", () => {
  it("the 11th command inside a minute → 429 and the model is NOT called", async () => {
    const { POST } = await import("../../src/app/api/command/route");
    for (let i = 0; i < 10; i++) {
      const res = await POST(commandRequest(`command number ${i}`));
      expect(res.status).toBe(200);
    }
    expect(planSpy.calls).toBe(10);

    const res11 = await POST(commandRequest("one more"));
    expect(res11.status).toBe(429);
    expect(res11.headers.get("Retry-After")).toBeTruthy();
    expect(planSpy.calls).toBe(10); // planner untouched by the 11th
  });
});

describe("usage meter counts planning (test 6)", () => {
  it("every command consumes one metered unit at planning time", async () => {
    const { POST } = await import("../../src/app/api/command/route");
    await POST(commandRequest("summarize my inbox"));
    const usage = await store.getUsage("cost-user");
    expect(usage.actions_executed).toBeGreaterThanOrEqual(1);
  });

  it("at the limit, planning is blocked with 402 BEFORE the model is called", async () => {
    const usage = await store.getUsage("cost-user");
    for (let i = 0; i < usage.limit; i++) await store.incrementUsage("cost-user");

    const { POST } = await import("../../src/app/api/command/route");
    const res = await POST(commandRequest("one more plan"));
    expect(res.status).toBe(402);
    expect(planSpy.calls).toBe(0);
  });
});

describe("oversized command (test 11)", () => {
  it("2,001 characters → 413, no model call", async () => {
    const { POST } = await import("../../src/app/api/command/route");
    const res = await POST(commandRequest("x".repeat(2001)));
    expect(res.status).toBe(413);
    expect(planSpy.calls).toBe(0);
  });

  it("a 100kB+ body → 413 regardless of field", async () => {
    const { POST } = await import("../../src/app/api/command/route");
    const res = await POST(
      new NextRequest("http://localhost/api/command", {
        method: "POST",
        body: JSON.stringify({ command: "hi", pad: "y".repeat(110_000) }),
        headers: { "Content-Type": "application/json" },
      })
    );
    expect(res.status).toBe(413);
    expect(planSpy.calls).toBe(0);
  });
});

describe("global circuit breaker", () => {
  it("planning stops for everyone past the daily budget", async () => {
    vi.stubEnv("COSIGNO_GLOBAL_DAILY_PLANS", "3");
    const { POST } = await import("../../src/app/api/command/route");

    for (let i = 0; i < 3; i++) {
      const res = await POST(commandRequest(`plan ${i}`));
      expect(res.status).toBe(200);
    }
    const res = await POST(commandRequest("past the cap"));
    expect(res.status).toBe(429);
    const body = await res.json();
    expect(body.message).toMatch(/beta capacity/i);
    expect(planSpy.calls).toBe(3);
  });
});

describe("transition rate limit", () => {
  it("31st transition in a minute → 429", async () => {
    const { POST: command } = await import("../../src/app/api/command/route");
    const { POST: veto } = await import("../../src/app/api/actions/[id]/veto/route");

    // 30 transition-limited calls, then one more must trip.
    const created = await command(commandRequest("reprice these products"));
    const { actions } = await created.json();
    const id = actions.find((a: { status: string }) => a.status === "proposed").id;

    let last = 0;
    for (let i = 0; i < 31; i++) {
      const res = await veto(
        new NextRequest(`http://localhost/api/actions/${id}/veto`, {
          method: "POST",
          body: "{}",
          headers: { "Content-Type": "application/json" },
        }),
        { params: Promise.resolve({ id }) }
      );
      last = res.status;
      if (res.status === 429) break;
    }
    expect(last).toBe(429);
  });
});
