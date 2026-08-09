import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getUserPlan } from "../../src/lib/billing";
import { effectiveActionLimit } from "../../src/lib/enforcement";
import { isOwner, ownerIds } from "../../src/lib/owner";
import { publicFace } from "../../src/lib/plans";
import { MemoryStore } from "../../src/lib/store/memory";
import { resetRateLimitsForTests } from "../../src/lib/ratelimit";
import type { SubscriptionRecord } from "../../src/lib/types";

/**
 * The owner override: granted ONLY by OWNER_IDS, matched ONLY against the
 * immutable Supabase Auth user id, resolved ONLY on the server, and never
 * shown to a client.
 *
 * Identities here are real Supabase-shaped user ids (UUIDs) — the value
 * getUserId() returns — because that is the only thing the override is
 * allowed to compare.
 */

const OWNER_ID = "3f9a2c1e-7b0d-4a5f-9c31-2e6b8d4f0a17";
const SECOND_OWNER_ID = "8c4d1a90-2f63-4e18-b7aa-51d0c93e6b24";
const CUSTOMER_ID = "b21e7f04-9c8a-4d6b-8e15-77a3f2c0d9be";
/** The address on the owner's account — must never be what grants the override. */
const OWNER_EMAIL = "owner@cosignolabs.com";

// vi.hoisted runs before the consts above exist, so the default is written
// out literally here; beforeEach resets it to OWNER_ID either way.
const currentUser = vi.hoisted(() => ({
  id: "3f9a2c1e-7b0d-4a5f-9c31-2e6b8d4f0a17" as string | null,
}));

vi.mock("@/lib/auth", () => ({
  authConfigured: () => true,
  DEMO_USER_ID: "demo-user",
  getUserId: vi.fn(async () => currentUser.id),
  getUserEmail: vi.fn(async () => "owner@cosignolabs.com"),
}));

let store: MemoryStore;

function sub(partial: Partial<SubscriptionRecord>): SubscriptionRecord {
  return {
    user_id: OWNER_ID,
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
  currentUser.id = OWNER_ID;
});

afterEach(() => vi.unstubAllEnvs());

describe("OWNER_IDS parsing — user ids only, never emails", () => {
  it("unset means nobody is an owner (fail closed)", () => {
    expect(ownerIds().size).toBe(0);
    expect(isOwner(OWNER_ID)).toBe(false);
  });

  it("empty or whitespace-only is the same as unset", () => {
    vi.stubEnv("OWNER_IDS", "   ");
    expect(ownerIds().size).toBe(0);
    expect(isOwner(OWNER_ID)).toBe(false);
  });

  it("reads a comma-separated list and tolerates padding", () => {
    vi.stubEnv("OWNER_IDS", ` ${OWNER_ID} , ${SECOND_OWNER_ID} ,`);
    expect(ownerIds()).toEqual(new Set([OWNER_ID, SECOND_OWNER_ID]));
    expect(isOwner(OWNER_ID)).toBe(true);
    expect(isOwner(SECOND_OWNER_ID)).toBe(true);
  });

  it("matches case-insensitively — a UUID is the same id in any case", () => {
    vi.stubEnv("OWNER_IDS", OWNER_ID.toUpperCase());
    expect(isOwner(OWNER_ID)).toBe(true);
    expect(isOwner(OWNER_ID.toUpperCase())).toBe(true);
  });

  it("DROPS an email address instead of comparing it", () => {
    vi.stubEnv("OWNER_IDS", OWNER_EMAIL);
    expect(ownerIds().size).toBe(0);
    // The signed-in user's address is exactly this string, and it still
    // grants nothing: an email can never enter the set.
    expect(isOwner(OWNER_EMAIL)).toBe(false);
  });

  it("drops an email but keeps a valid id in the same list", () => {
    vi.stubEnv("OWNER_IDS", `${OWNER_EMAIL},${OWNER_ID}`);
    expect(ownerIds()).toEqual(new Set([OWNER_ID]));
    expect(isOwner(OWNER_EMAIL)).toBe(false);
    expect(isOwner(OWNER_ID)).toBe(true);
  });

  it("drops a Clerk-shaped id left over from the previous auth provider", () => {
    vi.stubEnv("OWNER_IDS", "user_2abcDEF456ghiJKL789mno");
    expect(ownerIds().size).toBe(0);
    expect(isOwner("user_2abcDEF456ghiJKL789mno")).toBe(false);
  });

  it("drops this app's reserved non-UUID identities", () => {
    vi.stubEnv("OWNER_IDS", `demo-user,guest_${"a".repeat(32)}`);
    expect(ownerIds().size).toBe(0);
    expect(isOwner("demo-user")).toBe(false);
    expect(isOwner(`guest_${"a".repeat(32)}`)).toBe(false);
  });

  it("never returns true for a null/empty caller", () => {
    vi.stubEnv("OWNER_IDS", OWNER_ID);
    expect(isOwner(null)).toBe(false);
    expect(isOwner(undefined)).toBe(false);
    expect(isOwner("")).toBe(false);
  });
});

describe("the override resolves through getUserPlan, server-side", () => {
  it("an owner gets the owner plan with no subscription row at all", async () => {
    vi.stubEnv("OWNER_IDS", OWNER_ID);
    const p = await getUserPlan(OWNER_ID);
    expect(p.planId).toBe("owner");
    expect(p.status).toBe("active");
    expect(p.plan.actionLimit).toBe(Infinity);
    expect(p.plan.integrationLimit).toBe(Infinity);
    expect(p.plan.customMcp).toBe(true);
    expect(p.plan.canExportCsv).toBe(true);
  });

  it("every enforcement point inherits it — the action limit is unbounded", async () => {
    vi.stubEnv("OWNER_IDS", OWNER_ID);
    expect(await effectiveActionLimit(OWNER_ID)).toBe(Infinity);
    expect(await effectiveActionLimit(CUSTOMER_ID)).toBe(25);
  });

  it("a non-owner is completely unaffected", async () => {
    vi.stubEnv("OWNER_IDS", OWNER_ID);
    expect((await getUserPlan(CUSTOMER_ID)).planId).toBe("free");
    await store.upsertSubscription(sub({ user_id: CUSTOMER_ID, plan: "pro" }));
    expect((await getUserPlan(CUSTOMER_ID)).planId).toBe("pro");
  });

  it("the override wins over a stored row, and outlives its expiry", async () => {
    vi.stubEnv("OWNER_IDS", OWNER_ID);
    await store.upsertSubscription(sub({ plan: "pro", status: "canceled", current_period_end: 1 }));
    expect((await getUserPlan(OWNER_ID)).planId).toBe("owner");
  });

  it("removing an id from OWNER_IDS removes the access immediately", async () => {
    vi.stubEnv("OWNER_IDS", OWNER_ID);
    expect((await getUserPlan(OWNER_ID)).planId).toBe("owner");
    vi.stubEnv("OWNER_IDS", "");
    expect((await getUserPlan(OWNER_ID)).planId).toBe("free");
  });

  it("a stored subscription row claiming plan 'owner' does NOT escalate", async () => {
    // OWNER_IDS is the only grant. A row is not a grant, even a well-formed
    // active one — it fails closed to free like any unknown plan value.
    await store.upsertSubscription(sub({ user_id: CUSTOMER_ID, plan: "owner", status: "active" }));
    expect((await getUserPlan(CUSTOMER_ID)).planId).toBe("free");
    expect((await getUserPlan(CUSTOMER_ID)).plan.actionLimit).toBe(25);
  });
});

describe("the owner tier is hidden from the UI", () => {
  it("is absent from the tiers the pricing surfaces iterate", async () => {
    const { PLAN_ORDER, PAID_PLANS } = await import("../../src/lib/plans");
    expect(PLAN_ORDER).toEqual(["free", "pro", "max"]);
    expect(PAID_PLANS).toEqual(["pro", "max"]);
  });

  it("presents as the top public tier, and public tiers are untouched", () => {
    expect(publicFace("owner")).toBe("max");
    expect(publicFace("free")).toBe("free");
    expect(publicFace("pro")).toBe("pro");
    expect(publicFace("max")).toBe("max");
  });

  it("GET /api/usage shows an owner exactly what a max subscriber sees", async () => {
    vi.stubEnv("OWNER_IDS", OWNER_ID);
    const { GET } = await import("../../src/app/api/usage/route");
    const res = await GET();
    expect(res.status).toBe(200);
    const body = await res.json();

    expect(body.plan.id).toBe("max");
    expect(body.plan.name).toBe("command");
    expect(JSON.stringify(body)).not.toContain("owner");

    // Infinity would serialize to null and crash the account page on
    // `usage.limit.toLocaleString()`; the public face keeps it finite.
    expect(body.usage.limit).toBe(10000);
    expect(Number.isFinite(body.usage.limit)).toBe(true);
  });

  it("a real max subscriber's payload is byte-identical to an owner's", async () => {
    const { GET } = await import("../../src/app/api/usage/route");

    vi.stubEnv("OWNER_IDS", OWNER_ID);
    const ownerBody = await (await GET()).json();

    vi.stubEnv("OWNER_IDS", "");
    await store.upsertSubscription(sub({ plan: "max", status: "active" }));
    const maxBody = await (await GET()).json();

    expect(ownerBody.plan.id).toBe(maxBody.plan.id);
    expect(ownerBody.plan.name).toBe(maxBody.plan.name);
    expect(ownerBody.plan.upgradeTo).toBe(maxBody.plan.upgradeTo);
    expect(ownerBody.usage.limit).toBe(maxBody.usage.limit);
  });
});

function walkTsx(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const p = join(dir, entry);
    if (statSync(p).isDirectory()) out.push(...walkTsx(p));
    else if (/\.(ts|tsx)$/.test(entry)) out.push(p);
  }
  return out;
}

describe("the override is server-side only", () => {
  it("no client component imports the owner module", () => {
    const offenders = walkTsx(join(process.cwd(), "src")).filter((file) => {
      const src = readFileSync(file, "utf8");
      return /^\s*["']use client["']/m.test(src) && /from\s+["'][^"']*\/owner["']/.test(src);
    });
    expect(offenders, `client components must not import lib/owner: ${offenders}`).toEqual([]);
  });

  it("OWNER_IDS is never read under a NEXT_PUBLIC_ name (it would ship to the browser)", () => {
    const offenders = walkTsx(join(process.cwd(), "src")).filter((file) =>
      /NEXT_PUBLIC_OWNER/.test(readFileSync(file, "utf8"))
    );
    expect(offenders).toEqual([]);
  });
});

/**
 * THE OTHER THREE CEILINGS.
 *
 * getUserPlan() covers everything that reads a plan. These three are enforced
 * outside the plan, so "unlimited" is only true if each one is bypassed too —
 * and each must be bypassed from the SAME user-id check, never a second
 * notion of who an owner is.
 */
describe("owner bypass — per-user rate windows (enforceLimit)", () => {
  it("an owner is never rate limited, however far past the window", async () => {
    vi.stubEnv("OWNER_IDS", OWNER_ID);
    const { enforceLimit } = await import("../../src/lib/ratelimit");
    // commandMinute allows 10; 40 consecutive calls must all pass.
    for (let i = 0; i < 40; i++) {
      await expect(enforceLimit("commandMinute", OWNER_ID)).resolves.toBeUndefined();
    }
  });

  it("a customer is still limited while an owner is not", async () => {
    vi.stubEnv("OWNER_IDS", OWNER_ID);
    const { enforceLimit, RateLimitError } = await import("../../src/lib/ratelimit");
    let threw: unknown = null;
    try {
      for (let i = 0; i < 40; i++) await enforceLimit("commandMinute", CUSTOMER_ID);
    } catch (err) {
      threw = err;
    }
    expect(threw).toBeInstanceOf(RateLimitError);
  });

  it("with OWNER_IDS unset the owner id is limited like anyone else", async () => {
    const { enforceLimit, RateLimitError } = await import("../../src/lib/ratelimit");
    let threw: unknown = null;
    try {
      for (let i = 0; i < 40; i++) await enforceLimit("commandMinute", OWNER_ID);
    } catch (err) {
      threw = err;
    }
    expect(threw).toBeInstanceOf(RateLimitError);
  });

  /**
   * The load-bearing one. Two windows are keyed by client IP and two by
   * `authz:<org>` — none of them is a user id. Because ownerIds() only ever
   * admits UUID-shaped entries, those keys cannot be owners even if someone
   * puts an IP in OWNER_IDS. The anonymous sandbox stays limited.
   */
  it("a non-user-id key can never bypass, even if it is listed in OWNER_IDS", async () => {
    const ip = "203.0.113.7";
    vi.stubEnv("OWNER_IDS", `${OWNER_ID},${ip},authz:acme`);
    const { enforceLimit, RateLimitError } = await import("../../src/lib/ratelimit");
    let threw: unknown = null;
    try {
      for (let i = 0; i < 40; i++) await enforceLimit("previewMinute", ip);
    } catch (err) {
      threw = err;
    }
    expect(threw).toBeInstanceOf(RateLimitError);
  });
});

describe("owner bypass — the shared daily planner cap", () => {
  it("an owner clears the global cap", async () => {
    vi.stubEnv("OWNER_IDS", OWNER_ID);
    vi.stubEnv("DAILY_PLAN_CAP", "3");
    const { enforceGlobalPlanningBudget } = await import("../../src/lib/ratelimit");
    for (let i = 0; i < 10; i++) {
      await expect(enforceGlobalPlanningBudget(OWNER_ID)).resolves.toBeUndefined();
    }
  });

  /**
   * Not just "the owner isn't blocked" — the owner must not CONSUME the cap.
   * Ten owner calls run first; a customer must still get all 3.
   */
  it("owner traffic does not consume the cap on customers' behalf", async () => {
    vi.stubEnv("OWNER_IDS", OWNER_ID);
    vi.stubEnv("DAILY_PLAN_CAP", "3");
    const { enforceGlobalPlanningBudget, RateLimitError } = await import(
      "../../src/lib/ratelimit"
    );
    for (let i = 0; i < 10; i++) await enforceGlobalPlanningBudget(OWNER_ID);

    await expect(enforceGlobalPlanningBudget(CUSTOMER_ID)).resolves.toBeUndefined();
    await expect(enforceGlobalPlanningBudget(CUSTOMER_ID)).resolves.toBeUndefined();
    await expect(enforceGlobalPlanningBudget(CUSTOMER_ID)).resolves.toBeUndefined();
    await expect(enforceGlobalPlanningBudget(CUSTOMER_ID)).rejects.toBeInstanceOf(
      RateLimitError
    );
  });

  it("a caller with no user id still gets the ceiling", async () => {
    vi.stubEnv("OWNER_IDS", OWNER_ID);
    vi.stubEnv("DAILY_PLAN_CAP", "2");
    const { enforceGlobalPlanningBudget, RateLimitError } = await import(
      "../../src/lib/ratelimit"
    );
    await enforceGlobalPlanningBudget();
    await enforceGlobalPlanningBudget();
    await expect(enforceGlobalPlanningBudget()).rejects.toBeInstanceOf(RateLimitError);
  });
});

describe("owner bypass — the mission action budget", () => {
  function mission(): import("../../src/lib/types").MissionRecord {
    return {
      id: "m1",
      user_id: OWNER_ID,
      session_id: "s1",
      goal: "ship it",
      state: "running",
      plan_version: 1,
      pending_question: null,
      receipt: null,
      error: null,
      lease_owner: null,
      lease_expires_at: null,
      tool_calls: 0,
      browser_actions: 0,
      budget_cents: 0,
      action_budget: 1,
    } as import("../../src/lib/types").MissionRecord;
  }

  it("an owner's mission is unlimited however tight the mission's own budget", async () => {
    vi.stubEnv("OWNER_IDS", OWNER_ID);
    const { missionBudget } = await import("../../src/lib/missions/missionBudget");
    const state = await missionBudget(OWNER_ID, mission());
    expect(state.unlimited).toBe(true);
    expect(state.exhausted).toBe(false);
    expect(state.remaining).toBe(Infinity);
  });

  it("a customer's mission keeps the limit it was given", async () => {
    vi.stubEnv("OWNER_IDS", OWNER_ID);
    const { missionBudget } = await import("../../src/lib/missions/missionBudget");
    const m = mission();
    m.user_id = CUSTOMER_ID;
    const state = await missionBudget(CUSTOMER_ID, m);
    expect(state.unlimited).toBe(false);
    expect(state.limit).toBe(1);
  });
});

describe("exactly one owner-check implementation", () => {
  /**
   * The property that keeps this from rotting: every override site must ask
   * lib/owner.ts. A second way to decide who an owner is — an env read, an
   * email compare, a hard-coded id — is how the bypasses drift apart.
   */
  it("no module decides ownership for itself", () => {
    const offenders: string[] = [];
    for (const file of walkTsx(join(process.cwd(), "src"))) {
      if (file.endsWith(join("lib", "owner.ts"))) continue;
      const src = readFileSync(file, "utf8");
      // Reading OWNER_IDS anywhere but owner.ts is a second implementation.
      if (/process\.env\.OWNER_IDS/.test(src)) offenders.push(file);
      // So is any resurrection of the email-keyed mechanism.
      if (/OWNER_EMAILS|isOwnerEmail|ownerEmails/.test(src)) offenders.push(file);
    }
    expect(offenders).toEqual([]);
  });

  it("owner status is never serialized into a client response", () => {
    const offenders: string[] = [];
    for (const file of walkTsx(join(process.cwd(), "src", "app", "api"))) {
      const src = readFileSync(file, "utf8");
      if (/isOwner\s*\(/.test(src)) offenders.push(file);
    }
    expect(offenders).toEqual([]);
  });
});
