import { beforeEach, describe, expect, it, vi } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { MemoryStore } from "../src/lib/store/memory";
import { buildActivity } from "../src/lib/activity/model";
import type { MissionRunState } from "../src/lib/types";

/**
 * One activity model, one renderer, every page a filter.
 *
 * Approvals, AI work, connection changes and rule changes used to live in
 * separate timelines with separate wording, which meant the same moment could
 * appear twice, described two ways, on two screens. Nothing is written twice
 * here — every event is DERIVED from a stored record, so there is no second
 * history to fall out of sync with the first.
 */

vi.mock("@/lib/auth", () => ({
  authConfigured: () => true,
  DEMO_USER_ID: "demo-user",
  getUserId: vi.fn(async () => "user-a"),
}));

const USER = "user-a";
let store: MemoryStore;

beforeEach(() => {
  store = new MemoryStore();
  (globalThis as Record<string, unknown>).__cosignoStore = store;
});

async function seed() {
  const session = await store.createSession(USER, "t");

  const action = await store.createAction({
    user_id: USER,
    session_id: session.id,
    category: "connection_call",
    tier: 2,
    summary: "open issue “cosigno test” in owner/repo",
    payload: { args: { repo: "owner/repo" } },
  } as never);
  await store.logEvent(USER, action.id, "proposed", "agent", {});
  await store.transitionAction(USER, action.id, "approved");
  await store.logEvent(USER, action.id, "approved", "user", {});
  await store.transitionAction(USER, action.id, "executing");
  await store.transitionAction(USER, action.id, "executed", {
    result: { summary: "opened issue #7 in owner/repo" },
  });
  await store.logEvent(USER, action.id, "executed", "system", {});

  const mission = await store.createMission({
    user_id: USER,
    session_id: session.id,
    goal: "fix the checkout bug",
  } as never);
  await store.updateMission(USER, mission.id, {
    state: "completed" as MissionRunState,
    receipt: { completed_steps: [{ summary: "opened issue #7" }] },
  });

  await store.createConnection({
    user_id: USER,
    kind: "app",
    provider_key: "github",
    display_name: "GitHub",
    status: "needs_reauth",
    auth_type: "oauth2",
    metadata: {},
  } as never);

  await store.logAudit(USER, "emergency_stop", { scope: "all" });
  await store.logAudit(USER, "rule_created", { text: "never delete production data" });
  // A type with no human sentence — must never reach a timeline raw.
  await store.logAudit(USER, "objective_deleted", {});

  return { action, mission };
}

describe("everything writes to one stream", () => {
  it("carries work, decisions, connections, policy and safety together", async () => {
    await seed();
    const kinds = new Set((await buildActivity(USER)).map((e) => e.kind));
    expect(kinds.has("work")).toBe(true);
    expect(kinds.has("decision")).toBe(true);
    expect(kinds.has("connection")).toBe(true);
    expect(kinds.has("policy")).toBe(true);
    expect(kinds.has("safety")).toBe(true);
  });

  it("every event answers what, where, who and can-I-open-it", async () => {
    await seed();
    for (const e of await buildActivity(USER)) {
      expect(e.headline.trim().length).toBeGreaterThan(0);
      expect(["cosigno", "you"]).toContain(e.actor);
      expect(typeof e.at).toBe("string");
      // Somewhere to go, or a receipt to open. Never a dead row.
      expect(Boolean(e.href || e.actionId)).toBe(true);
    }
  });
});

describe("events read like sentences, never event names", () => {
  it("never surfaces a machine type", async () => {
    await seed();
    const text = (await buildActivity(USER)).map((e) => e.headline).join(" | ");
    for (const raw of [
      "mission.updated",
      "policy.changed",
      "connector.connected",
      "integration_connected",
      "emergency_stop",
      "rule_created",
      "objective_deleted",
      "action_events",
    ]) {
      expect(text).not.toContain(raw);
    }
  });

  it("drops an audit type it has no sentence for, rather than showing it raw", async () => {
    await seed();
    const text = (await buildActivity(USER)).map((e) => e.headline).join(" ");
    expect(text.toLowerCase()).not.toContain("objective");
  });

  it("says what a rule change actually was", async () => {
    await seed();
    const rule = (await buildActivity(USER)).find((e) => e.kind === "policy");
    expect(rule?.headline).toContain("never delete production data");
  });
});

describe("credit goes to whoever actually decided", () => {
  it("attributes a human approval to you", async () => {
    await seed();
    const approved = (await buildActivity(USER)).find((e) => e.headline.startsWith("You approved"));
    expect(approved?.actor).toBe("you");
  });

  it("does not credit a person with an auto-approval they never made", async () => {
    const session = await store.createSession(USER, "t");
    const a = await store.createAction({
      user_id: USER,
      session_id: session.id,
      category: "search",
      tier: 1,
      summary: "read your repositories",
      payload: {},
    } as never);
    await store.logEvent(USER, a.id, "approved", "system", { auto: true });

    const auto = (await buildActivity(USER)).find((e) => e.headline.includes("Cleared automatically"));
    expect(auto?.actor).toBe("cosigno");
  });

  it("attributes an emergency stop to you", async () => {
    await seed();
    const stop = (await buildActivity(USER)).find((e) => e.kind === "safety");
    expect(stop?.actor).toBe("you");
    expect(stop?.headline).toMatch(/you stopped all AI activity/i);
  });
});

describe("ordering", () => {
  it("pins anything still waiting above the stream, however old", async () => {
    const session = await store.createSession(USER, "t");
    const pending = await store.createAction({
      user_id: USER,
      session_id: session.id,
      category: "send_email",
      tier: 2,
      summary: "send the welcome email",
      payload: {},
    } as never);
    await store.logEvent(USER, pending.id, "proposed", "agent", {});
    // Backdate it so chronology alone would bury it.
    const events = (store as unknown as { events: Array<{ action_id: string; created_at: string }> }).events;
    for (const e of events) if (e.action_id === pending.id) e.created_at = new Date(Date.now() - 864e5).toISOString();
    await seed();

    const stream = await buildActivity(USER);
    expect(stream[0].pinned).toBe(true);
  });

  it("is newest first once the pinned rows are past", async () => {
    await seed();
    const rest = (await buildActivity(USER)).filter((e) => !e.pinned);
    for (let i = 1; i < rest.length; i++) {
      expect(Date.parse(rest[i - 1].at)).toBeGreaterThanOrEqual(Date.parse(rest[i].at));
    }
  });

  it("pins a broken connection — everything downstream is silently not happening", async () => {
    await seed();
    const conn = (await buildActivity(USER)).find((e) => e.kind === "connection");
    expect(conn?.pinned).toBe(true);
    expect(conn?.headline).toMatch(/needs reconnecting/i);
  });
});

describe("every page is a filter over the same list", () => {
  it("narrows by kind", async () => {
    await seed();
    const work = await buildActivity(USER, { kinds: ["work"] });
    expect(work.length).toBeGreaterThan(0);
    expect(work.every((e) => e.kind === "work")).toBe(true);
  });

  it("narrows by mission", async () => {
    const { mission } = await seed();
    const forMission = await buildActivity(USER, { missionId: mission.id });
    expect(forMission.every((e) => e.missionId === mission.id)).toBe(true);
  });

  it("narrows by app", async () => {
    await seed();
    const gh = await buildActivity(USER, { providerKey: "github" });
    expect(gh.length).toBeGreaterThan(0);
    expect(gh.every((e) => e.providerKey === "github")).toBe(true);
  });
});

describe("there is only one timeline renderer left", () => {
  it("the duplicate activity table is gone", async () => {
    // It existed only because the activity page needed a different shape of
    // the same events.
    expect(existsSync("src/components/ActivityLog.tsx")).toBe(false);
  });

  it("the activity page renders the shared stream", () => {
    const page = readFileSync("src/app/app/activity/page.tsx", "utf8");
    expect(page).toContain("ActivityStream");
  });

  it("the shared stream renders through the shared card", () => {
    const stream = readFileSync("src/components/app/ActivityStream.tsx", "utf8");
    expect(stream).toContain("EventStream");
  });

  it("signed receipts stayed reachable after the old table was deleted", () => {
    // Approvals only lists PENDING cards, so an executed action's receipt was
    // reachable through that table and nowhere else.
    const stream = readFileSync("src/components/app/ActivityStream.tsx", "utf8");
    expect(stream).toContain("ReceiptModal");
  });
});
