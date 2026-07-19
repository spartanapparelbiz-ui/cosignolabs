import { beforeEach, describe, expect, it } from "vitest";
import { approveAction, autoExecute, EngineError } from "../src/lib/actions/engine";
import { runCommand } from "../src/lib/agent/pipeline";
import { holdBlocks } from "../src/lib/hold";
import {
  delegationMomentum,
  objectiveProgress,
  targetLine,
  type ObjectiveDelegation,
} from "../src/lib/objectives";
import { getStore } from "../src/lib/store";
import { MemoryStore } from "../src/lib/store/memory";
import type { SessionRecord } from "../src/lib/types";

const USER = "test-user";

function freshStore(): MemoryStore {
  const store = new MemoryStore();
  (globalThis as unknown as { __cosignoStore?: unknown }).__cosignoStore = store;
  return store;
}

beforeEach(() => {
  freshStore();
});

function session(id: string, title = "d"): SessionRecord {
  return { id, user_id: USER, title, created_at: new Date().toISOString() };
}

/* --------------------------------------------------------------- objectives */

describe("objective progress (derived from real delegation state)", () => {
  function deleg(momentum: ObjectiveDelegation["momentum"], id: string = momentum): ObjectiveDelegation {
    return { session: session(id), momentum };
  }

  it("rolls up momentum: your attention wins, then blockers, then motion", () => {
    expect(objectiveProgress([deleg("moving"), deleg("needs_you"), deleg("blocked")]).momentum).toBe("needs_you");
    expect(objectiveProgress([deleg("moving"), deleg("blocked")]).momentum).toBe("blocked");
    expect(objectiveProgress([deleg("complete", "a"), deleg("complete", "b")]).momentum).toBe("complete");
    expect(objectiveProgress([deleg("moving")]).momentum).toBe("moving");
  });

  it("computes an honest completion fraction and counts", () => {
    const p = objectiveProgress([deleg("complete", "a"), deleg("complete", "b"), deleg("moving")]);
    expect(p.total).toBe(3);
    expect(p.complete).toBe(2);
    expect(p.fraction).toBeCloseTo(2 / 3);
    expect(p.next).toMatch(/moving the remaining/i);
  });

  it("an empty objective invites linking, never a fake percentage", () => {
    const p = objectiveProgress([]);
    expect(p.total).toBe(0);
    expect(p.fraction).toBe(0);
    expect(p.next).toMatch(/link delegations/i);
  });

  it("delegationMomentum reads from actual action statuses", () => {
    expect(delegationMomentum([{ status: "proposed" }])).toBe("needs_you");
    expect(delegationMomentum([{ status: "failed" }])).toBe("blocked");
    expect(delegationMomentum([{ status: "executed" }])).toBe("complete");
    expect(delegationMomentum([])).toBe("moving");
  });

  it("targetLine speaks plainly about the date", () => {
    const now = new Date("2026-07-18T12:00:00Z");
    expect(targetLine({ target_date: "2026-07-18" }, now)).toBe("target is today");
    expect(targetLine({ target_date: "2026-07-19" }, now)).toBe("target is tomorrow");
    expect(targetLine({ target_date: "2026-07-25" }, now)).toBe("7 days to target");
    expect(targetLine({ target_date: "2026-07-11" }, now)).toBe("7 days past target");
    expect(targetLine({ target_date: null }, now)).toBeNull();
  });

  it("store links delegations and lists them; delete removes links, keeps sessions", async () => {
    const store = getStore();
    const s1 = await store.createSession(USER, "prepare website");
    const s2 = await store.createSession(USER, "connect payments");
    const obj = await store.createObjective(USER, "Launch by August 1", "2026-08-01");
    await store.linkObjectiveDelegation(USER, obj.id, s1.id);
    await store.linkObjectiveDelegation(USER, obj.id, s2.id);
    await store.linkObjectiveDelegation(USER, obj.id, s1.id); // idempotent
    expect(await store.listObjectiveLinks(USER, obj.id)).toHaveLength(2);

    await store.deleteObjective(USER, obj.id);
    expect(await store.listObjectiveLinks(USER)).toHaveLength(0);
    // The delegations themselves survive.
    expect(await store.getSession(USER, s1.id)).not.toBeNull();
  });
});

/* --------------------------------------------------------------- cosigno hold */

describe("cosigno hold (the authority brake, enforced in the engine)", () => {
  it("holdBlocks maps scopes correctly", () => {
    expect(holdBlocks("none", { tier: 2 })).toBe(false);
    expect(holdBlocks("external", { tier: 1 })).toBe(false);
    expect(holdBlocks("external", { tier: 2 })).toBe(true);
    expect(holdBlocks("external", { tier: 3 })).toBe(true);
    expect(holdBlocks("all", { tier: 1 })).toBe(true);
  });

  it("an external hold blocks approving a tier-2 action; the card stays proposed", async () => {
    const store = getStore();
    const { actions } = await runCommand(USER, "clear my inbox of newsletters");
    const tier2 = actions.find((a) => a.status === "proposed" && a.tier === 2)!;
    await store.setHold(USER, "external");

    await expect(approveAction(USER, tier2.id, {})).rejects.toBeInstanceOf(EngineError);
    const after = await store.getAction(USER, tier2.id);
    expect(after!.status).toBe("proposed"); // nothing crossed the boundary
    const events = await store.listEvents(USER, tier2.id);
    expect(events.some((e) => e.type === "blocked" && (e.detail as { reason?: string }).reason === "on_hold")).toBe(true);
  });

  it("resume lets the exact same action through, unchanged", async () => {
    const store = getStore();
    const { actions } = await runCommand(USER, "clear my inbox of newsletters");
    const tier2 = actions.find((a) => a.status === "proposed" && a.tier === 2)!;
    await store.setHold(USER, "external");
    await approveAction(USER, tier2.id, {}).catch(() => null);
    await store.setHold(USER, "none"); // resume
    const done = await approveAction(USER, tier2.id, {});
    expect(done.status).toBe("executed");
  });

  it("an 'all' hold even pauses tier-1 auto-execution; the card stays proposed", async () => {
    const store = getStore();
    const { actions } = await runCommand(USER, "clear my inbox of newsletters");
    const tier1 = actions.find((a) => a.tier === 1);
    if (!tier1) return; // plan shape may vary
    // Reset it to proposed is not possible; instead prove autoExecute honors hold directly.
    await store.setHold(USER, "all");
    const fresh = await store.createAction({
      session_id: tier1.session_id,
      user_id: USER,
      category: "search",
      tier: 1,
      summary: "look something up",
      payload: {},
      injection_flag: false,
      tier_note: null,
    });
    const result = await autoExecute(USER, fresh);
    expect(result.status).toBe("proposed");
  });

  it("hold never changes base permissions — it's execution-only", async () => {
    const store = getStore();
    await store.setHold(USER, "all");
    // Base tier settings are untouched; resolveTier is unaffected by hold.
    const settings = await store.getTierSettings(USER);
    expect(settings).toEqual([]); // no tier rows were written by holding
    await store.setHold(USER, "none");
    expect(await store.getTierSettings(USER)).toEqual([]);
  });
});
