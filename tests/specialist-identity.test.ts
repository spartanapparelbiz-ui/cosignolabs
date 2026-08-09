import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import {
  SPECIALISTS,
  broughtInLine,
  specialistFor,
  specialistsUsed,
} from "../src/lib/agents/identity";
import { OPERATOR_PROFILES } from "../src/lib/missions/operators";

/**
 * Specialists are a real execution boundary wearing a human name.
 *
 * The risk of putting a friendly face on an enforced constraint is that the
 * face and the constraint drift apart: the engine grows a profile the
 * interface can't name, or the interface names one the engine never runs. The
 * first shows work attributed to nobody; the second is a lie about who did it.
 */

describe("every enforced profile has a face, and every face has a profile", () => {
  it.each(Object.keys(OPERATOR_PROFILES))("%s is nameable", (key) => {
    expect(SPECIALISTS[key]).toBeTruthy();
  });

  it("invents no specialist the engine cannot actually run", () => {
    for (const key of Object.keys(SPECIALISTS)) {
      expect(OPERATOR_PROFILES[key], key).toBeTruthy();
    }
  });

  it("carries the profile's real boundary into the words the user reads", () => {
    for (const [key, identity] of Object.entries(SPECIALISTS)) {
      expect(identity.never.trim().length, key).toBeGreaterThan(0);
      expect(identity.does.trim().length, key).toBeGreaterThan(0);
    }
  });
});

describe("an unknown operator is cosigno's responsibility, not a guess", () => {
  it("falls back to cosigno rather than a plausible-sounding specialist", () => {
    expect(specialistFor("a_profile_added_later").key).toBe("chief");
    expect(specialistFor(null).key).toBe("chief");
    expect(specialistFor(undefined).key).toBe("chief");
  });
});

describe("the words replace the engine's vocabulary", () => {
  it("says cosigno brought someone in, never 'delegated to a sub-agent'", () => {
    expect(broughtInLine("research")).toBe("cosigno brought in the research specialist.");
  });

  it("says nothing at all for cosigno's own work", () => {
    // "cosigno brought in cosigno" is how people learn to stop reading status.
    expect(broughtInLine("chief")).toBeNull();
  });

  it("no identity leaks the engine's own nouns", () => {
    const banned = /\b(operator profile|sub-?agent|orchestrat|tool call|execution graph|agent graph)\b/i;
    for (const [key, s] of Object.entries(SPECIALISTS)) {
      expect(`${s.name} ${s.does} ${s.never} ${s.character}`, key).not.toMatch(banned);
    }
  });
});

describe("identity survives without colour, motion, or a legend", () => {
  it("each specialist has a distinct symbol", () => {
    const symbols = Object.values(SPECIALISTS).map((s) => s.symbol);
    expect(new Set(symbols).size).toBe(symbols.length);
  });

  it("the mark is never shown without its name", () => {
    const src = readFileSync("src/components/agents/SpecialistMark.tsx", "utf8");
    // The chip is the default attribution, and it renders the name.
    expect(src).toMatch(/function SpecialistChip/);
    expect(src).toMatch(/\{s\.name\}/);
  });

  it("a motion signature plays only while that specialist is really working", () => {
    const src = readFileSync("src/components/agents/SpecialistMark.tsx", "utf8");
    expect(src).toMatch(/working \? SIGNATURE_CLASS\[s\.signature\] : ""/);
  });
});

describe("who worked on this", () => {
  it("lists each specialist once, in the order they appeared", () => {
    const used = specialistsUsed([
      { operator: "communication" },
      { operator: "communication" },
      { operator: "research" },
      { operator: "chief" },
    ]);
    expect(used.map((s) => s.key)).toEqual(["communication", "research", "chief"]);
  });

  it("is empty when nothing has run", () => {
    expect(specialistsUsed([])).toEqual([]);
  });
});
