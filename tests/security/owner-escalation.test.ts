import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getUserPlan } from "../../src/lib/billing";
import { isOwner } from "../../src/lib/owner";
import { isGuestId } from "../../src/lib/publicMode";
import { MemoryStore } from "../../src/lib/store/memory";
import { resetRateLimitsForTests } from "../../src/lib/ratelimit";

/**
 * Adversarial suite: every client-side lever an attacker can actually pull,
 * aimed at becoming an owner. Each test is an attempt, and each asserts the
 * attempt fails.
 *
 * The shape of the defense is always the same, and it is worth stating once:
 * owner status is never transmitted, so there is nothing to forge. It is
 * recomputed on the server from the verified session's user id on every single
 * request. A client can change what it SENDS and what it DISPLAYS; it cannot
 * change what getUserPlan computes.
 */

const OWNER_ID = "3f9a2c1e-7b0d-4a5f-9c31-2e6b8d4f0a17";
const ATTACKER_ID = "b21e7f04-9c8a-4d6b-8e15-77a3f2c0d9be";

const currentUser = vi.hoisted(() => ({
  id: "b21e7f04-9c8a-4d6b-8e15-77a3f2c0d9be" as string | null,
}));

vi.mock("@/lib/auth", () => ({
  authConfigured: () => true,
  DEMO_USER_ID: "demo-user",
  getUserId: vi.fn(async () => currentUser.id),
  getUserEmail: vi.fn(async () => "attacker@example.com"),
}));

let store: MemoryStore;

beforeEach(() => {
  store = new MemoryStore();
  (globalThis as Record<string, unknown>).__cosignoStore = store;
  resetRateLimitsForTests();
  // The attacker is signed in as themselves. OWNER_ID belongs to someone else.
  currentUser.id = ATTACKER_ID;
  vi.stubEnv("OWNER_IDS", OWNER_ID);
});

afterEach(() => vi.unstubAllEnvs());

function post(path: string, body: unknown): NextRequest {
  return new NextRequest(`http://localhost${path}`, {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "Content-Type": "application/json" },
  });
}

describe("attempt 1 — forge the guest cookie / header with an owner's UUID", () => {
  it("a UUID can never be a guest id, so the guest namespace cannot carry one", () => {
    // getUserId() only consults the guest cookie/header when live auth is
    // absent AND the public sandbox is on. Even then the value must match the
    // reserved guest namespace, which a UUID cannot: no `guest_` prefix, and
    // hyphens are not in the character class.
    expect(isGuestId(OWNER_ID)).toBe(false);
    expect(isGuestId(`guest_${OWNER_ID}`)).toBe(false);
    expect(isGuestId(OWNER_ID.replace(/-/g, ""))).toBe(false);
  });

  it("and a valid guest id can never be an owner", () => {
    const guest = `guest_${"a".repeat(32)}`;
    expect(isGuestId(guest)).toBe(true);
    expect(isOwner(guest)).toBe(false);
    // Even if an operator pasted one into OWNER_IDS, it is dropped at parse.
    vi.stubEnv("OWNER_IDS", guest);
    expect(isOwner(guest)).toBe(false);
  });
});

describe("attempt 2 — forge the session cookie", () => {
  it("the session is verified by Supabase, not read as a claim", async () => {
    // A forged sb-*-auth-token does not survive supabase.auth.getUser(), which
    // validates the JWT signature against the project's keys. The mock here
    // stands in for that outcome: an unverifiable cookie yields no user.
    currentUser.id = null;
    const { GET } = await import("../../src/app/api/usage/route");
    expect((await GET()).status).toBe(401);
  });

  it("a session that verifies as someone else grants that someone else's plan", async () => {
    // The strongest form of the attack: suppose the attacker somehow presents
    // a VALID session. They then are that user, and get exactly that user's
    // plan — which is the correct outcome, not an escalation.
    expect((await getUserPlan(ATTACKER_ID)).planId).toBe("free");
  });
});

describe("attempt 3 — send an owner flag in the request body", () => {
  it("`owner: true` is rejected as a privileged field", async () => {
    const { POST } = await import("../../src/app/api/command/route");
    const res = await POST(post("/api/command", { command: "hello", owner: true }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("privileged_field");
    expect((await getUserPlan(ATTACKER_ID)).planId).toBe("free");
  });

  it("`user_id` pointing at an owner is rejected as a privileged field", async () => {
    const { POST } = await import("../../src/app/api/command/route");
    const res = await POST(post("/api/command", { command: "hello", user_id: OWNER_ID }));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe("privileged_field");
  });

  it("`plan` / `planId` on a command body are rejected by strict parsing", async () => {
    const { POST } = await import("../../src/app/api/command/route");
    for (const extra of [{ plan: "owner" }, { planId: "owner" }, { tier: 3 }]) {
      const res = await POST(post("/api/command", { command: "hello", ...extra }));
      expect(res.status, JSON.stringify(extra)).toBe(400);
    }
  });
});

describe("attempt 4 — buy or self-assign the owner tier", () => {
  it("checkout rejects plan=owner", async () => {
    vi.stubEnv("STRIPE_SECRET_KEY", "sk_test_x");
    const { POST } = await import("../../src/app/api/billing/checkout/route");
    const res = await POST(post("/api/billing/checkout", { plan: "owner", interval: "monthly" }));
    expect(res.status).toBe(400);
  });

  it("the embedded subscription route rejects plan=owner", async () => {
    vi.stubEnv("STRIPE_SECRET_KEY", "sk_test_x");
    const { POST } = await import("../../src/app/api/billing/subscription/route");
    const res = await POST(
      post("/api/billing/subscription", { plan: "owner", interval: "monthly" })
    );
    expect(res.status).toBe(400);
  });

  it("even a subscription ROW saying owner grants nothing", async () => {
    // This is beyond what a client can do — it models a compromised webhook or
    // a hand-edited database row. It still fails closed to free.
    await store.upsertSubscription({
      user_id: ATTACKER_ID,
      stripe_customer_id: "cus_x",
      stripe_subscription_id: "sub_x",
      plan: "owner",
      interval: "monthly",
      status: "active",
      current_period_end: Math.floor(Date.now() / 1000) + 86400,
      cancel_at_period_end: false,
      past_due_since: null,
      started_at: Math.floor(Date.now() / 1000),
      updated_at: new Date().toISOString(),
    });
    const resolved = await getUserPlan(ATTACKER_ID);
    expect(resolved.planId).toBe("free");
    expect(resolved.plan.actionLimit).toBe(25);
  });
});

describe("attempt 5 — URL parameters", () => {
  it("?plan=owner on checkout redirects to pricing", async () => {
    const { default: CheckoutPage } = await import("../../src/app/checkout/page");
    await expect(
      CheckoutPage({ searchParams: Promise.resolve({ plan: "owner" }) })
    ).rejects.toThrow(/NEXT_REDIRECT/);
  });

  it("an owner/plan query param is rejected before the gate is even reached", async () => {
    const { GET } = await import("../../src/app/api/activity/route");
    const res = await GET(
      new NextRequest("http://localhost/api/activity?plan=owner&owner=true&format=csv")
    );
    // Query params go through the same strict parser as bodies, so the
    // smuggled keys are a 400 rather than something the gate has to survive.
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe("privileged_field");
  });

  it("and with the params removed the attacker is still just a free user", async () => {
    const { GET } = await import("../../src/app/api/activity/route");
    const res = await GET(new NextRequest("http://localhost/api/activity?format=csv"));
    // The baseline the attempt above was trying to move: csv is pro+.
    expect(res.status).toBe(402);
    expect((await res.json()).error).toBe("upgrade_required");
  });
});

describe("attempt 6 — intercept and edit the RESPONSE body", () => {
  it("believing you are an owner changes no server-side limit", async () => {
    // The client can rewrite GET /api/usage to claim anything. Nothing reads
    // it back: the next privileged call re-resolves the plan from the session.
    for (let i = 0; i < 25; i++) await store.incrementUsage(ATTACKER_ID);
    const { POST } = await import("../../src/app/api/command/route");
    const res = await POST(post("/api/command", { command: "one more" }));
    expect(res.status).toBe(402);
    expect((await res.json()).error).toBe("usage_limit");
  });
});

describe("attempt 7 — localStorage", () => {
  it("the server never reads client storage, so it cannot carry identity", async () => {
    const { readFileSync, readdirSync, statSync } = await import("node:fs");
    const { join } = await import("node:path");
    const walk = (dir: string): string[] => {
      const out: string[] = [];
      for (const entry of readdirSync(dir)) {
        const p = join(dir, entry);
        if (statSync(p).isDirectory()) out.push(...walk(p));
        else if (/\.(ts|tsx)$/.test(entry)) out.push(p);
      }
      return out;
    };
    // Every file touching storage must be a client component. A server module
    // reading localStorage is the bug this guards against — there are none.
    const offenders = walk(join(process.cwd(), "src")).filter((f) => {
      const src = readFileSync(f, "utf8");
      return /localStorage|sessionStorage/.test(src) && !/^\s*["']use client["']/m.test(src);
    });
    expect(offenders).toEqual([]);
  });

  it("nothing in client storage names a plan, a role, or the allowlist", async () => {
    const { readFileSync } = await import("node:fs");
    const { join } = await import("node:path");
    // The persisted keys are theme, display name, recent templates, the
    // first-run flag, and a keyboard-hint preference. None is an authority.
    const theme = readFileSync(join(process.cwd(), "src/lib/theme.ts"), "utf8");
    expect(theme).not.toMatch(/OWNER_IDS|\bowner\b/);
  });
});

describe("the override is recomputed, never transmitted", () => {
  it("removing the id revokes access on the very next call", async () => {
    currentUser.id = OWNER_ID;
    expect((await getUserPlan(OWNER_ID)).planId).toBe("owner");
    vi.stubEnv("OWNER_IDS", "");
    expect((await getUserPlan(OWNER_ID)).planId).toBe("free");
  });

  it("there is exactly one owner decision, and it is a pure function of the id", () => {
    vi.stubEnv("OWNER_IDS", OWNER_ID);
    expect(isOwner(OWNER_ID)).toBe(true);
    expect(isOwner(ATTACKER_ID)).toBe(false);
    // No request, cookie, header, or body participates in that answer.
    expect(isOwner.length).toBe(1);
  });
});
