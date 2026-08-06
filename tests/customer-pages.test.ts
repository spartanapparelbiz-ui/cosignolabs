import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

/**
 * Mission Control, the Policy Simulator, and "What cosigno can do" are
 * customer pages, not consoles. Each answers one question, and none of them
 * may leak the engine's vocabulary. These tests pin both.
 */

const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");

const CONTROL = readFileSync("src/components/app/MissionControl.tsx", "utf8");
const CONTROL_CODE = strip(CONTROL);
const CONTROL_API = readFileSync("src/app/api/mission-control/route.ts", "utf8");
const SIM = readFileSync("src/components/app/Simulation.tsx", "utf8");
const TWINS = readFileSync("src/components/app/DigitalTwins.tsx", "utf8");
const TWINS_CODE = strip(TWINS);

describe("mission control: what is cosigno doing right now?", () => {
  it("asks and answers the question in the header", () => {
    expect(CONTROL).toMatch(/What cosigno is doing right now/);
  });

  it("shows only active work — finished missions are archived, not displayed", () => {
    expect(CONTROL_API).toMatch(/const shown = live\.slice/);
    expect(CONTROL_API).not.toMatch(/live\.length \? live : missions/);
    expect(CONTROL_API).toMatch(/finished_count/);
  });

  it("cards carry the six facts an owner checks for — and none of the machinery", () => {
    // Present: mission, current step, progress, next step, started.
    expect(CONTROL).toMatch(/current_task/);
    expect(CONTROL).toMatch(/next_step/);
    expect(CONTROL).toMatch(/started_at/);
    expect(CONTROL).toMatch(/steps_done/);
    // Absent: the SRE vocabulary the audit called out.
    for (const jargon of [/health/i, /queue/i, /tool_calls/, /worker/i, /runtime_ms/, /retries/]) {
      expect(CONTROL_CODE).not.toMatch(jargon);
    }
  });

  it("offers no estimated completion — the runtime measures no durations to base one on", () => {
    expect(CONTROL_CODE).not.toMatch(/estimat/i);
    expect(CONTROL_CODE).not.toMatch(/\beta\b/i);
  });

  it("quiet is a designed state: delegate, templates, and where finished work went", () => {
    expect(CONTROL).toMatch(/All quiet/);
    expect(CONTROL).toMatch(/delegate something/);
    expect(CONTROL).toMatch(/browse templates/);
  });

  it("names apps like a person would, never by tool id", () => {
    expect(CONTROL_API).toMatch(/APP_NAME\[s\.tool\.split\("\."\)\[0\]\]/);
  });
});

describe("policy simulator: what would happen if I added this rule?", () => {
  it("asks and answers the question in the header", () => {
    expect(SIM).toMatch(/What would happen if I added this rule\?/);
  });

  it("answers with the two counts someone asked for", () => {
    expect(SIM).toMatch(/would have been stopped/);
    expect(SIM).toMatch(/would still pass/);
  });

  it("renders a verdict with its reasoning visible, all three honest branches", () => {
    expect(SIM).toMatch(/Safe to enable\./);
    expect(SIM).toMatch(/Looks safe to enable\./);
    expect(SIM).toMatch(/This rule is broad\./);
    expect(SIM).toMatch(/Read this one before enabling\./);
  });

  it("enable is real: previews the ENFORCED interpretation, then saves via the rules engine", () => {
    // The saved rule is what the permissions engine will hold — its parse is
    // shown before the button, so what you approve is what runs.
    expect(SIM).toMatch(/\/api\/rules\?preview=1/);
    expect(SIM).toMatch(/enabling saves it as:/);
    expect(SIM).toMatch(/fetch\("\/api\/rules", \{\s*method: "POST"/);
  });

  it("refuses to offer enabling a rule the engine can't enforce", () => {
    expect(SIM).toMatch(/disabled=\{!enforced/);
    expect(SIM).toMatch(/rephrase it to enable it/);
  });

  it("states the tighten-only guarantee in plain words", () => {
    expect(SIM).toMatch(/can never give it more\s+permission/);
  });
});

describe("what cosigno can do: capabilities in the reader's verbs", () => {
  it("asks and answers the question in the header", () => {
    expect(TWINS).toMatch(/What cosigno can do in your apps/);
  });

  it("groups by read / create / update / delete — no modeling vocabulary", () => {
    expect(TWINS).toMatch(/title: "Read"/);
    expect(TWINS).toMatch(/title: "Create"/);
    expect(TWINS).toMatch(/title: "Update"/);
    expect(TWINS).toMatch(/title: "Delete"/);
    for (const jargon of [/resource type/i, /capability model/i, /schema[_ ]only/i, /twin/i]) {
      // The rendered strings, not the file name or type names.
      const rendered = TWINS_CODE.replace(/import[^;]+;/g, "");
      expect(rendered.match(jargon)?.[0] ?? "").not.toMatch(/resource type|capability model|schema/i);
    }
  });

  it("marks approval-required abilities in plain words", () => {
    expect(TWINS).toMatch(/asks you first/);
    expect(TWINS).toMatch(/needsApproval/);
  });

  it("a connected app shows real recent activity — executed actions only", () => {
    expect(TWINS).toMatch(/status=executed/);
    expect(TWINS).toMatch(/Recently, in \{t\.name\}/);
  });

  it("a disconnected app says exactly what connecting unlocks, with the door", () => {
    expect(TWINS).toMatch(/connecting unlocks all of this/);
    expect(TWINS).toMatch(/connect \{t\.name\}/);
  });

  it("last checked is the connection's real health check, never an invented sync time", () => {
    expect(TWINS).toMatch(/last_checked_at/);
    const api = readFileSync("src/app/api/twin/route.ts", "utf8");
    expect(api).toMatch(/last_checked_at: c\.last_health_at/);
  });
});
