import { beforeEach, describe, expect, it } from "vitest";
import { applyRules, parsePermissionRule } from "../src/lib/rules";
import { effectiveBoundary, providerBoundary } from "../src/lib/integrations/boundaries";
import { getProvider, listProviders } from "../src/lib/integrations/registry";
import { PROVIDER_ACTION_OPERATION } from "../src/lib/ruleIntents";
import { MemoryStore } from "../src/lib/store/memory";
import { PREVIEW_EXAMPLES } from "../src/components/app/previewExamples";
import type { PermissionRuleRecord } from "../src/lib/types";

/**
 * The page promises one thing above all: what you were shown is what will
 * happen. That promise is only worth as much as the code behind it, so it is
 * checked here rather than asserted in a comment.
 *
 * There is exactly one implementation — `applyRules` — and every surface calls
 * it. These tests pin that: the preview's decision and the boundary the live
 * connector door computes agree on every action of every provider, for every
 * rule the product ships.
 */

const USER = "demo-user";

beforeEach(() => {
  const store = new MemoryStore();
  (globalThis as unknown as { __cosignoStore?: unknown }).__cosignoStore = store;
});

function asRecord(text: string): PermissionRuleRecord {
  return {
    id: text,
    user_id: USER,
    text,
    enabled: true,
    created_at: "",
    updated_at: "",
    ...parsePermissionRule(text),
  };
}

const PROVIDER_KEYS = Object.keys(PROVIDER_ACTION_OPERATION);

describe("preview equals reality", () => {
  /**
   * Guard the guards. Every check below loops over providers, so if the intent
   * table and the registry ever drifted apart, the loops would quietly cover
   * nothing and every assertion would "pass".
   */
  it("the intent table covers every registered provider, and vice versa", () => {
    const registered = listProviders().map((p) => p.key).sort();
    expect(PROVIDER_KEYS.sort()).toEqual(registered);
    for (const key of PROVIDER_KEYS) {
      const provider = getProvider(key);
      expect(provider, `${key} is in the intent table but not the registry`).toBeTruthy();
      const declared = provider!.listActions().map((a) => a.id).sort();
      const mapped = Object.keys(PROVIDER_ACTION_OPERATION[key]).sort();
      expect(mapped, `${key}: every capability must have a normalized operation`).toEqual(declared);
    }
  });

  /**
   * `effectiveBoundary` is what the connections screen renders and what the
   * door consults; `applyRules` is what the safety-rules preview calls. If the
   * two ever disagreed, a person would be shown one thing and get another.
   */
  it("the boundary shown for a connection matches the preview's decision, action by action", () => {
    for (const text of PREVIEW_EXAMPLES) {
      const rule = asRecord(text);
      for (const key of PROVIDER_KEYS) {
        const provider = getProvider(key);
        if (!provider) continue;

        const base = providerBoundary(provider);
        const effective = effectiveBoundary(base, [rule], key);

        for (const row of base.actions) {
          const previewed = applyRules([rule], { target: key, actionId: row.id, tier: row.tier });
          const shown = effective.actions.find((a) => a.id === row.id);

          const previewSaysBlocked = previewed.requirement === "never";
          const previewSaysRaised =
            previewed.requirement === "approve" || previewed.requirement === "sign";

          expect(
            shown?.ruleEffect === "blocked",
            `${text} on ${key}.${row.id}: boundary blocked=${shown?.ruleEffect === "blocked"}, preview blocked=${previewSaysBlocked}`
          ).toBe(previewSaysBlocked);

          if (previewSaysRaised && row.tier < 2) {
            expect(
              shown?.ruleEffect,
              `${text} on ${key}.${row.id}: preview raises it, boundary must show that`
            ).toBe("raised to signature");
          }
          if (previewed.requirement === null) {
            expect(
              shown?.ruleEffect,
              `${text} on ${key}.${row.id}: preview leaves it alone, boundary must too`
            ).toBeUndefined();
          }
        }
      }
    }
  });

  /**
   * A rule's decision must not depend on how the caller happened to describe
   * the action. The summary is carried for audit text only; changing it — or
   * dropping it entirely — cannot change what a rule does.
   */
  it("a decision is unchanged by the action's wording", () => {
    for (const text of PREVIEW_EXAMPLES) {
      const rule = asRecord(text);
      for (const [key, actions] of Object.entries(PROVIDER_ACTION_OPERATION)) {
        for (const actionId of Object.keys(actions)) {
          const base = applyRules([rule], { target: key, actionId });
          for (const summary of [
            undefined,
            "",
            "delete send post refund deploy publish archive everything",
            "read only, nothing happens, harmless",
          ]) {
            const withWords = applyRules([rule], { target: key, actionId, summary });
            expect(
              withWords.requirement,
              `"${text}" changed its mind about ${key}.${actionId} because of the summary "${summary}"`
            ).toBe(base.requirement);
          }
        }
      }
    }
  });

  /** The same inputs must always produce the same decision. */
  it("is deterministic across repeated evaluation", () => {
    for (const text of PREVIEW_EXAMPLES) {
      const rule = asRecord(text);
      for (const [key, actions] of Object.entries(PROVIDER_ACTION_OPERATION)) {
        for (const actionId of Object.keys(actions)) {
          const first = applyRules([rule], { target: key, actionId }).requirement;
          for (let i = 0; i < 3; i++) {
            expect(applyRules([rule], { target: key, actionId }).requirement).toBe(first);
          }
        }
      }
    }
  });
});
