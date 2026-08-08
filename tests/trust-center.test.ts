import { beforeEach, describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { EngineError, proposeAction } from "../src/lib/actions/engine";
import { applyRules, describeRule, parsePermissionRule } from "../src/lib/rules";
import { getStore } from "../src/lib/store";
import { MemoryStore } from "../src/lib/store/memory";
import {
  CAPABILITIES,
  PRESETS,
  activePreset,
  explain,
  optionsFor,
  settingFor,
  tierForSetting,
  uncoveredCategories,
  type TrustSetting,
} from "../src/lib/trust/capabilities";
import {
  categoryTarget,
  forbiddenCategories,
  forbiddenRuleFor,
  targetCategory,
} from "../src/lib/trust/forbidden";
import { CATEGORIES, type ActionCategory, type PermissionRuleRecord, type Tier } from "../src/lib/types";

/**
 * The Trust Center makes promises in plain language. These tests exist to make
 * sure the engine keeps every one of them — a safety switch that doesn't switch
 * anything is the worst defect this product could ship.
 */

const USER = "trust-user";

function freshStore(): MemoryStore {
  const store = new MemoryStore();
  (globalThis as unknown as { __cosignoStore?: unknown }).__cosignoStore = store;
  return store;
}

beforeEach(() => {
  freshStore();
});

async function forbid(category: ActionCategory) {
  await getStore().createPermissionRule(USER, {
    text: `never ${category}`,
    target: categoryTarget(category),
    verb: "any",
    condition: { kind: "none" },
    requirement: "never",
    confidence: "high",
  });
}

/* ------------------------------------------------ the model covers the engine */

describe("every capability someone can be asked about", () => {
  it("covers every category the engine dispatches on — nothing is hidden", () => {
    expect(uncoveredCategories()).toEqual([]);
  });

  it("never claims a category twice, so one switch never fights another", () => {
    const all = CAPABILITIES.flatMap((c) => c.categories);
    expect(new Set(all).size).toBe(all.length);
  });

  it("marks a capability pinned only when the engine really pins it", () => {
    for (const cap of CAPABILITIES) {
      if (cap.locked) continue; // locked rows aren't a setting at all
      const enginePins = cap.categories.some((c) => CATEGORIES[c].pinned);
      expect(cap.pinned).toBe(enginePins);
    }
  });

  it("a locked row maps to nothing — a category behind it would make the lock a lie", () => {
    for (const cap of CAPABILITIES.filter((c) => c.locked)) {
      expect(cap.categories).toEqual([]);
      expect(optionsFor(cap)).toEqual([cap.locked]);
    }
  });

  it("security is locked to never — cosigno has no way to touch security at all", () => {
    const security = CAPABILITIES.find((c) => c.id === "security")!;
    expect(security.locked).toBe("never");
    expect(settingFor(security, {}, new Set())).toBe("never");
  });

  it("says one sentence, in words nobody needs the docs for", () => {
    for (const cap of CAPABILITIES) {
      expect(cap.detail.length).toBeLessThan(120);
      // The engine's own vocabulary must not leak into the question.
      expect(cap.detail).not.toMatch(/tier|category|connection_call|update_record/i);
    }
  });
});

/* ------------------------------------------------------ reading is never rosy */

describe("what a row reports", () => {
  const forbidden = new Set<string>();
  const cap = CAPABILITIES.find((c) => c.id === "edit")!;

  it("reports the STRICTEST of its categories, never the friendliest", () => {
    // "change" spans update_record and connection_call. One still needing
    // approval means the capability needs approval — anything else would tell
    // someone they are less protected than they are.
    const tiers: Record<string, Tier> = { update_record: 1, connection_call: 2 };
    expect(settingFor(cap, tiers, forbidden)).toBe("ask");
    expect(settingFor(cap, { update_record: 1, connection_call: 1 }, forbidden)).toBe("always");
  });

  it("falls back to the engine default rather than assuming automatic", () => {
    expect(settingFor(cap, {}, forbidden)).toBe("ask");
  });

  it("reports never when any one of its categories is forbidden", () => {
    expect(settingFor(cap, { update_record: 1, connection_call: 1 }, new Set(["connection_call"]))).toBe("never");
  });

  it("reports ask for money and deletion whatever the tiers say", () => {
    for (const id of ["money", "delete"]) {
      const c = CAPABILITIES.find((x) => x.id === id)!;
      const allOnes = Object.fromEntries(c.categories.map((k) => [k, 1 as Tier]));
      expect(settingFor(c, allOnes, forbidden)).toBe("ask");
    }
  });
});

/* ------------------------------------------- a control never writes a cheque */

describe("what a row can be set to", () => {
  it("never offers to make a pinned capability automatic", () => {
    for (const cap of CAPABILITIES.filter((c) => c.pinned)) {
      expect(tierForSetting(cap, "always")).toBeNull();
    }
  });

  it("maps the two ordinary answers onto the two tiers a user may set", () => {
    const cap = CAPABILITIES.find((c) => c.id === "send")!;
    expect(tierForSetting(cap, "always")).toBe(1);
    expect(tierForSetting(cap, "ask")).toBe(2);
    expect(tierForSetting(cap, "never")).toBeNull();
  });

  it("explains all three answers in a sentence, with no jargon", () => {
    for (const s of ["always", "ask", "never"] as TrustSetting[]) {
      expect(explain(s)).toMatch(/^Cosigno/);
      expect(explain(s)).not.toMatch(/tier/i);
    }
  });
});

/* ------------------------------------------------------------------ presets */

describe("the three starting points", () => {
  it("are genuinely different — otherwise one of them is a lie", () => {
    const shapes = PRESETS.map((p) => JSON.stringify(p.settings));
    expect(new Set(shapes).size).toBe(PRESETS.length);
  });

  it("cover every settable capability, so picking one leaves nothing undecided", () => {
    for (const p of PRESETS) {
      for (const cap of CAPABILITIES) {
        if (cap.locked) {
          // A preset must not claim to set what isn't a setting.
          expect(p.settings[cap.id]).toBeUndefined();
        } else {
          expect(p.settings[cap.id]).toBeDefined();
        }
      }
    }
  });

  it("never promise automatic money or automatic deletion", () => {
    for (const p of PRESETS) {
      expect(p.settings.money).not.toBe("always");
      expect(p.settings.delete).not.toBe("always");
    }
  });

  it("recognises itself, and admits when settings are custom", () => {
    for (const p of PRESETS) expect(activePreset(p.settings)).toBe(p.id);
    expect(activePreset({ ...PRESETS[0].settings, send: "never" })).toBeNull();
  });

  it("recommends exactly one", () => {
    expect(PRESETS.filter((p) => p.recommended)).toHaveLength(1);
  });
});

/* ---------------------------------------------------- "never" actually means it */

describe("never is enforced, not displayed", () => {
  it("refuses the action before the card exists", async () => {
    await forbid("send_email");
    await expect(
      proposeAction({
        session_id: "s1",
        user_id: USER,
        category: "send_email",
        tier: 2,
        summary: "email the supplier",
        payload: {},
        injection_flag: false,
        tier_note: null,
      })
    ).rejects.toBeInstanceOf(EngineError);
    // Nothing was written — no card sits in the approvals queue offering to do
    // the thing the user forbade.
    expect(await getStore().listActions(USER)).toHaveLength(0);
  });

  it("says which setting refused it, in the user's own words", async () => {
    await forbid("delete");
    await expect(
      proposeAction({
        session_id: "s1",
        user_id: USER,
        category: "delete",
        tier: 3,
        summary: "remove the old records",
        payload: {},
        injection_flag: false,
        tier_note: null,
      })
    ).rejects.toThrow(/never/i);
  });

  it("leaves every other category completely alone", async () => {
    await forbid("delete");
    const action = await proposeAction({
      session_id: "s1",
      user_id: USER,
      category: "search",
      tier: 1,
      summary: "look something up",
      payload: {},
      injection_flag: false,
      tier_note: null,
    });
    expect(action.category).toBe("search");
  });

  it("stops applying the moment the rule is disabled", async () => {
    await forbid("send_email");
    const store = getStore();
    const [rule] = await store.listPermissionRules(USER);
    await store.updatePermissionRule(USER, rule.id, { enabled: false });
    const action = await proposeAction({
      session_id: "s1",
      user_id: USER,
      category: "send_email",
      tier: 2,
      summary: "email the supplier",
      payload: {},
      injection_flag: false,
      tier_note: null,
    });
    expect(action.id).toBeTruthy();
  });
});

/* ------------------------------------------------- category rules stay exact */

function rule(partial: Partial<PermissionRuleRecord>): PermissionRuleRecord {
  return {
    id: "r1",
    user_id: USER,
    text: "never delete",
    target: categoryTarget("delete"),
    verb: "any",
    condition: { kind: "none" },
    requirement: "never",
    confidence: "high",
    enabled: true,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    ...partial,
  } as PermissionRuleRecord;
}

describe("a category rule names a category and nothing else", () => {
  it("round-trips the category it names", () => {
    expect(targetCategory(categoryTarget("delete"))).toBe("delete");
    expect(targetCategory("gmail")).toBeNull();
    expect(targetCategory("category:not_a_category")).toBeNull();
  });

  it("is never matched by the text matcher — one check, not two weaker ones", () => {
    const decision = applyRules([rule({})], {
      target: "github",
      category: "app",
      summary: "delete the branch",
    });
    expect(decision.requirement).toBeNull();
  });

  it("only counts as a block at the 'never' level", () => {
    expect(forbiddenRuleFor([rule({ requirement: "approve" })], "delete")).toBeNull();
    expect(forbiddenRuleFor([rule({ enabled: false })], "delete")).toBeNull();
    expect(forbiddenRuleFor([rule({})], "delete")).not.toBeNull();
  });

  it("collects every forbidden category", () => {
    const rules = [rule({}), rule({ id: "r2", target: categoryTarget("spend") })];
    expect(forbiddenCategories(rules)).toEqual(new Set(["delete", "spend"]));
  });

  it("reads as a sentence in the rules list, not as an internal token", () => {
    const described = describeRule({
      target: categoryTarget("send_email"),
      verb: "any",
      condition: { kind: "none" },
      requirement: "never",
      confidence: "high",
    });
    expect(described).toBe("send email — is never allowed.");
    expect(described).not.toContain("category:");
  });

  it("does not change how ordinary typed rules parse", () => {
    const parsed = parsePermissionRule("never post to slack");
    expect(parsed.requirement).toBe("never");
    expect(parsed.target).toBe("slack");
    expect(describeRule(parsed)).toContain("never allowed");
  });
});

/* ------------------------------------------------------------- the interface */

const PAGE = readFileSync("src/components/trust/TrustCenter.tsx", "utf8");
const ROUTE = readFileSync("src/app/api/trust/route.ts", "utf8");

/**
 * Comments are for whoever maintains this; the reader never sees them. The
 * jargon checks below run on the code, so that explaining WHY the page avoids
 * a word can't be mistaken for the page using it.
 */
const PAGE_CODE = PAGE.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

describe("the page asks the question in the reader's language", () => {
  it("never shows a tier number or a category id", () => {
    expect(PAGE_CODE).not.toMatch(/tier [123]/i);
    expect(PAGE_CODE).not.toMatch(/update_record|connection_call|post_content/);
  });

  it("renders only the answers the server says a row can be set to", () => {
    // The options come from the API row, so a control the page shows is always
    // one the server accepts — no greyed-out switches, no snap-backs.
    expect(PAGE).toMatch(/row\.options\.map/);
    expect(PAGE).not.toMatch(/const OPTIONS *=/);
  });

  it("labels all three answers in plain words", () => {
    expect(PAGE).toMatch(/always: "Always"/);
    expect(PAGE).toMatch(/ask: "Ask me"/);
    expect(PAGE).toMatch(/never: "Never"/);
  });

  it("reads the protection level back in three lists, before any control", () => {
    expect(PAGE).toMatch(/title: "On its own"/);
    expect(PAGE).toMatch(/title: "Asks you first"/);
    expect(PAGE).toMatch(/title: "Never"/);
  });

  it("keeps advanced capabilities reachable, behind a disclosure — never removed", () => {
    expect(PAGE).toMatch(/Advanced controls/);
    expect(PAGE).toMatch(/MCP servers and custom APIs/);
    expect(PAGE).toMatch(/Standing rules/);
  });

  it("shows what the server actually saved, never an optimistic guess", () => {
    expect(PAGE).toMatch(/setRows\(body\.capabilities\)/);
    // No local mutation of a row's setting — the server's answer is the only
    // source for what's on screen.
    expect(PAGE_CODE).not.toMatch(/setRows\(\(/);
  });

  it("stops to explain before a change makes cosigno freer, and never before one that makes it safer", () => {
    expect(PAGE).toMatch(/const loosening =/);
    expect(PAGE).toMatch(/row\.setting === "never" && setting !== "never"/);
    expect(PAGE).toMatch(/row\.setting === "ask" && setting === "always"/);
  });
});

describe("the endpoint holds the line the page draws", () => {
  it("rate-limits writes", () => {
    expect(ROUTE).toMatch(/enforceLimit\("transitionMinute", userId\)/);
  });

  it("refuses to make a pinned capability automatic even when asked directly", () => {
    expect(ROUTE).toMatch(/setting === "always" && cap\.pinned/);
    expect(ROUTE).toMatch(/tier_locked/);
  });

  it("removes blocks before relaxing tiers, so a half-failure errs strict", () => {
    const dropAt = ROUTE.indexOf("deletePermissionRule");
    const setAt = ROUTE.indexOf("setTierSetting");
    expect(dropAt).toBeGreaterThan(-1);
    expect(setAt).toBeGreaterThan(dropAt);
  });

  it("records every change in the audit trail", () => {
    expect(ROUTE).toMatch(/logAudit\(userId, "trust_changed"/);
  });

  it("stores nothing of its own — it writes what the engine already reads", () => {
    expect(ROUTE).toMatch(/setTierSetting/);
    expect(ROUTE).toMatch(/createPermissionRule/);
    expect(ROUTE).not.toMatch(/trust_settings|createTrust/);
  });
});
