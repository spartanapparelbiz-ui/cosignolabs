import { describe, expect, it } from "vitest";
import { applyRules, parsePermissionRule, readRule } from "../src/lib/rules";
import { PREVIEW_EXAMPLES } from "../src/components/app/previewExamples";
import { PROVIDER_ACTION_OPERATION } from "../src/lib/ruleIntents";
import type { PermissionRuleRecord } from "../src/lib/types";

/**
 * Every rule the product hands a person must be exact.
 *
 * An offered example is a promise: it is understood, and it does what it says.
 * A single ambiguous entry teaches someone that a rule is approximate, and
 * after that no rule of theirs is trusted either. So each one
 * is checked here — it parses to one named operation, and across every
 * capability of every built-in provider it fires on exactly the operations it
 * names and on nothing else.
 */

function asRecord(text: string): PermissionRuleRecord {
  return {
    id: text,
    user_id: "test",
    text,
    enabled: true,
    created_at: "",
    updated_at: "",
    ...parsePermissionRule(text),
  };
}

/** Every (provider, actionId, operation) the built-in connectors expose. */
const ALL_ACTIONS: { provider: string; actionId: string; operation: string }[] = Object.entries(
  PROVIDER_ACTION_OPERATION
).flatMap(([provider, actions]) =>
  Object.entries(actions).map(([actionId, operation]) => ({ provider, actionId, operation }))
);

/** Cosigno's own action categories — work it does without a connector. */
const PRODUCT_CATEGORIES = [
  "search",
  "summarize",
  "draft",
  "send_email",
  "post_content",
  "update_record",
  "spend",
  "webhook",
  "delete",
  "refund",
  "payment",
] as const;

describe("every rule the Preview page offers is unambiguous", () => {
  it("the example list is not empty (a silent regression would pass every other test)", () => {
    expect(ALL_ACTIONS.length).toBeGreaterThan(20);
    expect(PREVIEW_EXAMPLES.length).toBeGreaterThan(0);
  });

  for (const text of PREVIEW_EXAMPLES) {
    describe(`"${text}"`, () => {
      const parsed = parsePermissionRule(text);

      it("names exactly one operation — never 'every action'", () => {
        expect(parsed.verb, `${text} → verb`).not.toBe("any");
        expect(parsed.confidence).toBe("high");
      });

      it("names a scope, so it cannot reach across unrelated tools", () => {
        expect(parsed.target, `${text} → scope`).not.toBe("any");
      });

      it("states a requirement stricter than 'no change'", () => {
        expect(["approve", "sign", "never"]).toContain(parsed.requirement);
      });

      it("is deterministic — parsing it repeatedly gives the same rule", () => {
        for (let i = 0; i < 5; i++) {
          expect(parsePermissionRule(text)).toEqual(parsed);
        }
      });

      it("reads back to a person without exposing internals", () => {
        const reading = readRule(parsed);
        expect(reading.action).toBeTruthy();
        expect(reading.requirement).toBeTruthy();
        expect(reading.scope).toBeTruthy();
        expect(reading.broad).toBe(false);
        for (const jargon of ["any", "undefined", "null", "target", "verb"]) {
          expect(reading.action.toLowerCase()).not.toBe(jargon);
        }
      });

      it("fires on its own operation and never on another", () => {
        const rule = [asRecord(text)];
        for (const { provider, actionId, operation } of ALL_ACTIONS) {
          const fired = applyRules(rule, { target: provider, actionId }).requirement !== null;
          if (fired) {
            // Whenever it fires, it must be because the operations agree.
            expect(
              operation,
              `"${text}" fired on ${provider}.${actionId}, which is a ${operation}, not a ${parsed.verb}`
            ).toBe(parsed.verb);
          }
        }
      });

      /**
       * A rule that binds nothing is not safe, it is decorative — and offering
       * it teaches someone that turning rules on does not do anything. Every
       * example has to govern a capability that really exists, either a
       * connector action or one of cosigno's own action categories.
       */
      it("actually governs something the product can do", () => {
        const rule = [asRecord(text)];
        const viaConnector = ALL_ACTIONS.some(
          ({ provider, actionId }) => applyRules(rule, { target: provider, actionId }).requirement !== null
        );
        const viaOwnWork = PRODUCT_CATEGORIES.some(
          (category) => applyRules(rule, { category, amount: 10_000 }).requirement !== null
        );
        expect(
          viaConnector || viaOwnWork,
          `"${text}" matches no capability that exists — it would silently do nothing`
        ).toBe(true);
      });

      /**
       * The specific class of mistake this system exists to prevent: a rule
       * about doing something never applying to merely looking at it.
       */
      it("never fires on a read-only action", () => {
        if (parsed.verb === "read") return;
        const rule = [asRecord(text)];
        for (const { provider, actionId, operation } of ALL_ACTIONS) {
          if (operation !== "read") continue;
          expect(
            applyRules(rule, { target: provider, actionId }).requirement,
            `"${text}" must not fire on read-only ${provider}.${actionId}`
          ).toBeNull();
        }
      });
    });
  }
});
