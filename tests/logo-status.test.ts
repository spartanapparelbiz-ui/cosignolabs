import { describe, it, expect } from "vitest";
import { statusLabel, type LogoStatusState } from "@/components/LogoStatus";

/**
 * The living logo replaced the orb as the workspace status light. The label
 * is the accessible contract (aria-live) — pin every state's wording, and
 * that the awaiting count is always spelled out.
 */
describe("LogoStatus labels", () => {
  it("maps every state to calm, plain wording", () => {
    const expected: Record<LogoStatusState, string> = {
      idle: "idle",
      listening: "listening",
      working: "working",
      awaiting: "3 awaiting your approval",
      executing: "executing",
      success: "done",
      error: "hit a snag — try again",
    };
    for (const [state, label] of Object.entries(expected)) {
      expect(statusLabel(state as LogoStatusState, 3)).toBe(label);
    }
  });

  it("awaiting always carries the live count", () => {
    expect(statusLabel("awaiting", 1)).toBe("1 awaiting your approval");
    expect(statusLabel("awaiting", 12)).toBe("12 awaiting your approval");
  });
});
