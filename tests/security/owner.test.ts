import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getUserPlan } from "../../src/lib/billing";
import { effectiveActionLimit } from "../../src/lib/enforcement";
import { isOwner, OWNER_PLAN, ownerIds, publicFace } from "../../src/lib/owner";
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

describe("the override is server-side only", () => {
  function walkTsx(dir: string): string[] {
    const out: string[] = [];
    for (const entry of readdirSync(dir)) {
      const p = join(dir, entry);
      if (statSync(p).isDirectory()) out.push(...walkTsx(p));
      else if (/\.(ts|tsx)$/.test(entry)) out.push(p);
    }
    return out;
  }

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

describe("owner status never appears in an API response", () => {
  /**
   * getUserPlan is the ONLY way owner status can be observed, so the routes
   * that import it are the complete set that could leak it. The list is
   * derived from the filesystem and asserted below: a new route that starts
   * reading plans fails this test until it is checked and added.
   */
  const PLAN_AWARE_ROUTES = [
    "src/app/api/activity/route.ts",
    "src/app/api/billing/retention/route.ts",
    "src/app/api/billing/subscription/route.ts",
    "src/app/api/integrations/route.ts",
    "src/app/api/offers/route.ts",
    "src/app/api/usage/route.ts",
  ];

  function routesImporting(symbol: string): string[] {
    const found: string[] = [];
    const walk = (dir: string) => {
      for (const entry of readdirSync(dir)) {
        const p = join(dir, entry);
        if (statSync(p).isDirectory()) walk(p);
        else if (entry === "route.ts" && readFileSync(p, "utf8").includes(symbol)) {
          found.push(p.slice(p.indexOf("src/app/api")));
        }
      }
    };
    walk(join(process.cwd(), "src", "app", "api"));
    return found.sort();
  }

  it("the set of plan-aware routes is exactly what this test covers", () => {
    expect(routesImporting("getUserPlan")).toEqual(PLAN_AWARE_ROUTES);
  });

  it("no plan-aware GET response mentions the owner tier", async () => {
    vi.stubEnv("OWNER_IDS", OWNER_ID);
    const { NextRequest } = await import("next/server");

    const bodies: Array<[string, string]> = [
      ["/api/usage", await (await (await import("../../src/app/api/usage/route")).GET()).text()],
      ["/api/offers", await (await (await import("../../src/app/api/offers/route")).GET()).text()],
      [
        "/api/integrations",
        await (await (await import("../../src/app/api/integrations/route")).GET()).text(),
      ],
      [
        "/api/activity",
        await (
          await (await import("../../src/app/api/activity/route")).GET(
            new NextRequest("http://localhost/api/activity")
          )
        ).text(),
      ],
    ];

    for (const [route, body] of bodies) {
      expect(body.toLowerCase(), `${route} leaked the owner tier`).not.toContain("owner");
    }
  });
});

describe("every customer surface presents the highest PUBLIC tier", () => {
  it("checkout refuses the owner tier as a purchase", async () => {
    vi.stubEnv("OWNER_IDS", OWNER_ID);
    vi.stubEnv("STRIPE_SECRET_KEY", "sk_test_x");
    const { NextRequest } = await import("next/server");
    const { POST } = await import("../../src/app/api/billing/checkout/route");
    const res = await POST(
      new NextRequest("http://localhost/api/billing/checkout", {
        method: "POST",
        body: JSON.stringify({ plan: "owner", interval: "monthly" }),
        headers: { "Content-Type": "application/json" },
      })
    );
    expect(res.status).not.toBe(200);
    expect((await res.text()).toLowerCase()).not.toContain("owner");
  });

  it("the embedded subscription route refuses it too", async () => {
    vi.stubEnv("OWNER_IDS", OWNER_ID);
    vi.stubEnv("STRIPE_SECRET_KEY", "sk_test_x");
    const { NextRequest } = await import("next/server");
    const { POST } = await import("../../src/app/api/billing/subscription/route");
    const res = await POST(
      new NextRequest("http://localhost/api/billing/subscription", {
        method: "POST",
        body: JSON.stringify({ plan: "owner", interval: "monthly" }),
        headers: { "Content-Type": "application/json" },
      })
    );
    expect(res.status).not.toBe(200);
    expect((await res.text()).toLowerCase()).not.toContain("owner");
  });

  it("the checkout page sends ?plan=owner back to pricing", async () => {
    const { default: CheckoutPage } = await import("../../src/app/checkout/page");
    // Next signals a redirect by throwing; any other outcome would mean the
    // hidden tier reached a rendered checkout.
    await expect(
      CheckoutPage({ searchParams: Promise.resolve({ plan: "owner" }) })
    ).rejects.toThrow(/NEXT_REDIRECT/);
  });

  it("pricing and the landing tier board can only iterate public tiers", async () => {
    const { PLAN_ORDER, PLANS } = await import("../../src/lib/plans");
    expect(PLAN_ORDER).toEqual(["free", "pro", "max"]);
    // The hidden tier exists in PLANS but has no renderable copy, so even a
    // future surface that reached for it would render nothing to sell.
    expect("owner" in PLANS).toBe(false);
    // The tier exists, but only in the server-only module.
    expect(OWNER_PLAN.features).toEqual([]);
    expect(OWNER_PLAN.price.monthly).toBe(0);
  });
});

describe("no temporary development utilities remain", () => {
  function apiRouteFiles(dir: string): string[] {
    const out: string[] = [];
    for (const entry of readdirSync(dir)) {
      const p = join(dir, entry);
      if (statSync(p).isDirectory()) out.push(...apiRouteFiles(p));
      else if (entry === "route.ts") out.push(p);
    }
    return out;
  }

  it("no route exists whose purpose is exposing identity", () => {
    const identityRoutes = apiRouteFiles(join(process.cwd(), "src", "app", "api")).filter((f) =>
      /\/(whoami|me|identity|debug)\/route\.ts$/.test(f)
    );
    expect(identityRoutes).toEqual([]);
  });

  it("no API route is marked temporary", () => {
    // A route that has to announce its own impermanence should not be
    // merged. This turns "remember to delete it" into a failing test.
    const temporary = apiRouteFiles(join(process.cwd(), "src", "app", "api")).filter((f) =>
      /\b(TEMPORARY|DELETE THIS ROUTE|REMOVE BEFORE)\b/.test(readFileSync(f, "utf8"))
    );
    expect(temporary).toEqual([]);
  });
});
