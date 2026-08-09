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
    expect(CONTROL).toMatch(/What's running right now\?/);
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
    expect(CONTROL).toMatch(/Nothing is running/);
    expect(CONTROL).toMatch(/Start a mission/);
    expect(CONTROL).toMatch(/Browse templates/);
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
    expect(SIM).toMatch(/Enabling saves it as:/);
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
    expect(SIM).toMatch(/Who&apos;s affected:/);
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
    // Recent work is EXECUTED actions only — a proposed card hasn't done
    // anything, and listing it as work done would be a claim, not a record.
    expect(CONNECTIONS).toMatch(/mine\.filter\(\(a\) => a\.status === "executed"\)/);
    expect(CONNECTIONS).toMatch(/recent: done\.slice\(0, 3\)/);
    expect(CONNECTIONS).toMatch(/What cosigno does in \{name\} shows up here|<span>Recently<\/span>/);
    expect(CONNECTIONS).toMatch(/checked \{checkedAgo\(lastCheckedAt\)\}/);
  });

  it("per-app value counts are real and never render a zero", () => {
    expect(CONNECTIONS).toMatch(/stats\.completed > 0 &&/);
    expect(CONNECTIONS).toMatch(/stats\.approvals > 0 &&/);
    expect(CONNECTIONS).toMatch(/stats\.automatic > 0 &&/);
    expect(CONNECTIONS).toMatch(/actions completed/);
    expect(CONNECTIONS).toMatch(/approvals requested/);
    expect(CONNECTIONS).toMatch(/completed automatically/);
  });

  it("apps are searchable, and no match says so rather than showing an empty list", () => {
    expect(CONNECTIONS).toMatch(/aria-label="search apps"/);
    expect(CONNECTIONS).toMatch(/visibleProviders/);
    expect(CONNECTIONS).toMatch(/No app matches/);
  });

  it("open-app links go to the app's real declared home, never a guessed URL", async () => {
    expect(CONNECTIONS).toMatch(/href=\{p\.homeUrl\}/);
    expect(CONNECTIONS).toMatch(/rel="noreferrer noopener"/);
    // Only providers that actually declare a home get the link.
    const { listProviderMeta } = await import("../src/lib/integrations/registry");
    for (const meta of listProviderMeta()) {
      if (meta.homeUrl) expect(meta.homeUrl).toMatch(/^https:\/\//);
    }
  });

  it("a connected app lists the standing rules that govern it — via the SAME matcher enforcement uses", () => {
    expect(CONNECTIONS).toMatch(/ruleAppliesToApp\(r, providerKey, providerName\)/);
    expect(CONNECTIONS).toMatch(/Rules protecting \{providerName\}/);
    const rulesLib = readFileSync("src/lib/rules.ts", "utf8");
    expect(rulesLib).toMatch(/export function ruleAppliesToApp/);
    /* Enforcement stopped reading prose: it resolves both sides to a closed
       (provider, operation) vocabulary first. The display filter has to use
       that SAME test — the point of this assertion — so it now pins
       scopeCovers rather than the substring table that was removed. */
    expect(rulesLib).toMatch(/return provider \? scopeCovers\(rule\.target, provider\) : false;/);
    expect(rulesLib).not.toMatch(/TARGET_SYNONYMS/);
  });

  it("a disconnected app sells what connecting unlocks — its real abilities, one click away", () => {
    // The unlock list itself, drawn from the provider's real declared
    // abilities. The list used to carry a "connect X to let cosigno" heading;
    // the list is the pitch, so the heading went and this pins the list.
    expect(CONNECTIONS).toMatch(/p\.actions\.slice\(0, UNLOCK_SHOWN\)/);
    // The provider's OWN plain-English summary, not the action id: "whoami"
    // is the engine's word, "read your GitHub profile" is the outcome.
    expect(CONNECTIONS).toMatch(/\{a\.summary\.replace/);
    expect(CONNECTIONS).toMatch(/asks you first/);
  });

  it("no provider ability reads like an engine identifier", async () => {
    const { listProviderMeta } = await import("../src/lib/integrations/registry");
    for (const meta of listProviderMeta()) {
      for (const a of meta.actions) {
        // Summaries are what the unlock list renders — they must be sentences,
        // never snake_case ids or bare API verbs.
        expect(a.summary, `${meta.key}.${a.id}`).not.toMatch(/^[a-z]+_[a-z_]+$/);
        expect(a.summary, `${meta.key}.${a.id}`).not.toMatch(/whoami|GET |POST |PATCH |DELETE /);
        expect(a.summary.length, `${meta.key}.${a.id}`).toBeGreaterThan(8);
      }
    }
  });

  it("the panel doesn't repeat the page's own heading", () => {
    expect(CONNECTIONS).not.toMatch(/the apps and MCP servers cosigno can act across/);
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
