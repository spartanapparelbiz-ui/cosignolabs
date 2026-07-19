import { beforeEach, describe, expect, it } from "vitest";
import { capabilityReport } from "../src/lib/capabilities";
import { buildContinuationCommand, delegationBrief } from "../src/lib/continue";
import { runCommand } from "../src/lib/agent/pipeline";
import { getStore } from "../src/lib/store";
import { MemoryStore } from "../src/lib/store/memory";
import type { ActionRecord, SessionRecord } from "../src/lib/types";

const USER = "test-user";
// The user requireUser() resolves to in the test env — route handlers operate
// as this identity, so delegations the routes read must be created under it.
const ROUTE_USER = "demo-user";

function freshStore(): MemoryStore {
  const store = new MemoryStore();
  (globalThis as unknown as { __cosignoStore?: unknown }).__cosignoStore = store;
  return store;
}

beforeEach(() => {
  freshStore();
});

const act = (status: ActionRecord["status"], summary: string): Pick<ActionRecord, "status" | "summary"> => ({
  status,
  summary,
});

/* -------------------------------------------------- continuation command */

describe("buildContinuationCommand (honest, no-redo instructions)", () => {
  const actions = [
    act("executed", "researched competitors"),
    act("executed", "drafted the announcement"),
    act("proposed", "send the launch email"),
    act("failed", "publish the announcement"),
  ];

  it("names the goal and lists completed work so it isn't redone", () => {
    const cmd = buildContinuationCommand("Launch the product", actions, "finish");
    expect(cmd).toContain("Launch the product");
    expect(cmd).toContain("Already completed");
    expect(cmd).toContain("researched competitors");
    expect(cmd.toLowerCase()).toContain("do not redo");
    expect(cmd.toLowerCase()).toContain("boundary");
  });

  it("rescue mode names failures and refuses to loop or fake", () => {
    const cmd = buildContinuationCommand("Launch the product", actions, "rescue");
    expect(cmd.toLowerCase()).toContain("rescue");
    expect(cmd).toContain("publish the announcement");
    expect(cmd.toLowerCase()).toContain("do not retry a failed irreversible action");
    expect(cmd.toLowerCase()).toContain("cannot continue safely");
  });

  it("'do everything' phrasing still stops at the boundary", () => {
    const cmd = buildContinuationCommand("Launch the product", actions, "everything");
    expect(cmd).toContain("Do everything you can");
    expect(cmd.toLowerCase()).toContain("stop at the boundary");
  });
});

/* ------------------------------------------------------------------ brief */

describe("delegationBrief (deterministic read of real state)", () => {
  const s = { title: "Prepare the investor update" } as SessionRecord;

  it("waiting-on-you explains the boundary", () => {
    const b = delegationBrief(s, [act("executed", "a"), act("proposed", "b")]);
    expect(b.momentum).toBe("needs_you");
    expect(b.waiting).toBe(1);
    expect(b.why.toLowerCase()).toContain("boundary");
    expect(b.can_move_forward).toBe(false);
  });

  it("blocked offers rescue", () => {
    const b = delegationBrief(s, [act("executed", "a"), act("failed", "b")]);
    expect(b.momentum).toBe("blocked");
    expect(b.why.toLowerCase()).toContain("failed");
    expect(b.next.toLowerCase()).toContain("rescue");
    expect(b.can_move_forward).toBe(true);
  });

  it("just-delegated is moving with nothing prepared", () => {
    const b = delegationBrief(s, []);
    expect(b.momentum).toBe("moving");
    expect(b.total).toBe(0);
    expect(b.can_move_forward).toBe(true);
  });

  it("carries the objective title when linked", () => {
    const b = delegationBrief(s, [act("executed", "a")], "Launch by August 1");
    expect(b.objective).toBe("Launch by August 1");
  });
});

/* ------------------------------------------------------------ capabilities */

describe("capabilityReport (never advertises what isn't connected)", () => {
  it("lists connected apps and is explicit about what needs authority", () => {
    const r = capabilityReport(["Gmail", "Shopify"], {});
    expect(r.connected).toEqual(["Gmail", "Shopify"]);
    expect(r.can_now.some((c) => c.includes("Gmail"))).toBe(true);
    expect(r.can_now.some((c) => c.includes("Shopify"))).toBe(true);
    // Sending external email needs a signature; it's disclosed, not hidden.
    expect(r.needs_you.some((n) => /external email.*signature/i.test(n))).toBe(true);
    expect(r.note).toBeNull();
  });

  it("is honest when nothing is connected — no fake integrations", () => {
    const r = capabilityReport([], {});
    expect(r.connected).toEqual([]);
    expect(r.note).toMatch(/no apps are connected/i);
    // It can still prepare/organize (read-only), which is always true.
    expect(r.can_now.length).toBeGreaterThan(0);
  });

  it("respects the user's own tier settings", () => {
    // If the user moved 'update_record' to auto (tier 1), it drops out of needs-you.
    const withAuto = capabilityReport([], { update_record: 1 });
    expect(withAuto.needs_you.some((n) => /update a record/i.test(n))).toBe(false);
    const withApprove = capabilityReport([], { update_record: 2 });
    expect(withApprove.needs_you.some((n) => /update a record.*approval/i.test(n))).toBe(true);
  });
});

/* -------------------------------------------- continue route (real pipeline) */

describe("continue route continues the SAME delegation via the real pipeline", () => {
  it("appends new actions to the same session and reports honestly", async () => {
    const store = getStore();
    // A real delegation, mid-flight — under the route's identity.
    const first = await runCommand(ROUTE_USER, "clear my inbox of newsletters");
    const sessionId = first.session.id;
    const before = (await store.listActions(ROUTE_USER, { session_id: sessionId })).length;

    const { POST } = await import("../src/app/api/delegations/[id]/continue/route");
    const { NextRequest } = await import("next/server");
    const res = await POST(
      new NextRequest(`http://localhost/api/delegations/${sessionId}/continue`, {
        method: "POST",
        body: JSON.stringify({ mode: "finish" }),
        headers: { "Content-Type": "application/json" },
      }),
      { params: Promise.resolve({ id: sessionId }) }
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    // Same delegation — not a sibling session.
    expect(body.result.session.id).toBe(sessionId);
    const after = (await store.listActions(ROUTE_USER, { session_id: sessionId })).length;
    expect(after).toBeGreaterThanOrEqual(before); // continued in place
    expect(typeof body.message).toBe("string");
  });

  it("brief route returns a grounded brief for the delegation", async () => {
    const first = await runCommand(ROUTE_USER, "send a follow-up email to john");
    const sessionId = first.session.id;
    const { GET } = await import("../src/app/api/delegations/[id]/brief/route");
    const { NextRequest } = await import("next/server");
    const res = await GET(
      new NextRequest(`http://localhost/api/delegations/${sessionId}/brief`),
      { params: Promise.resolve({ id: sessionId }) }
    );
    expect(res.status).toBe(200);
    const { brief } = await res.json();
    expect(brief.goal).toContain("follow-up");
    expect(brief.why.length).toBeGreaterThan(0);
    expect(brief.next.length).toBeGreaterThan(0);
  });
});
