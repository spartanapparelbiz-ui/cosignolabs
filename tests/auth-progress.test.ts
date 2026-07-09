import { describe, it, expect } from "vitest";
import {
  emailProgress,
  passwordProgress,
  isValidEmail,
  isReadyToSubmit,
} from "@/components/auth/authProgress";

/**
 * The fill-as-you-type math is the animation's contract: field text → a 0..1
 * "presence" the mark reads. It must be monotonic-enough to feel like charging,
 * bounded to [0,1] (the mark's stroke-dashoffset depends on it), and total —
 * it can never throw mid-keystroke.
 */

describe("emailProgress — charges as the address takes shape", () => {
  it("is 0 when empty (incl. whitespace only)", () => {
    expect(emailProgress("")).toBe(0);
    expect(emailProgress("   ")).toBe(0);
  });

  it("rises through the milestones and reaches 1 only when valid", () => {
    const chars = emailProgress("ada");
    const at = emailProgress("ada@");
    const domain = emailProgress("ada@corp");
    const dotted = emailProgress("ada@corp.");
    const full = emailProgress("ada@corp.com");

    expect(chars).toBeGreaterThan(0);
    expect(at).toBeGreaterThan(chars);
    expect(domain).toBeGreaterThan(at);
    expect(dotted).toBeGreaterThan(domain);
    expect(full).toBe(1);
    expect(full).toBeGreaterThan(dotted);
  });

  it("stays within [0,1] for anything thrown at it", () => {
    for (const s of ["", "@", "@@@@", "a@b@c", "  x  ", "a".repeat(500)]) {
      const p = emailProgress(s);
      expect(p).toBeGreaterThanOrEqual(0);
      expect(p).toBeLessThanOrEqual(1);
    }
  });
});

describe("passwordProgress — eases in by length toward 8", () => {
  it("is 0 empty, partial mid-way, and caps at 1", () => {
    expect(passwordProgress("")).toBe(0);
    expect(passwordProgress("abcd")).toBeCloseTo(0.5, 5);
    expect(passwordProgress("abcdefgh")).toBe(1);
    expect(passwordProgress("abcdefghijklmnop")).toBe(1); // never exceeds 1
  });
});

describe("isValidEmail / isReadyToSubmit — gate the lit state", () => {
  it("accepts a normal address and rejects half-typed ones", () => {
    expect(isValidEmail("ada@corp.com")).toBe(true);
    expect(isValidEmail("  ada@corp.com  ")).toBe(true);
    expect(isValidEmail("ada@corp")).toBe(false);
    expect(isValidEmail("ada@")).toBe(false);
    expect(isValidEmail("ada")).toBe(false);
    expect(isValidEmail("")).toBe(false);
  });

  it("is ready only with a valid email AND an 8+ char password", () => {
    expect(isReadyToSubmit("ada@corp.com", "hunter22")).toBe(true);
    expect(isReadyToSubmit("ada@corp.com", "short")).toBe(false);
    expect(isReadyToSubmit("ada@corp", "hunter22")).toBe(false);
    expect(isReadyToSubmit("", "")).toBe(false);
  });
});
