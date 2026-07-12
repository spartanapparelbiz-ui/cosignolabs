import { beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryStore } from "../../src/lib/store/memory";
import { resetRateLimitsForTests } from "../../src/lib/ratelimit";
import { advanceMission, controlMission, tickMissions } from "../../src/lib/missions/engine";
import { instantiateCompiledMission } from "../../src/lib/missions/create";
import { compileMission } from "../../src/lib/missions/compiler";
import { approveAction } from "../../src/lib/actions/engine";
import { isConsequential, READ_ONLY_KINDS } from "../../src/lib/browser/provider";

/**
 * The browser operator + compiled missions, end-to-end on the sandbox
 * provider (always labeled simulated). Proves: the laptop mission runs to a
 * verified, receipted result; consequential browser work is approval-gated
 * and never mixes with a payment that isn't available; sessions are
 * user-isolated; the budget cap holds; and overlapping ticks never double-run.
 */

vi.mock("@/lib/auth", () => ({
  clerkConfigured: () => true,
  DEMO_USER_ID: "demo-user",
  getUserId: vi.fn(async () => "user-a"),
}));

let store: MemoryStore;
beforeEach(() => {
  store = new MemoryStore();
  (globalThis as Record<string, unknown>).__cosignoStore = store;
  resetRateLimitsForTests();
});

async function drive(userId: string, id: string, passes = 12) {
  let last = null;
  for (let i = 0; i < passes; i++) {
    last = await advanceMission(userId, id);
    if (!last) break;
    if (["completed", "partial", "failed", "stopped", "awaiting_input", "awaiting_approval", "paused", "blocked"].includes(last.mission.state)) break;
  }
  return last!;
}

async function startLaptopMission(userId: string) {
  const compiled = await compileMission(userId, "compare the best laptops under $1,000");
  return instantiateCompiledMission(userId, compiled.plan);
}

describe("the laptop comparison mission (sandbox browser)", () => {
  it("researches, compares, prepares a purchase for approval, and never pays", async () => {
    const { mission } = await startLaptopMission("user-a");
    let r = await drive("user-a", mission.id);
    expect(r.mission.state).toBe("awaiting_approval");

    // Real browser actions were logged and labeled sandbox.
    const sessions = await store.listBrowserSessions("user-a", mission.id);
    expect(sessions.length).toBe(1);
    expect(sessions[0].simulated).toBe(true);
    const actions = await store.listBrowserActions("user-a", sessions[0].id);
    expect(actions.length).toBeGreaterThanOrEqual(4); // search + 3 product pages
    expect(actions.every((a) => a.risk === "read")).toBe(true);

    // A comparison deliverable exists with a recommendation.
    const files = await store.listFiles("user-a");
    expect(files.map((f) => f.name).join()).toMatch(/comparison/);

    // The purchase step is blocked on an approval card that plainly says no payment.
    const prep = r.steps.find((s) => s.tool === "browser.prepare_purchase")!;
    expect(prep.state).toBe("awaiting_approval");
    const card = (await store.getAction("user-a", prep.action_id!))!;
    expect(card.status).toBe("proposed");
    expect(String(card.payload.note)).toMatch(/no.*payment/i);

    // Approve → a consequential submit runs (add to cart), and verification
    // confirms the cart WITHOUT any payment.
    await approveAction("user-a", card.id);
    r = await drive("user-a", mission.id);
    const settled = r.steps.find((s) => s.tool === "browser.prepare_purchase")!;
    expect(settled.state).toBe("completed");
    expect(settled.verification?.ok).toBe(true);
    expect(String(settled.verification?.detail)).toMatch(/no payment was made/i);

    // The add-to-cart browser action is logged as consequential.
    const finalActions = await store.listBrowserActions("user-a", sessions[0].id);
    expect(finalActions.some((a) => a.risk === "consequential" && a.kind === "submitApprovedForm")).toBe(true);

    expect(r.mission.state).toBe("completed");
    expect(r.mission.receipt).not.toBeNull();
  });

  it("the read-only/consequential split is enforced by the kind set", () => {
    expect(READ_ONLY_KINDS.has("inspect")).toBe(true);
    expect(READ_ONLY_KINDS.has("typeDraftValue")).toBe(true); // filling ≠ submitting
    expect(isConsequential("submitApprovedForm")).toBe(true);
    expect(isConsequential("navigate")).toBe(false);
  });
});

describe("browser session isolation + budget", () => {
  it("another user cannot see or drive the mission's browser session", async () => {
    const { mission } = await startLaptopMission("user-a");
    await advanceMission("user-a", mission.id, 2);
    const sessions = await store.listBrowserSessions("user-a", mission.id);
    expect(sessions.length).toBe(1);
    expect(await store.getBrowserSession("user-b", sessions[0].id)).toBeNull();
    expect(await store.listBrowserSessions("user-b", mission.id)).toHaveLength(0);
  });

  it("a mission blocks cleanly when it exceeds its operating budget", async () => {
    const { mission } = await startLaptopMission("user-a");
    await store.updateMission("user-a", mission.id, { budget_cents: 10 }); // → 2 tool calls
    const r = await drive("user-a", mission.id);
    expect(r.mission.state).toBe("blocked");
    expect(r.mission.error).toMatch(/operating budget/i);
  });
});

describe("tick concurrency", () => {
  it("two overlapping ticks never advance the same mission at once", async () => {
    await startLaptopMission("user-a");
    // Fire two ticks "simultaneously" — the lease makes exactly one win per mission.
    const [a, b] = await Promise.all([tickMissions(5, "worker-1"), tickMissions(5, "worker-2")]);
    const total = a.advanced + b.advanced;
    const skipped = a.skipped + b.skipped;
    expect(total).toBe(1); // one mission advanced once
    expect(skipped).toBe(1); // the other worker was locked out
  });

  it("a stopped mission is never advanced by a tick", async () => {
    const { mission } = await startLaptopMission("user-a");
    await controlMission("user-a", mission.id, "stop");
    expect((await tickMissions(5)).advanced).toBe(0);
    expect((await store.getMission("user-a", mission.id))!.state).toBe("stopped");
  });

  it("a duplicate approval settle executes the browser submit only once", async () => {
    const { mission } = await startLaptopMission("user-a");
    let r = await drive("user-a", mission.id);
    const prep = r.steps.find((s) => s.tool === "browser.prepare_purchase")!;
    await approveAction("user-a", prep.action_id!);
    await advanceMission("user-a", mission.id);
    r = (await advanceMission("user-a", mission.id))!;
    const sessions = await store.listBrowserSessions("user-a", mission.id);
    const submits = (await store.listBrowserActions("user-a", sessions[0].id)).filter(
      (a) => a.kind === "submitApprovedForm"
    );
    expect(submits).toHaveLength(1);
    const events = await store.listEvents("user-a", prep.action_id!);
    expect(events.filter((e) => e.type === "executed")).toHaveLength(1);
  });
});

describe("account deletion sweeps browser data", () => {
  it("deleting the account removes sessions and actions", async () => {
    const { mission } = await startLaptopMission("user-a");
    await advanceMission("user-a", mission.id, 2);
    const sessions = await store.listBrowserSessions("user-a", mission.id);
    expect(sessions.length).toBe(1);
    await store.deleteAllUserData("user-a");
    expect(await store.getBrowserSession("user-a", sessions[0].id)).toBeNull();
  });
});
