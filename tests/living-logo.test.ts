import { describe, it, expect } from "vitest";
import { pickBreatherIndex } from "@/lib/useBreathing";
import { LOGO_BREATH } from "@/lib/motion";

/**
 * The living logo has exactly two invariants worth pinning down in code (the
 * rest — reduced-motion + first-paint gating — is asserted in the visual smoke,
 * which emulates prefers-reduced-motion):
 *   1. At most ONE mark breathes per viewport — the topmost visible one.
 *   2. The breath token is the single, subtle idle animation it claims to be.
 */
describe("living logo — single-breather coordinator", () => {
  it("gives the breath to the topmost visible mark, and only that one", () => {
    const marks = [
      { visible: true, top: 480 }, // footer, low
      { visible: true, top: 12 }, // nav, highest → winner
      { visible: true, top: 220 }, // hero
    ];
    expect(pickBreatherIndex(marks)).toBe(1);
  });

  it("ignores off-screen marks when choosing the winner", () => {
    const marks = [
      { visible: false, top: -300 }, // scrolled past, highest but not visible
      { visible: true, top: 90 }, // the only on-screen mark → winner
    ];
    expect(pickBreatherIndex(marks)).toBe(1);
  });

  it("lets nobody breathe when no mark is on screen", () => {
    const marks = [
      { visible: false, top: -300 },
      { visible: false, top: 2000 },
    ];
    expect(pickBreatherIndex(marks)).toBe(-1);
  });

  it("breaks ties toward the earlier entry (never two winners)", () => {
    const marks = [
      { visible: true, top: 100 },
      { visible: true, top: 100 },
    ];
    expect(pickBreatherIndex(marks)).toBe(0);
  });
});

describe("living logo — breath token", () => {
  it("is a slow, subtle scale + mark-opacity drift (the only idle variant)", () => {
    expect(LOGO_BREATH.durationMs).toBe(5000);
    expect(LOGO_BREATH.ease).toBe("ease-in-out");
    // Subtle by design — a hair over 1, never a bounce.
    expect(LOGO_BREATH.scale.rest).toBe(1);
    expect(LOGO_BREATH.scale.peak).toBeGreaterThan(1);
    expect(LOGO_BREATH.scale.peak).toBeLessThanOrEqual(1.02);
    expect(LOGO_BREATH.markOpacity.low).toBeGreaterThanOrEqual(0.9);
    expect(LOGO_BREATH.markOpacity.high).toBe(1);
  });
});
