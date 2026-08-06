import { describe, expect, it } from "vitest";
import { parsePermissionRule } from "../src/lib/rules";
import {
  coverageFor,
  providersWithoutConnector,
  PROVIDER_ACTION_OPERATION,
  PROVIDER_REGISTRY_KEY,
} from "../src/lib/ruleIntents";
import { listProviders } from "../src/lib/integrations/registry";
import { GALLERY_RULES } from "../src/components/app/galleryRules";

/**
 * Honesty about coverage.
 *
 * A stored rule looks like protection whether or not anything can trigger it.
 * The most expensive mistake this product could make is letting someone
 * believe they are covered when they are not — so "can this rule actually
 * fire" is computed, not assumed, and these tests pin the answer.
 */

describe("coverageFor — what a rule can actually govern today", () => {
  it("a rule about a system with no connector is reported unreachable", () => {
    // Dropbox is nameable in a rule and has no connector.
    const parsed = parsePermissionRule("Always ask before deleting a file in Dropbox");
    const coverage = coverageFor(parsed.target, parsed.verb);
    expect(coverage.unreachable).toBe(true);
    expect(coverage.noConnector.map((p) => p.provider)).toContain("dropbox");
    expect(coverage.covered).toHaveLength(0);
  });

  it("a rule for an operation a supported provider cannot perform is unreachable, and says which", () => {
    // GitHub is fully supported but exposes no delete capability.
    const parsed = parsePermissionRule("Never delete a GitHub repository");
    const coverage = coverageFor(parsed.target, parsed.verb);
    expect(coverage.unreachable).toBe(true);
    expect(coverage.noSuchCapability.map((p) => p.provider)).toEqual(["github"]);
    // It is NOT reported as a missing connector — the connector exists.
    expect(coverage.noConnector).toHaveLength(0);
  });

  it("a rule that a real capability can trigger is not reported unreachable", () => {
    const parsed = parsePermissionRule("Always ask before sending an email");
    const coverage = coverageFor(parsed.target, parsed.verb);
    expect(coverage.unreachable).toBe(false);
    expect(coverage.covered.map((p) => p.provider).sort()).toEqual(["gmail", "outlook"]);
  });

  it("partial coverage names the gap as well as the cover", () => {
    // Refunds: cosigno's own refund category exists, Stripe's connector does not.
    const parsed = parsePermissionRule("Always ask before refunding a payment");
    const coverage = coverageFor(parsed.target, parsed.verb);
    expect(coverage.unreachable).toBe(false);
    expect(coverage.viaOwnWork).toBe(true);
    expect(coverage.noConnector.map((p) => p.provider)).toContain("stripe");
  });

  /**
   * Every rule the product offers must protect something the moment it is
   * turned on. Offering one that cannot is the exact false confidence this
   * whole pass exists to remove.
   */
  it("no gallery rule is ever unreachable", () => {
    for (const text of GALLERY_RULES) {
      const parsed = parsePermissionRule(text);
      const coverage = coverageFor(parsed.target, parsed.verb);
      expect(coverage.unreachable, `"${text}" would protect nothing when turned on`).toBe(false);
    }
  });
});

describe("the unavailable list stays truthful on its own", () => {
  it("lists exactly the nameable systems with no registered connector", () => {
    const missing = providersWithoutConnector().map((p) => p.provider).sort();
    expect(missing).toEqual(["dropbox", "stripe"]);
  });

  it("every provider it claims IS supported has a live connector behind it", () => {
    const registered = new Set(listProviders().map((p) => p.key));
    for (const [provider, key] of Object.entries(PROVIDER_REGISTRY_KEY)) {
      expect(registered.has(key!), `${provider} maps to "${key}", which is not registered`).toBe(true);
      expect(
        Object.keys(PROVIDER_ACTION_OPERATION[key!] ?? {}).length,
        `${provider} claims support but has no mapped capabilities`
      ).toBeGreaterThan(0);
    }
  });

  it("nothing is silently omitted — every nameable provider is either supported or listed", () => {
    const supported = new Set(Object.keys(PROVIDER_REGISTRY_KEY));
    const unavailable = new Set(providersWithoutConnector().map((p) => p.provider));
    // "custom" and "internal" are not third-party systems a person connects.
    const nameable = [
      "gmail",
      "outlook",
      "slack",
      "notion",
      "github",
      "google-drive",
      "google-calendar",
      "dropbox",
      "stripe",
    ] as const;
    for (const provider of nameable) {
      expect(
        supported.has(provider) || unavailable.has(provider),
        `${provider} appears in neither the supported nor the unavailable list`
      ).toBe(true);
    }
  });
});
