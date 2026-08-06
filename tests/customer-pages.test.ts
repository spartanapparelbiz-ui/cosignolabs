import { describe, expect, it } from "vitest";
import { existsSync, readFileSync } from "node:fs";

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
const CONNECTIONS = readFileSync("src/components/account/ConnectionsPanel.tsx", "utf8");

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

  it("quiet is a designed state: start a mission, templates, and where finished work went", () => {
    expect(CONTROL).toMatch(/No work running/);
    expect(CONTROL).toMatch(/start a mission/);
    expect(CONTROL).toMatch(/browse templates/);
  });

  it("the workspace summary shows only real, non-zero numbers", () => {
    // Stats are filtered before render — a zero simply doesn't appear.
    expect(CONTROL).toMatch(/running > 0 &&/);
    expect(CONTROL).toMatch(/connectedApps > 0 &&/);
    expect(CONTROL).toMatch(/opsThisMonth > 0 &&/);
    expect(CONTROL).toMatch(/AI operations completed this month/);
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

  it("popular rules are one click, and each label matches its enforced parse", async () => {
    expect(SIM).toMatch(/Popular rules/);
    expect(SIM).toMatch(/POPULAR_RULES\.map/);
    // Each catalog rule must parse into exactly what its label promises —
    // a chip that enforces broader than it reads is a small lie with a big
    // blast radius. Checked against the REAL parser.
    const { parsePermissionRule } = await import("../src/lib/rules");
    const want: Record<string, { requirement: string; verb: string }> = {
      "Require approval for refunds": { requirement: "approve", verb: "refund" },
      "Never delete anything": { requirement: "never", verb: "delete" },
      "Require a signature for payments over $500": { requirement: "sign", verb: "payment" },
      "Require approval before posting anything": { requirement: "approve", verb: "post" },
      "Require approval for sending email": { requirement: "approve", verb: "send" },
      "Never post to #announcements": { requirement: "never", verb: "post" },
    };
    for (const [textRule, expected] of Object.entries(want)) {
      expect(SIM).toContain(`"${textRule}"`);
      const parsed = parsePermissionRule(textRule);
      expect(parsed.requirement, textRule).toBe(expected.requirement);
      expect(parsed.verb, textRule).toBe(expected.verb);
    }
  });

  it("explains who is affected, from the replayed decisions", () => {
    expect(SIM).toMatch(/who&apos;s affected:/);
    expect(SIM).toMatch(/rule\{activeRules === 1 \? "" : "s"\} currently protecting your workspace/);
  });
});

describe("the twin concept is gone; connections is the complete app experience", () => {
  it("nothing named twin ships to users — no page, no component, no endpoint", () => {
    expect(existsSync("src/components/app/DigitalTwins.tsx")).toBe(false);
    expect(existsSync("src/app/api/twin/route.ts")).toBe(false);
    expect(existsSync("src/lib/twin/model.ts")).toBe(false);
    // The old route survives only as a redirect into connections.
    const page = readFileSync("src/app/app/twins/page.tsx", "utf8");
    expect(page).toMatch(/redirect\("\/app\/connections"\)/);
  });

  it("a connected app shows its recent real work and when it was last checked", () => {
    expect(CONNECTIONS).toMatch(/status=executed/);
    expect(CONNECTIONS).toMatch(/recently, in \{name\}/);
    expect(CONNECTIONS).toMatch(/last checked \{checkedAgo\(lastCheckedAt\)\}/);
  });

  it("a connected app lists the standing rules that govern it — via the SAME matcher enforcement uses", () => {
    expect(CONNECTIONS).toMatch(/ruleAppliesToApp\(r, providerKey, providerName\)/);
    expect(CONNECTIONS).toMatch(/rules protecting \{providerName\}/);
    const rulesLib = readFileSync("src/lib/rules.ts", "utf8");
    expect(rulesLib).toMatch(/export function ruleAppliesToApp/);
    expect(rulesLib).toMatch(/TARGET_SYNONYMS\[rule\.target\]/);
  });

  it("a disconnected app sells what connecting unlocks — its real abilities, one click away", () => {
    expect(CONNECTIONS).toMatch(/connect \{p\.name\} to let cosigno/);
    expect(CONNECTIONS).toMatch(/humanizeActionId\(a\.id\)/);
    expect(CONNECTIONS).toMatch(/asks first/);
  });

  it("abilities read in plain English with the approval fact — never method names or tier numbers alone", () => {
    expect(CONNECTIONS).toMatch(/no approval|your approval|typed confirmation/);
  });
});

describe("no engineering vocabulary reaches a rendered string", () => {
  it("sweeps every component for the banned words", () => {
    // Rendered strings only — comments and identifiers are the maintainer's
    // business. Sweep string literals + JSX text across all components.
    const { execSync } = require("node:child_process") as typeof import("node:child_process");
    const files = execSync("git ls-files 'src/components/*.tsx' 'src/components/**/*.tsx'")
      .toString()
      .trim()
      .split("\n");
    const banned = /(digital twin|capability model|resource type|operator graph|execution graph|execution engine|internal state|execution context)/i;
    const offenders: string[] = [];
    for (const file of files) {
      const code = strip(readFileSync(file, "utf8"));
      const m = code.match(banned);
      if (m) offenders.push(`${file}: ${m[0]}`);
    }
    expect(offenders).toEqual([]);
  });
});
