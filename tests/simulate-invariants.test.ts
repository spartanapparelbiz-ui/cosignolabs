import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { simulateAction } from "../src/lib/approvals/simulate";
import type { ActionRecord, PermissionRuleRecord } from "../src/lib/types";

/**
 * System invariants for the simulation engine.
 *
 * "Simulate first" is trustworthy for two structural reasons, and both are
 * pinned here rather than assumed: it RUNS the boundary's own functions (so
 * it cannot drift from what a real approval does), and it has NO PATH to a
 * side effect (so it is safe to offer beside the Approve button). The second
 * property is enforced at the import level — the module cannot reach the
 * store, the executor, or the network, so no future edit can quietly give a
 * dry run wet hands.
 */

function act(over: Partial<ActionRecord> = {}): ActionRecord {
  return {
    id: "a1",
    session_id: "s",
    user_id: "u",
    category: "send_email",
    tier: 2,
    status: "proposed",
    summary: "Send the investor update",
    payload: { to: "k@example.com", subject: "s", body: "b" },
    result: null,
    veto_reason: null,
    injection_flag: false,
    tier_note: null,
    created_at: "2026-08-10T09:00:00Z",
    resolved_at: null,
    ...over,
  };
}

function rule(over: Partial<PermissionRuleRecord> = {}): PermissionRuleRecord {
  return {
    id: "r1",
    user_id: "u",
    text: "sending email requires my signature",
    target: "any",
    verb: "send",
    requirement: "sign",
    condition: { kind: "none" },
    confidence: "high",
    enabled: true,
    created_at: "2026-08-01T00:00:00Z",
    updated_at: "2026-08-01T00:00:00Z",
    ...over,
  };
}

describe("simulation determinism", () => {
  it("the same action, rules and hold always simulate identically", () => {
    const a = act();
    const rules = [rule()];
    expect(simulateAction(a, rules, "none")).toEqual(simulateAction(a, rules, "none"));
  });

  it("always opens with the sentence that nothing happened", () => {
    for (const sim of [
      simulateAction(act(), [], "none"),
      simulateAction(act({ injection_flag: true }), [], "none"),
      simulateAction(act(), [], "all"),
    ]) {
      expect(sim.note).toMatch(/nothing was sent, no app was called/);
    }
  });
});

describe("precedence — the dangerous case always wins", () => {
  it("flagged content blocks, whatever the rules and hold say", () => {
    const sim = simulateAction(act({ injection_flag: true }), [], "none");
    expect(sim.blocked).toBe(true);
    expect(sim.requires).toBe("blocked");
    expect(sim.steps).toEqual([]);
    expect(sim.blockedReason).toMatch(/re-issue the command yourself/);
  });

  it("a hold parks even an otherwise-clean action at the boundary", () => {
    const sim = simulateAction(act(), [], "all");
    expect(sim.blocked).toBe(true);
    expect(sim.blockedReason).toMatch(/on hold/);
  });

  it("marks the exact step where the action stops being recoverable", () => {
    const sim = simulateAction(act(), [], "none");
    const irreversible = sim.steps.filter((s) => s.irreversible);
    expect(irreversible).toHaveLength(1);
    expect(irreversible[0].text).toMatch(/mail provider/);
  });
});

describe("no path to a side effect — enforced at the imports", () => {
  it("the simulate module cannot reach the store, the executor, or the network", () => {
    const src = readFileSync("src/lib/approvals/simulate.ts", "utf8");
    const imports = [...src.matchAll(/from "([^"]+)"/g)].map((m) => m[1]);
    for (const spec of imports) {
      expect(spec, `simulate.ts imports ${spec}`).not.toMatch(
        /store|executor|engine|httpClient|supabase|stripe/
      );
    }
    expect(src).not.toMatch(/\bfetch\s*\(/);
  });

  it("the brief module is under the same constraint", () => {
    const src = readFileSync("src/lib/approvals/brief.ts", "utf8");
    const imports = [...src.matchAll(/from "([^"]+)"/g)].map((m) => m[1]);
    for (const spec of imports) {
      expect(spec, `brief.ts imports ${spec}`).not.toMatch(
        /store|executor|engine|httpClient|supabase|stripe/
      );
    }
  });
});
