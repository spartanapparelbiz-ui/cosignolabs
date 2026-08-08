import { beforeEach, describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { MemoryStore } from "../src/lib/store/memory";
import { compileMission } from "../src/lib/missions/compiler";
import {
  ALL_TEMPLATES,
  TEMPLATE_CATEGORIES,
  recommendedFor,
  searchTemplates,
} from "../src/lib/templates/catalog";

/**
 * The catalog's one promise: every card starts something that genuinely
 * works. These tests compile every goal through the REAL mission compiler —
 * a template that would produce a blocked or empty plan is a dead button
 * with better typography, and fails here before it ships.
 */

const USER = "tpl-user";

beforeEach(() => {
  (globalThis as unknown as { __cosignoStore?: unknown }).__cosignoStore = new MemoryStore();
});

describe("every template is real", () => {
  const goalTemplates = ALL_TEMPLATES.filter((t) => t.run.kind === "goal");
  const composeTemplates = ALL_TEMPLATES.filter((t) => t.run.kind === "compose");

  it.each(goalTemplates.map((t) => [t.title, t] as const))(
    "goal template %s compiles to an executable plan",
    async (_title, t) => {
      const goal = t.run.kind === "goal" ? t.run.goal : "";
      const result = await compileMission(USER, goal);
      expect(result.blocked).toBe(false);
      expect(result.plan.steps.length).toBeGreaterThan(0);
    }
  );

  it.each(composeTemplates.map((t) => [t.title, t] as const))(
    "compose template %s compiles once a subject is added",
    async (_title, t) => {
      const prefill = t.run.kind === "compose" ? t.run.prefill : "";
      // A representative subject — what a user would type after the prefill.
      const result = await compileMission(USER, `${prefill}example subject`);
      expect(result.blocked).toBe(false);
      expect(result.plan.steps.length).toBeGreaterThan(0);
    }
  );

  it("engine templates use only keys the missions API accepts", () => {
    const schemas = readFileSync("src/lib/schemas.ts", "utf8");
    for (const t of ALL_TEMPLATES) {
      if (t.run.kind === "engine") expect(schemas).toContain(`"${t.run.template}"`);
    }
  });

  it("no template promises a capability the engine lacks", () => {
    // The engine cannot merge PRs, deploy, publish, or move money. A card
    // headline claiming it would be a fake-capability button.
    for (const t of ALL_TEMPLATES) {
      expect(t.title).not.toMatch(/merge|deploy|refund|pay\b|publish/i);
      // Drafting content is real; posting it is not — outcomes that mention
      // drafts must not claim publication.
      if (/blog|linkedin|post/i.test(t.title)) {
        expect(t.outcome).toMatch(/draft|never published|yourself|ideas/i);
      }
    }
  });

  it("the github triage goal reads issues rather than opening one", async () => {
    // "open issues" phrasing would trip the compiler's wants-to-CREATE check
    // ("open" is a creation verb there) and turn a read into a write proposal.
    const triage = ALL_TEMPLATES.find((t) => t.key === "gh_triage")!;
    const goal = triage.run.kind === "goal" ? triage.run.goal : "";
    const result = await compileMission(USER, goal);
    expect(result.plan.steps.map((s) => s.tool)).toContain("github.list_issues");
    expect(result.plan.steps.map((s) => s.tool)).not.toContain("github.propose_issue");
  });

  it("the file-an-issue goal proposes, approval-gated", async () => {
    const file = ALL_TEMPLATES.find((t) => t.key === "gh_issue")!;
    const goal = file.run.kind === "goal" ? file.run.goal : "";
    const result = await compileMission(USER, goal);
    expect(result.plan.steps.map((s) => s.tool)).toContain("github.propose_issue");
    expect(result.plan.approvalCheckpoints.length).toBeGreaterThan(0);
  });
});

describe("the catalog's shape", () => {
  it("has the eight categories, each with real entries", () => {
    expect(TEMPLATE_CATEGORIES.map((c) => c.id)).toEqual([
      "development",
      "business",
      "research",
      "shopping",
      "travel",
      "content",
      "productivity",
      "personal",
    ]);
    for (const c of TEMPLATE_CATEGORIES) expect(c.templates.length).toBeGreaterThanOrEqual(2);
  });

  it("keys are unique — recents and busy-state key on them", () => {
    const keys = ALL_TEMPLATES.map((t) => t.key);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("inbox/brief/followups are a small category, not the whole page", () => {
    const productivity = TEMPLATE_CATEGORIES.find((c) => c.id === "productivity")!;
    expect(productivity.templates.length).toBeLessThan(ALL_TEMPLATES.length / 3);
  });

  it("every card says its one approval fact in plain words", () => {
    for (const t of ALL_TEMPLATES) {
      expect(t.approval.length).toBeGreaterThan(10);
      expect(t.approval).not.toMatch(/tier|category/i);
    }
  });
});

describe("search and featured rows", () => {
  it("finds templates by title, outcome, and category", () => {
    expect(searchTemplates("laptop").some((t) => t.key === "shop_laptop")).toBe(true);
    expect(searchTemplates("travel").length).toBeGreaterThanOrEqual(2);
    expect(searchTemplates("contract").some((t) => t.key === "res_contract")).toBe(true);
    expect(searchTemplates("zzz-nothing")).toEqual([]);
    expect(searchTemplates("")).toEqual(ALL_TEMPLATES);
  });

  it("recommends only from apps actually connected — nothing connected, nothing claimed", () => {
    expect(recommendedFor([])).toEqual([]);
    const withGithub = recommendedFor(["github"]);
    expect(withGithub.length).toBeGreaterThan(0);
    expect(withGithub.every((t) => t.shinesWith === "github")).toBe(true);
  });

  it("shows no invented numbers: no time estimates, no trending, no popularity", () => {
    // Comments explaining WHY those rows don't exist are fine; rendered
    // strings are what must stay clean.
    const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
    const gallery = strip(readFileSync("src/components/app/TemplateGallery.tsx", "utf8"));
    const catalog = strip(readFileSync("src/lib/templates/catalog.ts", "utf8"));
    for (const src of [gallery, catalog]) {
      expect(src).not.toMatch(/trending|popular/i);
      expect(src).not.toMatch(/estimated time|min\b.*estimate|≈/i);
    }
  });
});
