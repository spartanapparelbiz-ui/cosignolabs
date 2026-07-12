import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryStore } from "../../src/lib/store/memory";
import { resetRateLimitsForTests } from "../../src/lib/ratelimit";
import { nextRunAt, runAutomation } from "../../src/lib/automations";

/**
 * Automations = recurring missions. The invariants proven here: every run
 * goes through the normal pipeline (cards PROPOSED, nothing beyond tier-1
 * executes), runs are owner-scoped, pause/delete stop future runs
 * immediately, the tick endpoint fails closed without its secret, and the
 * account cascade sweeps automations.
 */

const currentUser = vi.hoisted(() => ({ id: "user-a" }));

vi.mock("@/lib/auth", () => ({
  clerkConfigured: () => true,
  DEMO_USER_ID: "demo-user",
  getUserId: vi.fn(async () => currentUser.id),
}));

let store: MemoryStore;

function jsonReq(url: string, method: string, body?: unknown, headers: Record<string, string> = {}) {
  return new NextRequest(url, {
    method,
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    headers: { "Content-Type": "application/json", ...headers },
  });
}

async function createViaApi(name = "morning review", intervalHours = 24) {
  const { POST } = await import("../../src/app/api/automations/route");
  const res = await POST(
    jsonReq("http://localhost/api/automations", "POST", {
      name,
      command: "review my inbox and prepare replies",
      interval_hours: intervalHours,
    })
  );
  expect(res.status).toBe(200);
  return (await res.json()).automation;
}

beforeEach(() => {
  store = new MemoryStore();
  (globalThis as Record<string, unknown>).__cosignoStore = store;
  resetRateLimitsForTests();
  currentUser.id = "user-a";
});
afterEach(() => {
  vi.unstubAllEnvs();
});

describe("create → run now → proposals through the real pipeline", () => {
  it("a run plans actions and records an honest run row", async () => {
    const automation = await createViaApi();
    const params = { params: Promise.resolve({ id: automation.id }) };
    const { POST: RUN } = await import("../../src/app/api/automations/[id]/run/route");
    const res = await RUN(jsonReq(`http://localhost/api/automations/${automation.id}/run`, "POST"), params);
    expect(res.status).toBe(200);
    const { run } = await res.json();
    expect(run.status).toBe("ok");
    expect(run.session_id).toBeTruthy();

    // The run went through the pipeline: actions exist, and nothing beyond
    // tier 1 reached `executed` without a signature.
    const actions = await store.listActions("user-a");
    expect(actions.length).toBeGreaterThan(0);
    for (const a of actions) {
      if (a.status === "executed") expect(a.tier).toBe(1);
      else expect(["proposed", "failed"]).toContain(a.status);
    }
    // Schedule advanced.
    const after = await store.getAutomation("user-a", automation.id);
    expect(after!.last_run_at).toBeTruthy();
  });
});

describe("owner isolation", () => {
  it("user B cannot read, run, or delete user A's automation", async () => {
    const automation = await createViaApi();
    currentUser.id = "user-b";
    const params = { params: Promise.resolve({ id: automation.id }) };

    const { GET } = await import("../../src/app/api/automations/[id]/route");
    expect((await GET(jsonReq(`http://x/api/automations/${automation.id}`, "GET"), params)).status).toBe(404);

    const { POST: RUN } = await import("../../src/app/api/automations/[id]/run/route");
    expect((await RUN(jsonReq(`http://x/api/automations/${automation.id}/run`, "POST"), params)).status).toBe(404);

    const { DELETE } = await import("../../src/app/api/automations/[id]/route");
    await DELETE(jsonReq(`http://x/api/automations/${automation.id}`, "DELETE"), params);
    currentUser.id = "user-a";
    expect(await store.getAutomation("user-a", automation.id)).not.toBeNull();
  });
});

describe("pause + delete are immediate kill switches", () => {
  it("a paused automation is never due; delete removes it and its runs", async () => {
    const automation = await createViaApi();
    // Force it due, then pause.
    await store.updateAutomation("user-a", automation.id, {
      next_run_at: new Date(Date.now() - 1000).toISOString(),
      enabled: false,
    });
    expect(await store.listDueAutomations(10)).toHaveLength(0);

    await store.updateAutomation("user-a", automation.id, { enabled: true });
    expect(await store.listDueAutomations(10)).toHaveLength(1);

    await runAutomation((await store.getAutomation("user-a", automation.id))!);
    expect((await store.listAutomationRuns("user-a", automation.id)).length).toBe(1);

    await store.deleteAutomation("user-a", automation.id);
    expect(await store.getAutomation("user-a", automation.id)).toBeNull();
    expect(await store.listAutomationRuns("user-a", automation.id)).toHaveLength(0);
  });
});

describe("the tick endpoint fails closed", () => {
  it("503 with no CRON_SECRET; 401 with the wrong one; runs due work with the right one", async () => {
    const automation = await createViaApi();
    await store.updateAutomation("user-a", automation.id, {
      next_run_at: new Date(Date.now() - 1000).toISOString(),
    });
    const { POST: TICK } = await import("../../src/app/api/automations/tick/route");

    vi.stubEnv("CRON_SECRET", "");
    expect((await TICK(jsonReq("http://x/api/automations/tick", "POST"))).status).toBe(503);

    vi.stubEnv("CRON_SECRET", "s3cret");
    expect(
      (await TICK(jsonReq("http://x/api/automations/tick", "POST", undefined, { "x-cron-secret": "nope" }))).status
    ).toBe(401);

    const ok = await TICK(
      jsonReq("http://x/api/automations/tick", "POST", undefined, { "x-cron-secret": "s3cret" })
    );
    expect(ok.status).toBe(200);
    expect((await ok.json()).ran).toBe(1);
    // Schedule advanced → no longer due.
    expect(await store.listDueAutomations(10)).toHaveLength(0);
  });
});

describe("account cascade sweeps automations", () => {
  it("deleteAllUserData removes automations and runs", async () => {
    const automation = await createViaApi();
    await runAutomation((await store.getAutomation("user-a", automation.id))!);
    await store.deleteAllUserData("user-a");
    expect(await store.listAutomations("user-a")).toHaveLength(0);
    expect(await store.listAutomationRuns("user-a", automation.id)).toHaveLength(0);
  });
});

describe("scheduling math", () => {
  it("nextRunAt advances by the interval", () => {
    const from = new Date("2026-07-12T00:00:00Z");
    expect(nextRunAt(24, from)).toBe("2026-07-13T00:00:00.000Z");
    expect(nextRunAt(1, from)).toBe("2026-07-12T01:00:00.000Z");
  });
});
