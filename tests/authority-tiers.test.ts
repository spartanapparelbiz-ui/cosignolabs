import { beforeEach, describe, expect, it } from "vitest";
import { approveAction, autoExecute, EngineError } from "../src/lib/actions/engine";
import { runCommand } from "../src/lib/agent/pipeline";
import { getStore } from "../src/lib/store";
import { MemoryStore } from "../src/lib/store/memory";
import { resolveTier } from "../src/lib/tiers";
import type { ActionCategory } from "../src/lib/types";

const USER = "test-user";

function freshStore(): MemoryStore {
  const store = new MemoryStore();
  (globalThis as unknown as { __cosignoStore?: unknown }).__cosignoStore = store;
  return store;
}
beforeEach(() => {
  freshStore();
});

/* --------------------------------------------------- resolveTier (server rule) */

describe("resolveTier maps categories to the correct authority tier", () => {
  it("read-only categories are tier 1", () => {
    expect(resolveTier("search", [])).toBe(1);
    expect(resolveTier("summarize", [])).toBe(1);
    expect(resolveTier("draft", [])).toBe(1);
  });
  it("consequential categories are tier 2", () => {
    expect(resolveTier("send_email", [])).toBe(2);
    expect(resolveTier("update_record", [])).toBe(2);
    expect(resolveTier("post_content", [])).toBe(2);
  });
  it("destructive/financial categories are pinned tier 3", () => {
    expect(resolveTier("delete", [])).toBe(3);
    expect(resolveTier("refund", [])).toBe(3);
    expect(resolveTier("payment", [])).toBe(3);
  });
  it("an unknown category fails safe to tier 2 (approval required)", () => {
    expect(resolveTier("totally_unknown" as ActionCategory, [])).toBe(2);
  });
});

/* ---------------------------------------- Tier 1 — runs automatically, no ask */

describe("Tier 1 does NOT request approval", () => {
  it("a tier-1 read auto-executes and never waits at 'proposed'", async () => {
    const { actions } = await runCommand(USER, "clear my inbox of newsletters");
    const tier1 = actions.find((a) => a.tier === 1);
    expect(tier1).toBeDefined();
    // It ran on its own — it is not sitting waiting for the user.
    expect(tier1!.status).toBe("executed");

    // Its approval was a SYSTEM auto-approval, never a solicited human one.
    const events = await getStore().listEvents(USER, tier1!.id);
    const approved = events.find((e) => e.type === "approved");
    expect(approved).toBeDefined();
    expect(approved!.actor).toBe("system");
    expect((approved!.detail as { auto?: boolean }).auto).toBe(true);
  });
});

/* ------------------------------ Tier 2 — cannot execute without an approval */

describe("Tier 2 cannot execute without approval", () => {
  it("a consequential action cannot be auto-executed", async () => {
    const { actions } = await runCommand(USER, "clear my inbox of newsletters");
    const tier2 = actions.find((a) => a.tier === 2)!;
    expect(tier2.status).toBe("proposed"); // waiting for the user
    await expect(autoExecute(USER, tier2)).rejects.toBeInstanceOf(EngineError);
    await expect(autoExecute(USER, tier2)).rejects.toMatchObject({ code: "forbidden" });
  });

  it("only after an explicit approval does it execute (with a logged approval)", async () => {
    const { actions } = await runCommand(USER, "clear my inbox of newsletters");
    const tier2 = actions.find((a) => a.tier === 2)!;
    const executed = await approveAction(USER, tier2.id);
    expect(executed.status).toBe("executed");
    const events = await getStore().listEvents(USER, tier2.id);
    expect(events.some((e) => e.type === "approved")).toBe(true);
  });
});

/* --------------------------- Tier 3 — needs the additional typed confirmation */

describe("Tier 3 requires an additional typed confirmation", () => {
  it("rejects without confirmation, on mismatch, and executes on exact match", async () => {
    const { actions } = await runCommand(USER, "delete all spam permanently");
    const locked = actions.find((a) => a.tier === 3);
    expect(locked).toBeDefined();
    expect(locked!.category).toBe("delete");

    await expect(approveAction(USER, locked!.id)).rejects.toMatchObject({
      code: "confirmation_required",
    });
    await expect(approveAction(USER, locked!.id, { confirmation: "wrong" })).rejects.toMatchObject({
      code: "confirmation_mismatch",
    });
    const executed = await approveAction(USER, locked!.id, { confirmation: "delete" });
    expect(executed.status).toBe("executed");
  });
});
