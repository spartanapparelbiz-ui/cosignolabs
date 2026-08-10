import { describe, expect, it } from "vitest";
import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";

/**
 * Design invariants — the token system, enforced.
 *
 * The tokens exist so that surfaces feel like one product: every card lifts
 * by the same amount, every entrance takes one of four durations, orange
 * means exactly two things. That only holds while nobody reaches past the
 * tokens — and an arbitrary value in a className is precisely that reach.
 * One `duration-[273ms]` is invisible in review and permanent in the
 * product; this sweep makes it a failing build instead.
 *
 * Scope is deliberately motion + elevation + color: the dimensions where a
 * one-off is a felt inconsistency. Arbitrary font sizes and widths remain
 * legal — micro-typography genuinely varies per surface, and banning
 * `text-[11px]` would trade real flexibility for false purity.
 */

function componentFiles(): string[] {
  return execSync("git ls-files 'src/components/**/*.tsx' 'src/app/**/*.tsx'")
    .toString()
    .trim()
    .split("\n")
    .filter(Boolean);
}

function stripComments(code: string): string {
  return code.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");
}

/** Arbitrary-value escapes for the tokenized dimensions. */
const ARBITRARY = [
  { pattern: /duration-\[/, rule: "durations come from the motion tokens (fast/base/entrance/slow)" },
  { pattern: /ease-\[/, rule: "easings come from the motion tokens (brand-out/spring)" },
  { pattern: /animate-\[/, rule: "animations come from the named vocabulary in tailwind.config" },
  { pattern: /shadow-\[/, rule: "elevation comes from the ladder (e1–e4, soft, lift, well, hairline, key)" },
  { pattern: /accent-\[#/, rule: "accent colors come from the palette (accent-signal)" },
] as const;

describe("no component reaches past the tokens", () => {
  it.each(ARBITRARY)("$rule", ({ pattern }) => {
    const offenders = componentFiles()
      .filter((f) => pattern.test(stripComments(readFileSync(f, "utf8"))))
      .map((f) => `${f} uses an arbitrary value where a token exists`);
    expect(offenders).toEqual([]);
  });
});

/**
 * Raw hex in components. Color lives in the theme variables and lib/brand;
 * a hex literal in a component is either a missed token or a decision that
 * belongs in the palette. The allowlist is the set of legitimate exceptions,
 * each with a reason — growing it is a review conversation.
 */
const HEX_ALLOWLIST: Record<string, string> = {
  // Google's sign-in mark uses Google's brand colors, which are Google's.
  "src/components/auth/AuthForm.tsx": "third-party brand mark",
  // The mark's per-theme identity table (light / dark / oled) — this file is
  // identity code, the logo's equivalent of lib/brand.
  "src/components/brand/Logo.tsx": "the mark's own identity table",
  // The checkout demo card is a rendered physical object: its lacquer
  // gradients and chip gold are the prop's materials, not theme colors.
  "src/components/checkout/CheckoutCard.tsx": "physical prop materials",
};

describe("color lives in the palette", () => {
  it("no raw hex outside the allowlist", () => {
    const offenders: string[] = [];
    for (const f of componentFiles()) {
      if (f in HEX_ALLOWLIST) continue;
      const code = stripComments(readFileSync(f, "utf8"));
      // Six-digit form only: the three-digit form matches issue and PR
      // numbers in copy ("merge pull request #218"), and every real color
      // in this codebase is written long-form.
      const hex = code.match(/#[0-9a-fA-F]{6}\b/);
      if (hex) offenders.push(`${f}: ${hex[0]} — import from lib/brand or use a theme token`);
    }
    expect(offenders).toEqual([]);
  });

  it("the allowlist doesn't rot — listed files still need their exception", () => {
    for (const [f, why] of Object.entries(HEX_ALLOWLIST)) {
      const code = stripComments(readFileSync(f, "utf8"));
      expect(code, `${f} no longer contains hex; drop it from the allowlist (${why})`).toMatch(
        /#[0-9a-fA-F]{6}\b/
      );
    }
  });
});
