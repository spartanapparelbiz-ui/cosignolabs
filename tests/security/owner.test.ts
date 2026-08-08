import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getUserPlan } from "../../src/lib/billing";
import { assertIntegrationCapacity, effectiveActionLimit } from "../../src/lib/enforcement";
import { OWNER_PLAN, PLANS } from "../../src/lib/plans";
import { isOwnerEmail, ownerEmails, resetOwnerCacheForTests } from "../../src/lib/owner";
import {
  enforceGlobalPlanningBudget,
  enforceLimit,
  resetRateLimitsForTests,
} from "../../src/lib/ratelimit";
import { MemoryStore } from "../../src/lib/store/memory";
import type { SubscriptionRecord } from "../../src/lib/types";

/**
 * The owner override — the internal, unlimited plan granted by OWNER_EMAILS.
 *
 * What these tests hold in place, in order of how much it would cost to get
 * wrong: the override is SERVER-SIDE (nothing a client sends reaches it), it
 * is INVISIBLE (no response, no plan id, no UI string ever says "owner", and
 * no owner address leaves the server), it is OFF by default, and it actually
 * lifts every limit for the two accounts it names.
 */

const OWNERS = ["nickbat601@gmail.com", "spartanapparelbiz@gmail.com"];

/** The signed-in identity the mocked auth layer reports for this test. */
const session = vi.hoisted(() => ({ id: "u_internal", email: "" as string | null }));

vi.mock("@/lib/auth", () => ({
  authConfigured: () => true,
  DEMO_USER_ID: "demo-user",
  getUserId: vi.fn(async () => session.id),
  getUserEmail: vi.fn(async () => session.email),
}));

let store: MemoryStore;

/** Sign in as this address, and clear the userId → email cache behind it. */
function signInAs(email: string | null, id = "u_internal") {
  session.id = id;
  session.email = email;
  resetOwnerCacheForTests();
}

function sub(partial: Partial<SubscriptionRecord>): SubscriptionRecord {
  return {
    user_id: "u_internal",
    stripe_customer_id: "cus_1",
    stripe_subscription_id: "sub_1",
    plan: "pro",
    interval: "monthly",
    status: "active",
    current_period_end: Math.floor(Date.now() / 1000) + 86400 * 20,
    cancel_at_period_end: false,
    past_due_since: null,
    started_at: Math.floor(Date.now() / 1000),
    updated_at: new Date().toISOString(),
    ...partial,
  };
}

beforeEach(() => {
  store = new MemoryStore();
  (globalThis as Record<string, unknown>).__cosignoStore = store;
  resetRateLimitsForTests();
  resetOwnerCacheForTests();
  vi.stubEnv("OWNER_EMAILS", OWNERS.join(","));
  signInAs(OWNERS[0]);
});

afterEach(() => {
  vi.unstubAllEnvs();
  resetOwnerCacheForTests();
});

describe("the list itself — parsed server-side, never exposed", () => {
  it("reads process.env.OWNER_EMAILS as a comma-separated list", () => {
    expect(ownerEmails()).toEqual(OWNERS);
  });

  it("tolerates spacing and casing on both sides of the comparison", () => {
    vi.stubEnv("OWNER_EMAILS", " NickBat601@Gmail.com ,  SpartanApparelBiz@GMAIL.com ");
    expect(isOwnerEmail("nickbat601@gmail.com")).toBe(true);
    expect(isOwnerEmail("  SPARTANAPPARELBIZ@gmail.com  ")).toBe(true);
  });

  it("is off entirely when the variable is unset — no owners, normal plans", async () => {
    vi.stubEnv("OWNER_EMAILS", "");
    resetOwnerCacheForTests();
    expect(ownerEmails()).toEqual([]);
    expect(isOwnerEmail(OWNERS[0])).toBe(false);
    const p = await getUserPlan("u_internal");
    expect(p.planId).toBe("free");
    expect(p.isOwner).toBe(false);
    expect(p.plan.actionLimit).toBe(PLANS.free.actionLimit);
  });

  it("an IP-keyed limit never becomes an auth lookup", async () => {
    // enforceLimit() asks the owner question about whatever it keys by, and
    // the sandbox + beta windows key by IP. An IP is not a user id, so it must
    // be answered locally rather than sent to the auth admin API.
    const admin = await import("../../src/lib/supabaseAuth/admin");
    const spy = vi.spyOn(admin, "authUserEmail");
    await enforceLimit("previewMinute", "203.0.113.20");
    await enforceLimit("betaHour", "198.51.100.7");
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });

  it("a near-miss address is not an owner", () => {
    expect(isOwnerEmail("nickbat601@gmail.com.attacker.example")).toBe(false);
    expect(isOwnerEmail("nickbat6010@gmail.com")).toBe(false);
    expect(isOwnerEmail("")).toBe(false);
    expect(isOwnerEmail(null)).toBe(false);
  });
});

describe("both verified accounts get the unlimited internal plan", () => {
  for (const email of OWNERS) {
    it(`${email} — unlimited actions, connections, MCP, export, model`, async () => {
      signInAs(email);
      const p = await getUserPlan("u_internal");

      expect(p.isOwner).toBe(true);
      expect(p.plan).toBe(OWNER_PLAN);
      expect(p.plan.actionLimit).toBe(Infinity);
      expect(p.plan.integrationLimit).toBe(Infinity);
      expect(p.plan.customMcp).toBe(true);
      expect(p.plan.canExportCsv).toBe(true);
      expect(p.plan.strongerModel).toBe(true);
      // The catch-all for paid features that don't exist yet.
      expect(p.plan.unlimited).toBe(true);
      // No upgrade path — there is nothing above it to sell them.
      expect(p.plan.upgradeTo).toBeNull();
      expect(await effectiveActionLimit("u_internal")).toBe(Infinity);
    });
  }

  it("a normal user alongside them is untouched", async () => {
    signInAs("someone-else@example.com", "normal-user");
    const p = await getUserPlan("normal-user");
    expect(p.isOwner).toBe(false);
    expect(p.planId).toBe("free");
    expect(p.plan.actionLimit).toBe(PLANS.free.actionLimit);
    expect(p.plan.customMcp).toBe(false);
    expect(p.plan.canExportCsv).toBe(false);
  });

  it("paying customers still resolve to the plan they bought", async () => {
    signInAs("customer@example.com", "paying-user");
    await store.upsertSubscription(sub({ user_id: "paying-user", plan: "pro" }));
    const p = await getUserPlan("paying-user");
    expect(p.isOwner).toBe(false);
    expect(p.planId).toBe("pro");
    expect(p.plan.actionLimit).toBe(PLANS.pro.actionLimit);
  });
});

describe("billing and subscription state are bypassed, not consulted", () => {
  it("no subscription row at all → still unlimited (fail-closed does not apply)", async () => {
    expect(await store.getSubscription("u_internal")).toBeNull();
    const p = await getUserPlan("u_internal");
    expect(p.status).toBe("active");
    expect(p.pastDue).toBe(false);
    expect(p.plan.actionLimit).toBe(Infinity);
  });

  it("a canceled, past-due, expired row cannot demote an owner", async () => {
    await store.upsertSubscription(
      sub({
        status: "past_due",
        past_due_since: Math.floor(Date.now() / 1000) - 86400 * 90,
        current_period_end: Math.floor(Date.now() / 1000) - 86400 * 60,
        cancel_at_period_end: true,
      })
    );
    const p = await getUserPlan("u_internal");
    expect(p.plan.actionLimit).toBe(Infinity);
    expect(p.pastDue).toBe(false);
    expect(p.inGrace).toBe(false);
    expect(p.cancelAtPeriodEnd).toBe(false);
  });

  it("the store is never even read for an owner", async () => {
    const spy = vi.spyOn(store, "getSubscription");
    await getUserPlan("u_internal");
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });
});

describe("every limit an account can hit is lifted", () => {
  it("the usage meter never blocks — well past the top published plan", async () => {
    const usage = await store.getUsage("u_internal");
    for (let i = 0; i < PLANS.max.actionLimit + 5; i++) {
      await store.incrementUsage("u_internal", usage.cycle_start);
    }
    const after = await store.getUsage("u_internal");
    expect(after.actions_executed).toBeGreaterThan(PLANS.max.actionLimit);

    const { plan } = await getUserPlan("u_internal");
    // This is the exact comparison every enforcement point makes.
    expect(after.actions_executed >= plan.actionLimit).toBe(false);
  });

  it("connections and custom MCP servers are uncapped", async () => {
    for (let i = 0; i < 25; i++) {
      await store.createConnection({
        user_id: "u_internal",
        provider_key: `mcp_${i}`,
        kind: "mcp",
        display_name: `server ${i}`,
        auth_type: "mcp_remote",
        encrypted_credentials: null,
      });
    }
    await expect(
      assertIntegrationCapacity("u_internal", { customMcp: true })
    ).resolves.toBeUndefined();
  });

  it("a free user in the same process is still capped — the bypass is per-account", async () => {
    signInAs("someone-else@example.com", "normal-user");
    await store.createConnection({
      user_id: "normal-user",
      provider_key: "github",
      kind: "app",
      display_name: "GitHub",
      auth_type: "oauth2",
      encrypted_credentials: null,
    });
    await expect(assertIntegrationCapacity("normal-user")).rejects.toMatchObject({ status: 402 });
  });

  it("per-user rate windows do not apply", async () => {
    // 10/min is the command window; 100/day the daily one. Blow past both.
    for (let i = 0; i < 150; i++) {
      await enforceLimit("commandMinute", "u_internal");
      await enforceLimit("commandDay", "u_internal");
    }
    // ...while the same windows still hold for everyone else.
    signInAs("someone-else@example.com", "normal-user");
    await expect(
      (async () => {
        for (let i = 0; i < 15; i++) await enforceLimit("commandMinute", "normal-user");
      })()
    ).rejects.toThrow();
  });

  it("the global daily planner ceiling is neither hit nor consumed", async () => {
    vi.stubEnv("DAILY_PLAN_CAP", "3");
    for (let i = 0; i < 20; i++) {
      await expect(enforceGlobalPlanningBudget("u_internal")).resolves.toBeUndefined();
    }
    // The counter never moved, so a normal user still gets their full cap.
    signInAs("someone-else@example.com", "normal-user");
    for (let i = 0; i < 3; i++) {
      await expect(enforceGlobalPlanningBudget("normal-user")).resolves.toBeUndefined();
    }
    await expect(enforceGlobalPlanningBudget("normal-user")).rejects.toThrow(/capacity/i);
  });

  it("missions run with no action budget", async () => {
    const { missionBudget } = await import("../../src/lib/missions/missionBudget");
    const session = await store.createSession("u_internal", "m");
    const created = await store.createMission({
      user_id: "u_internal",
      session_id: session.id,
      goal: "ship it",
    });
    // The tightest budget the product allows — an owner ignores it.
    const mission = await store.updateMission("u_internal", created.id, {
      action_budget: 1,
    });
    expect(mission).not.toBeNull();
    const state = await missionBudget("u_internal", mission!);
    expect(state.unlimited).toBe(true);
    expect(state.limit).toBe(Infinity);
    expect(state.exhausted).toBe(false);
  });
});

describe("invisible — nothing reaches the client", () => {
  it("the resolved plan presents as the ordinary top tier, never as 'owner'", async () => {
    const p = await getUserPlan("u_internal");
    expect(p.planId).toBe("max");
    expect(p.plan.id).toBe("max");
    expect(p.plan.name).toBe(PLANS.max.name);
    expect(JSON.stringify(p.plan)).not.toMatch(/owner/i);
  });

  it("the Owner plan is absent from every list the UI iterates", async () => {
    const { PLAN_ORDER, PAID_PLANS, PLANS: ALL } = await import("../../src/lib/plans");
    expect(Object.values(ALL)).not.toContain(OWNER_PLAN);
    expect(PLAN_ORDER).toEqual(["free", "pro", "max"]);
    expect(PAID_PLANS).toEqual(["pro", "max"]);
  });

  it("GET /api/usage leaks neither the flag, the word, nor any address", async () => {
    const { GET } = await import("../../src/app/api/usage/route");
    const res = await GET();
    const body = await res.json();
    const raw = JSON.stringify(body);

    expect(res.status).toBe(200);
    for (const email of OWNERS) expect(raw).not.toContain(email);
    expect(raw).not.toMatch(/owner/i);
    expect(raw).not.toMatch(/OWNER_EMAILS/);
    expect("isOwner" in body.plan).toBe(false);
    expect(body.plan.id).toBe("max");
    expect(body.plan.name).toBe(PLANS.max.name);
    // A finite number the meter can render — Infinity would serialize to null
    // and crash the usage ring.
    expect(Number.isFinite(body.usage.limit)).toBe(true);
    expect(body.plan.upgradeTo).toBeNull();
  });

  it("the connections response reports 'no limit' the same way a paid plan does", async () => {
    const { GET } = await import("../../src/app/api/integrations/route");
    const res = await GET();
    const body = await res.json();
    // Exactly what a pro/max customer's response carries — unlimited is null.
    expect(body.limit).toBeNull();
    expect(JSON.stringify(body)).not.toMatch(/owner/i);
  });

  it("CSV export is allowed without an upgrade prompt ever being generated", async () => {
    const { GET } = await import("../../src/app/api/activity/route");
    const req = new NextRequest("http://localhost/api/activity?format=csv");
    const res = await GET(req);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toMatch(/csv/);
  });
});

describe("identity comes from the verified session, never from the client", () => {
  it("a request cannot claim to be an owner — the id must match the session", async () => {
    // Signed in as an owner, but asking about somebody else's id.
    signInAs(OWNERS[0], "u_internal");
    const other = await getUserPlan("some-other-user-id");
    expect(other.isOwner).toBe(false);
    expect(other.planId).toBe("free");
  });

  it("an owner address on an unauthenticated session grants nothing", async () => {
    signInAs(null, "anon");
    const p = await getUserPlan("anon");
    expect(p.isOwner).toBe(false);
    expect(p.planId).toBe("free");
  });
});
