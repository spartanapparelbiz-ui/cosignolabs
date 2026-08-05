import { describe, expect, it } from "vitest";
import {
  actionLimitLabel,
  getPlan,
  INTRO_FIRST_MONTH_PRICE,
  introOfferLabel,
  PLANS,
  priceLabel,
} from "../src/lib/plans";
import { usageLimitMessage } from "../src/lib/enforcement";

/**
 * Pricing must have ONE source of truth (plans.ts). These lock the canonical
 * values and prove the derived copy helpers stay in sync, so a change to a plan
 * updates every surface at once instead of leaving conflicting numbers behind.
 */

describe("canonical plan values (plans.ts is the single source)", () => {
  it("the launch plans hold their expected quotas + prices", () => {
    expect(PLANS.free.actionLimit).toBe(25);
    expect(PLANS.pro.actionLimit).toBe(1000);
    expect(PLANS.max.actionLimit).toBe(10000);
    expect(PLANS.free.price.monthly).toBe(0);
    expect(PLANS.pro.price.monthly).toBe(44.4);
    expect(PLANS.max.price.monthly).toBe(111);
  });

  it("annual is exactly two months free (10× monthly) for paid plans", () => {
    expect(PLANS.pro.price.annual).toBe(PLANS.pro.price.monthly * 10);
    expect(PLANS.max.price.annual).toBe(PLANS.max.price.monthly * 10);
  });

  it("getPlan fails closed to free on unknown/missing ids", () => {
    expect(getPlan(undefined).id).toBe("free");
    expect(getPlan("nonsense").id).toBe("free");
    expect(getPlan("pro").id).toBe("pro");
  });
});

describe("derived labels come straight from the plan (no drift)", () => {
  it("actionLimitLabel formats the real actionLimit", () => {
    expect(actionLimitLabel(PLANS.pro)).toBe("1,000 AI operations / month");
    expect(actionLimitLabel(PLANS.max)).toBe("10,000 AI operations / month");
    expect(actionLimitLabel(PLANS.free)).toBe("25 AI operations / month");
  });

  it("priceLabel matches the plan price", () => {
    expect(priceLabel(PLANS.pro, "monthly")).toBe("$44.40/mo");
    expect(priceLabel(PLANS.pro, "annual")).toBe("$444/yr");
    expect(priceLabel(PLANS.free, "monthly")).toBe("$0");
  });

  it("pro's quota feature bullet equals the derived label", () => {
    // The bullet shown on pricing/account is the same string the helper derives.
    expect(PLANS.pro.features).toContain(actionLimitLabel(PLANS.pro));
    expect(PLANS.free.features).toContain(actionLimitLabel(PLANS.free));
    expect(PLANS.max.features).toContain(actionLimitLabel(PLANS.max));
  });
});

describe("one intro offer, stated consistently", () => {
  it("introOfferLabel is derived from the pro price + the intro constant", () => {
    expect(INTRO_FIRST_MONTH_PRICE).toBe(9);
    expect(introOfferLabel()).toBe(`first month $9, then ${priceLabel(PLANS.pro, "monthly")}`);
    expect(introOfferLabel()).toContain("$9");
    expect(introOfferLabel()).toContain("$44.40/mo");
  });
});

describe("usage-limit copy is derived, not hardcoded", () => {
  it("free message uses the real free + pro numbers", () => {
    const msg = usageLimitMessage("free");
    expect(msg).toContain(String(PLANS.free.actionLimit)); // 25
    expect(msg).toContain(priceLabel(PLANS.pro, "monthly")); // $29/mo
    expect(msg).toContain(PLANS.pro.actionLimit.toLocaleString()); // 1,000
    expect(msg).toContain("this month"); // monthly reset, not "this week"
  });

  it("pro message references the max ceiling", () => {
    const msg = usageLimitMessage("pro");
    expect(msg).toContain(PLANS.pro.actionLimit.toLocaleString());
    expect(msg).toContain(PLANS.max.actionLimit.toLocaleString());
  });
});
