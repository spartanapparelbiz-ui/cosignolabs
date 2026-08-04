import { describe, expect, it } from "vitest";
import { STATUS_META, statusLabel, statusOf, statusOfTask } from "@/lib/status";
import type { ActionStatus } from "@/lib/types";

/**
 * Five statuses. A sixth word invented on some other screen is a regression,
 * because it teaches the user a vocabulary instead of a state.
 */

describe("the five statuses", () => {
  it("has exactly five, with exactly one label each", () => {
    const labels = Object.values(STATUS_META).map((m) => m.label);
    expect(labels).toHaveLength(5);
    expect(new Set(labels).size).toBe(5);
    expect(labels.sort()).toEqual(["failed", "finished", "needs approval", "waiting", "working"]);
  });

  it("maps every action state onto one of them", () => {
    const cases: [ActionStatus, string][] = [
      ["proposed", "needs_approval"],
      ["approved", "working"],
      ["executing", "working"],
      ["executed", "finished"],
      ["failed", "failed"],
      ["vetoed", "finished"],
    ];
    for (const [status, expected] of cases) {
      expect(statusOf({ status })).toBe(expected);
    }
  });

  it("treats a rejected action as finished — the lifecycle, not the outcome", () => {
    // The timeline's ✓/✕ carries the outcome. Conflating the two here is what
    // produces a sixth status.
    expect(statusOf({ status: "vetoed" })).toBe("finished");
    expect(statusLabel("finished")).toBe("finished");
  });
});

describe("a task's status, from its steps", () => {
  const steps = (...statuses: ActionStatus[]) => statuses.map((status) => ({ status }));

  it("is worst-first: a failure outranks everything", () => {
    expect(statusOfTask(steps("executed", "failed", "proposed"))).toBe("failed");
  });

  it("says needs approval when a human is the blocker", () => {
    expect(statusOfTask(steps("executed", "proposed"))).toBe("needs_approval");
  });

  it("says working while anything is in flight", () => {
    expect(statusOfTask(steps("executed", "executing"))).toBe("working");
  });

  it("is only finished when every step is", () => {
    expect(statusOfTask(steps("executed", "executed", "vetoed"))).toBe("finished");
    expect(statusOfTask(steps("executed", "proposed"))).not.toBe("finished");
  });

  it("waits when there is nothing to report", () => {
    expect(statusOfTask([])).toBe("waiting");
  });
});
