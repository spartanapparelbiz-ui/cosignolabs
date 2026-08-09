import { describe, expect, it } from "vitest";
import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { DURATION, EASE, MOTION, transitionFor } from "../src/lib/motion";

/**
 * ONE MOTION SYSTEM, NOT FORTY.
 *
 * Two failures this file exists to catch, both of which happened while
 * building it:
 *
 * 1. A COMPONENT REFERENCES AN ANIMATION THAT DOESN'T EXIST. `animate-foo`
 *    with no matching keyframe is not an error anywhere — Tailwind emits
 *    nothing, React renders the class, and the element simply sits there. If
 *    the animation was an entrance with `both` fill, the element sits there
 *    INVISIBLE. Silent, and invisible content is the worst possible failure.
 *
 * 2. A COMPONENT INVENTS ITS OWN TIMING. One-off `duration-[370ms]` values
 *    are how a product ends up feeling like several products; the tokens
 *    exist so that "how fast should this be" is answered once.
 */

const TAILWIND = readFileSync("tailwind.config.ts", "utf8");

/** Every `animate-x` utility the config defines. */
function definedAnimations(): Set<string> {
  const block = TAILWIND.slice(TAILWIND.indexOf("animation: {"));
  const names = new Set<string>();
  for (const m of block.matchAll(/^\s+"?([a-z0-9-]+)"?:\s*"/gim)) names.add(m[1]);
  return names;
}

/** Every `animate-x` class actually used in the source. */
function usedAnimations(): Map<string, string[]> {
  const files = execSync("git ls-files 'src/**/*.tsx' 'src/**/*.ts'")
    .toString()
    .trim()
    .split("\n")
    .filter(Boolean);
  const used = new Map<string, string[]>();
  for (const file of files) {
    // A path can be in the index but absent from disk mid-rebase or mid-move.
    // That is not a design-system failure, so it must not read as one.
    let src: string;
    try {
      src = readFileSync(file, "utf8");
    } catch {
      continue;
    }
    for (const m of src.matchAll(/\banimate-([a-z0-9-]+)/g)) {
      // Tailwind ships these four; the config doesn't redeclare them.
      if (["spin", "ping", "pulse", "bounce", "none"].includes(m[1])) continue;
      used.set(m[1], [...(used.get(m[1]) ?? []), file]);
    }
  }
  return used;
}

describe("no component can reference an animation that doesn't exist", () => {
  it("every animate-* class in the source is defined in the design tokens", () => {
    const defined = definedAnimations();
    const missing = [...usedAnimations().entries()]
      .filter(([name]) => !defined.has(name))
      .map(([name, files]) => `animate-${name} (${files[0]})`);
    expect(missing, "undefined animation utilities render as invisible elements").toEqual([]);
  });

  it("the config actually defines animations to check against", () => {
    // Guards the parser above: a regex that silently matched nothing would
    // make the assertion above pass forever.
    expect(definedAnimations().size).toBeGreaterThan(20);
  });
});

describe("timings come from the tokens, not from taste", () => {
  it("every purpose has a duration and an easing", () => {
    for (const [purpose, spec] of Object.entries(MOTION)) {
      expect(spec.duration, purpose).toBeGreaterThan(0);
      expect(spec.ease, purpose).toBeTruthy();
    }
  });

  it("the purposes are ordered by how much attention they ask for", () => {
    // A button may not take as long as a page, and a page may not take as
    // long as a celebration. If this inverts, the product feels sluggish
    // where it should be instant and abrupt where it should land.
    expect(MOTION.micro.duration).toBeLessThan(MOTION.transition.duration);
    expect(MOTION.transition.duration).toBeLessThan(MOTION.state.duration);
    expect(MOTION.state.duration).toBeLessThanOrEqual(MOTION.celebration.duration);
    expect(MOTION.ambient.duration).toBeGreaterThan(MOTION.celebration.duration);
  });

  it("builds a real CSS transition from a purpose", () => {
    expect(transitionFor("micro", "transform")).toBe(
      `transform ${DURATION.fast}ms ${EASE.out}`
    );
    expect(transitionFor("transition")).toContain("opacity");
  });

  it("the Tailwind duration scale mirrors the tokens exactly", () => {
    // Two sources of truth for "fast" is how they drift apart.
    for (const [name, ms] of Object.entries(DURATION)) {
      expect(TAILWIND, name).toContain(`${name}: "${ms}ms"`);
    }
  });
});

describe("motion is switchable off without breaking the product", () => {
  const CSS = readFileSync("src/app/globals.css", "utf8");

  it("reduced motion removes movement", () => {
    expect(CSS).toMatch(/@media \(prefers-reduced-motion: reduce\)/);
    expect(CSS).toMatch(/animation-duration: 1ms !important/);
  });

  it("but keeps a perceptible state change on things you interact with", () => {
    // Collapsing everything to zero is safe and slightly broken: a toggle,
    // an approval and a status change all become hard swaps with no feedback.
    const reduced = CSS.slice(CSS.indexOf("@media (prefers-reduced-motion: reduce)"));
    expect(reduced).toMatch(/transition-property: opacity, color, background-color/);
    expect(reduced).not.toMatch(/transition-property:[^;]*transform/);
  });

  it("the 3D layer switches itself off in JS as well as CSS", () => {
    // A pointer-driven transform isn't a CSS animation, so the media query
    // above can't reach it — it has to opt out itself.
    const depth = readFileSync("src/components/motion/Depth.tsx", "utf8");
    expect(depth).toContain("useRichMotion");
    expect(depth).toMatch(/if \(!rich \|\| e\.pointerType !== "mouse"\) return/);
  });

  it("a modest device gets the same treatment as an explicit preference", () => {
    const level = readFileSync("src/lib/useMotionLevel.ts", "utf8");
    expect(level).toMatch(/saveData/);
    expect(level).toMatch(/deviceMemory/);
    expect(level).toMatch(/hardwareConcurrency/);
  });
});
