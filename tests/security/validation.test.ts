import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { runCommand } from "../../src/lib/agent/pipeline";
import { MemoryStore } from "../../src/lib/store/memory";
import { resetRateLimitsForTests } from "../../src/lib/ratelimit";

/**
 * §4 — strict input validation, §8 tests 2/3/8: privileged fields rejected
 * and logged, cross-user access invisible, tier-3 without confirmation → 428.
 */

const currentUser = vi.hoisted(() => ({ id: "user-a" }));

vi.mock("@/lib/auth", () => ({
  clerkConfigured: () => true,
  DEMO_USER_ID: "demo-user",
  getUserId: vi.fn(async () => currentUser.id),
}));

let store: MemoryStore;

function jsonReq(url: string, method: string, body: unknown): NextRequest {
  return new NextRequest(url, {
    method,
    body: JSON.stringify(body),
    headers: { "Content-Type": "application/json" },
  });
}

beforeEach(() => {
  store = new MemoryStore();
  (globalThis as Record<string, unknown>).__cosignoStore = store;
  resetRateLimitsForTests();
  currentUser.id = "user-a";
});

async function makeProposal() {
  const { actions } = await runCommand("user-a", "reprice these products");
  return actions.find((a) => a.status === "proposed")!;
}

describe("client payload with status field (test 3)", () => {
  it("PATCH with status: executed → 400, action unchanged", async () => {
    const action = await makeProposal();
    const { PATCH } = await import("../../src/app/api/actions/[id]/route");
    const res = await PATCH(
      jsonReq(`http://localhost/api/actions/${action.id}`, "PATCH", {
        status: "executed",
      }),
      { params: Promise.resolve({ id: action.id }) }
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("privileged_field");

    const after = await store.getAction("user-a", action.id);
    expect(after!.status).toBe("proposed");
  });

  it("approve with tier/user_id smuggled in → 400", async () => {
    const action = await makeProposal();
    const { POST } = await import("../../src/app/api/actions/[id]/approve/route");
    const res = await POST(
      jsonReq(`http://localhost/api/actions/${action.id}/approve`, "POST", {
        tier: 1,
        user_id: "someone-else",
      }),
      { params: Promise.resolve({ id: action.id }) }
    );
    expect(res.status).toBe(400);
    const after = await store.getAction("user-a", action.id);
    expect(after!.status).toBe("proposed");
  });

  it("unknown fields on any strict schema → 400", async () => {
    const action = await makeProposal();
    const { POST } = await import("../../src/app/api/actions/[id]/veto/route");
    const res = await POST(
      jsonReq(`http://localhost/api/actions/${action.id}/veto`, "POST", {
        reason: "no",
        result: { fake: true },
      }),
      { params: Promise.resolve({ id: action.id }) }
    );
    expect(res.status).toBe(400);
  });

  it("non-UUID action id → 400", async () => {
    const { POST } = await import("../../src/app/api/actions/[id]/approve/route");
    const res = await POST(
      jsonReq("http://localhost/api/actions/../../etc/passwd/approve", "POST", {}),
      { params: Promise.resolve({ id: "../../etc/passwd" }) }
    );
    expect(res.status).toBe(400);
  });

  it("tier settings reject tier 3 and unknown categories", async () => {
    const { PUT } = await import("../../src/app/api/settings/tiers/route");
    for (const body of [
      { category: "payment", tier: 3 },
      { category: "payment", tier: 1 },
      { category: "made_up", tier: 1 },
      { category: "search", tier: 1, user_id: "x" },
    ]) {
      const res = await PUT(jsonReq("http://localhost/api/settings/tiers", "PUT", body));
      expect([400, 403]).toContain(res.status);
    }
  });
});

describe("cross-user isolation (test 2)", () => {
  it("user B requesting user A's action by id → 404", async () => {
    const action = await makeProposal();
    currentUser.id = "user-b";

    const { GET } = await import("../../src/app/api/actions/[id]/route");
    const res = await GET(
      new NextRequest(`http://localhost/api/actions/${action.id}`),
      { params: Promise.resolve({ id: action.id }) }
    );
    expect(res.status).toBe(404);

    const { POST } = await import("../../src/app/api/actions/[id]/approve/route");
    const approve = await POST(
      jsonReq(`http://localhost/api/actions/${action.id}/approve`, "POST", {}),
      { params: Promise.resolve({ id: action.id }) }
    );
    expect(approve.status).toBe(404);

    const after = await store.getAction("user-a", action.id);
    expect(after!.status).toBe("proposed");
  });
});

describe("tier 3 typed confirmation (test 8)", () => {
  it("approval without confirmation → 428; wrong text → 400", async () => {
    const { actions } = await runCommand("user-a", "delete these old records");
    const locked = actions.find((a) => a.tier === 3)!;
    const { POST } = await import("../../src/app/api/actions/[id]/approve/route");

    const missing = await POST(
      jsonReq(`http://localhost/api/actions/${locked.id}/approve`, "POST", {}),
      { params: Promise.resolve({ id: locked.id }) }
    );
    expect(missing.status).toBe(428);

    const wrong = await POST(
      jsonReq(`http://localhost/api/actions/${locked.id}/approve`, "POST", {
        confirmation: "yes please",
      }),
      { params: Promise.resolve({ id: locked.id }) }
    );
    expect(wrong.status).toBe(400);

    const after = await store.getAction("user-a", locked.id);
    expect(after!.status).toBe("proposed");
  });
});

describe("no state-changing GET routes (§6 CSRF)", () => {
  it("GET handlers never mutate: workspace state identical after GETs", async () => {
    const action = await makeProposal();
    const before = JSON.stringify(await store.listActions("user-a"));

    const list = await import("../../src/app/api/actions/route");
    await list.GET(new NextRequest("http://localhost/api/actions"));
    const activity = await import("../../src/app/api/activity/route");
    await activity.GET(new NextRequest("http://localhost/api/activity"));
    const one = await import("../../src/app/api/actions/[id]/route");
    await one.GET(new NextRequest(`http://localhost/api/actions/${action.id}`), {
      params: Promise.resolve({ id: action.id }),
    });

    expect(JSON.stringify(await store.listActions("user-a"))).toBe(before);
  });
});
