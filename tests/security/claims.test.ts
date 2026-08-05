import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { CATEGORIES, type ActionCategory } from "../../src/lib/types";

/**
 * Public claims must match the code.
 *
 * The security page said "only your signature executes" and "no code path moves
 * an action to executed without a logged user approval". Both were false: tier-1
 * actions are auto-approved by the system and execute with no signature at all.
 *
 * The claim was still nearly true — tier 1 is search, summarise and draft, none
 * of which change anything outside cosigno — which is exactly what made it
 * dangerous. A precise-sounding security claim that is wrong at the edges is
 * worse than a vague one, because people rely on the precision.
 */

const SECURITY = readFileSync("src/app/security/page.tsx", "utf8");
const OPERATORS = readFileSync("src/app/operators/page.tsx", "utf8");
const TERMS = readFileSync("src/app/terms/page.tsx", "utf8");
const PUBLIC_PAGES = [SECURITY, OPERATORS, TERMS];

/** What actually auto-clears, read from the engine's own table. */
const AUTO_CLEARED = (Object.keys(CATEGORIES) as ActionCategory[]).filter(
  (c) => CATEGORIES[c].defaultTier === 1
);

describe("what auto-clears is only ever read-or-draft work", () => {
  it("tier 1 changes nothing outside cosigno", () => {
    // If this ever gains a category that transmits or mutates, the security
    // page's wording becomes false and this fails first.
    expect([...AUTO_CLEARED].sort()).toEqual(["draft", "search", "summarize"]);
  });

  it("everything that touches the outside world is gated", () => {
    for (const c of ["send_email", "post_content", "update_record", "spend", "webhook", "connection_call", "delete", "refund", "payment"] as ActionCategory[]) {
      expect(CATEGORIES[c].defaultTier).toBeGreaterThan(1);
    }
  });

  it("the most destructive categories can never be lowered", () => {
    for (const c of ["delete", "refund", "payment"] as ActionCategory[]) {
      expect(CATEGORIES[c].pinned).toBe(true);
      expect(CATEGORIES[c].defaultTier).toBe(3);
    }
  });
});

describe("no page claims a signature is required for everything", () => {
  it.each([
    ["security", SECURITY],
    ["operators", OPERATORS],
  ])("%s page does not say only a signature executes", (_name, src) => {
    expect(src).not.toMatch(/only your signature executes/i);
    expect(src).not.toMatch(/no code path moves an action to executed without a logged user approval/i);
  });

  it("the security page states the real boundary instead", () => {
    expect(SECURITY).toMatch(/nothing that changes anything outside cosigno executes without your signature/i);
    // And names what does clear on its own, rather than leaving it implied.
    expect(SECURITY.toLowerCase()).toContain("searching, summarising, and drafting clear automatically");
  });

  it("says auto-cleared work is logged as auto-cleared, not as your approval", () => {
    expect(SECURITY).toMatch(/never as approved by you/i);
  });
});

describe("no compliance claim the product cannot support", () => {
  it.each([
    "SOC 2",
    "SOC2",
    "ISO 27001",
    "HIPAA",
    "PCI DSS",
    "FedRAMP",
    "GDPR compliant",
    "GDPR-compliant",
    "HIPAA compliant",
  ])("never claims %s", (badge) => {
    for (const src of PUBLIC_PAGES) {
      expect(src.toLowerCase()).not.toContain(badge.toLowerCase());
    }
  });

  it.each([
    "military-grade",
    "bank-level",
    "unhackable",
    "100% secure",
    "completely secure",
    "zero risk",
  ])("never claims %s", (hype) => {
    for (const src of PUBLIC_PAGES) {
      expect(src.toLowerCase()).not.toContain(hype.toLowerCase());
    }
  });
});

describe("the limits of the product are stated, not buried", () => {
  it("says AI proposals can be wrong", () => {
    expect(TERMS).toMatch(/inaccurate, incomplete, or unsuitable/i);
  });

  it("says approval is a safeguard rather than a guarantee", () => {
    expect(TERMS).toMatch(/safeguard, not a guarantee/i);
  });

  it("says the user remains responsible for what they approve", () => {
    expect(TERMS).toMatch(/responsible for every\s+action you approve/i);
  });

  it("does not promise absolute security", () => {
    const privacy = readFileSync("src/app/privacy/page.tsx", "utf8");
    expect(privacy).toMatch(/cannot guarantee absolute security/i);
  });
});
