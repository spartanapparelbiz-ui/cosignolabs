import { describe, expect, it } from "vitest";
import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";

/**
 * Architecture invariants — the decisions that must outlive whoever made
 * them, encoded as failures.
 *
 * Everything here was once a sentence in a code review or a comment in a
 * module header. Sentences get forgotten; these don't. The rules are few and
 * they are the ones that make the rest of the codebase reason-about-able:
 *
 *   1. Dependencies point one way: UI → domain → primitives. A domain module
 *      that imports a component can never be tested, reused, or trusted to
 *      run on the server again.
 *   2. The pure primitives stay pure. Their value is that given the same
 *      records they always produce the same answer — which is only true
 *      while they cannot reach a store, a network, or a clock.
 *   3. Sample data stays quarantined. The demo business dataset is honest
 *      only while every reader knows it is sample; the moment a briefing or
 *      a tile imports it, a labeled demo becomes a fabricated metric.
 *   4. The trust surface renders the trust facts. An approval card without
 *      its brief is a button asking for blind consent.
 */

function files(globs: string): string[] {
  return execSync(`git ls-files ${globs}`).toString().trim().split("\n").filter(Boolean);
}

function stripComments(code: string): string {
  return code.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");
}

function importsOf(file: string): string[] {
  const code = stripComments(readFileSync(file, "utf8"));
  return [
    ...[...code.matchAll(/from\s+"([^"]+)"/g)].map((m) => m[1]),
    ...[...code.matchAll(/import\s*\(\s*"([^"]+)"\s*\)/g)].map((m) => m[1]),
  ];
}

/* ------------------------------------------------------ 1. layering */

describe("dependencies point one way", () => {
  it("nothing under lib/ imports UI (components/ or app/)", () => {
    const offenders: string[] = [];
    for (const f of files("'src/lib/*.ts' 'src/lib/**/*.ts'")) {
      for (const spec of importsOf(f)) {
        if (/^@\/(components|app)\//.test(spec)) {
          offenders.push(`${f} → ${spec}`);
        }
      }
    }
    expect(offenders).toEqual([]);
  });
});

/* ---------------------------------------------------- 2. pure primitives */

/**
 * The manifest. A module earns a place here by promising that its exports
 * are total functions over records — and the promise is enforced, not
 * remembered. Adding a primitive means adding it here; removing one from
 * here is a design decision that belongs in review.
 */
const PURE_PRIMITIVES = [
  "src/lib/time.ts",
  "src/lib/status.ts",
  "src/lib/hold.ts",
  "src/lib/sign.ts",
  "src/lib/clarity.ts",
  "src/lib/actionPresentation.ts",
  "src/lib/approvals/brief.ts",
  "src/lib/approvals/simulate.ts",
  "src/lib/decisions/cadence.ts",
  "src/lib/missions/graph.ts",
  "src/lib/missions/replay.ts",
  "src/lib/workspace/map.ts",
  "src/lib/home/model.ts",
  "src/lib/home/briefing.ts",
  "src/lib/compose/autocomplete.ts",
  "src/lib/command/palette.ts",
  "src/lib/authz/blastRadius.ts",
] as const;

/** What purity forbids: persistence, network, environment, framework, UI. */
const IMPURE_IMPORTS =
  /store|supabase|stripe|ratelimit|httpClient|integrations\/runtime|actions\/(engine|executor)|^next(\/|$)|^react(-dom)?(\/|$)|^node:|\benv\b|autopilot\/sample/;
const IMPURE_GLOBALS = /\bfetch\s*\(|\bprocess\.env\b|\blocalStorage\b|\bwindow\./;

describe("the pure primitives stay pure", () => {
  it.each(PURE_PRIMITIVES)("%s reaches no store, network, env, or UI", (file) => {
    for (const spec of importsOf(file)) {
      expect(spec, `${file} imports ${spec}`).not.toMatch(IMPURE_IMPORTS);
      expect(spec, `${file} imports UI`).not.toMatch(/^@\/(components|app)\//);
    }
    const code = stripComments(readFileSync(file, "utf8"));
    expect(code, `${file} touches an impure global`).not.toMatch(IMPURE_GLOBALS);
  });

  it("the deterministic record-readers never consult a clock at all", () => {
    // Replay and the plan graph make a stronger promise than purity: their
    // output is a function of stored records ONLY, so the same mission
    // replays identically forever. A Date.now() anywhere in them — even a
    // "harmless" default — breaks that contract silently.
    for (const f of ["src/lib/missions/replay.ts", "src/lib/missions/graph.ts"]) {
      const code = stripComments(readFileSync(f, "utf8"));
      expect(code, `${f} consults the clock`).not.toMatch(/Date\.now|new Date\(\)/);
    }
  });

  it("the manifest itself stays honest — listed files exist", () => {
    const tracked = new Set(files("'src/lib/*.ts' 'src/lib/**/*.ts'"));
    for (const f of PURE_PRIMITIVES) {
      expect(tracked.has(f), `${f} is in the manifest but not the repo`).toBe(true);
    }
  });
});

/* ------------------------------------------------- 3. sample quarantine */

describe("sample data stays quarantined", () => {
  it("only lib/autopilot may import the sample business dataset", () => {
    const offenders: string[] = [];
    for (const f of files("'src/**/*.ts' 'src/**/*.tsx'")) {
      if (f.startsWith("src/lib/autopilot/")) continue;
      for (const spec of importsOf(f)) {
        if (/autopilot\/sample/.test(spec)) offenders.push(`${f} → ${spec}`);
      }
    }
    expect(offenders).toEqual([]);
  });

  it("the home surface never reads autopilot at all", () => {
    // The briefing's rule is that every line is a measurement. The autopilot
    // module's business series are sample-labeled by design — honest on
    // their own page, a fabricated metric anywhere near the briefing.
    for (const f of files("'src/lib/home/**/*.ts' 'src/components/app/home/**/*.tsx'")) {
      for (const spec of importsOf(f)) {
        expect(spec, `${f} imports ${spec}`).not.toMatch(/autopilot/);
      }
    }
  });
});

/* ---------------------------------------------------- 4. trust surface */

describe("the trust surface renders the trust facts", () => {
  it("every pending approval card carries its decision brief", () => {
    const card = readFileSync("src/components/ActionCard.tsx", "utf8");
    // The brief is derived on the card and rendered for pending actions —
    // not behind a click, not conditional on anything but pendingness.
    expect(card).toMatch(/approvalBrief\(action\)/);
    expect(card).toMatch(/\{pending && <DecisionBrief brief=\{brief\} \/>\}/);
  });

  it("the simulation panel opens with the nothing-happened sentence", () => {
    const panel = readFileSync("src/components/approvals/SimulationPanel.tsx", "utf8");
    expect(panel).toMatch(/\{sim\.note\}/);
  });

  it("the palette declares it cannot authorise, in source and on screen", () => {
    const bar = readFileSync("src/components/app/CommandBar.tsx", "utf8");
    expect(bar).toMatch(/nothing here runs without your approval/);
    // And structurally: the palette's action grammar only composes and
    // navigates. The union is pinned exactly, and PaletteAction.kind is
    // typed against it — so adding an "approve" action means editing this
    // line, which is the review conversation the invariant exists to force.
    const palette = stripComments(readFileSync("src/lib/command/palette.ts", "utf8"));
    expect(palette).toMatch(/export type ActionKind = "delegate" \| "navigate";/);
    expect(palette).toMatch(/kind: ActionKind;/);
  });
});
