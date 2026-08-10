import { describe, expect, it } from "vitest";
import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";

/**
 * One time language, everywhere — the enforcement half of lib/time.
 *
 * The same moment used to read five different ways depending on the surface
 * ("3m ago" / "3 min ago" / "3 minutes" / "about 3 minutes"), each from its
 * own hand-rolled `Math.round((Date.now() - t) / 60000)`. The vocabulary now
 * lives in lib/time with its registers enumerated and named; this sweep keeps
 * the hand-rolled versions from growing back, the way the status-vocabulary
 * sweep keeps pages from inventing their own words for "failed".
 *
 * Two invariants:
 *   1. Nobody computes a date-delta-in-minutes inline. That expression is
 *      the tell-tale first line of every private time formatter.
 *   2. Nobody constructs "…m ago"-style strings outside lib/time. If a new
 *      register is genuinely needed, it is added to the vocabulary — which
 *      is a design decision — not to a component.
 */

/** The one module allowed to know how times are worded. */
const VOCABULARY = "src/lib/time.ts";

function sourceFiles(): string[] {
  return execSync("git ls-files 'src/**/*.ts' 'src/**/*.tsx'")
    .toString()
    .trim()
    .split("\n")
    .filter((f) => f !== VOCABULARY);
}

/** Drop comments so prose about time formatting doesn't trip the sweep. */
function strip(code: string): string {
  return code.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");
}

describe("lib/time is the only place that words a time", () => {
  it("no inline date-delta-to-minutes math anywhere else", () => {
    // Date.parse/now on the same line as a divide-by-60000: the signature
    // opening move of a private formatter. Interval constants (POLL_MS,
    // rate-limit windows) don't match — they multiply, or carry no Date call.
    const pattern = /Date\.(now|parse)[^\n]*\/\s*60_?000/;
    const offenders = sourceFiles()
      .filter((f) => pattern.test(strip(readFileSync(f, "utf8"))))
      .map((f) => `${f} computes a date delta in minutes — use a lib/time register`);
    expect(offenders).toEqual([]);
  });

  it("no '…m ago'-style string construction anywhere else", () => {
    // Template literals assembling ago-strings. Matching the interpolation
    // (`}m ago`, `} min ago`) rather than the phrase keeps prose, tests and
    // aria-labels out of scope — only construction counts.
    const pattern = /\}\s?(m|h|d|s|min|minute(s)?|hour(s)?|day(s)?)\s+ago/;
    const offenders = sourceFiles()
      .filter((f) => pattern.test(strip(readFileSync(f, "utf8"))))
      .map((f) => `${f} builds its own "ago" string — use a lib/time register`);
    expect(offenders).toEqual([]);
  });

  it("the vocabulary itself still owns both", () => {
    // If a refactor moves the formatters somewhere else, this sweep would
    // silently pass while enforcing nothing. The vocabulary must keep the
    // patterns the other files are forbidden from having.
    const code = strip(readFileSync(VOCABULARY, "utf8"));
    expect(code).toMatch(/60_000/);
    expect(code).toMatch(/ago/);
  });
});
