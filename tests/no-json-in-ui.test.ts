import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * A standing guard on the rule the whole visual layer rests on: a user never
 * reads JSON to understand what AI did.
 *
 * It kept coming back — the activity expansion, the details panel, a mission
 * step's output, the landing page's demo card, two payload editors — so it is
 * now a test rather than a good intention. Serializing a value into the DOM is
 * banned outright; the only `JSON.stringify` allowed in a component is one
 * building a request body or comparing two values.
 */

const UI_DIRS = ["src/components", "src/app"];

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) out.push(...walk(path));
    else if (path.endsWith(".tsx")) out.push(path);
  }
  return out;
}

/** Uses that are about talking to the server, not about showing a human. */
function isAllowed(line: string): boolean {
  return (
    /body:\s*JSON\.stringify/.test(line) ||
    /JSON\.stringify\([^)]*\)\s*(===|!==)/.test(line) ||
    /(===|!==)\s*JSON\.stringify/.test(line)
  );
}

describe("no JSON in the interface", () => {
  const files = UI_DIRS.flatMap(walk);

  it("scans every component (sanity check that the walk works)", () => {
    expect(files.length).toBeGreaterThan(40);
  });

  it("never renders a serialized value", () => {
    const offenders: string[] = [];
    for (const file of files) {
      readFileSync(file, "utf8")
        .split("\n")
        .forEach((line, i) => {
          if (!line.includes("JSON.stringify")) return;
          if (isAllowed(line)) return;
          offenders.push(`${file}:${i + 1} — ${line.trim().slice(0, 100)}`);
        });
    }
    expect(offenders).toEqual([]);
  });

  it("never puts a payload in a <pre> block", () => {
    const offenders: string[] = [];
    for (const file of files) {
      const source = readFileSync(file, "utf8");
      if (/<pre[^>]*>[\s\S]{0,200}(payload|JSON\.stringify|result)/.test(source)) {
        offenders.push(file);
      }
    }
    expect(offenders).toEqual([]);
  });
});
