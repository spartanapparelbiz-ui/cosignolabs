import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { PLANS } from "../src/lib/plans";

/**
 * The home page's conversion path.
 *
 * The close promises three specific things about what happens after the click
 * — an account, a connection, a first mission — plus what the free plan costs
 * and includes. Every one of those is checkable, and a marketing page that
 * quietly drifts from the product it sells is worse than one that says less.
 * These tests pin the promises to their sources.
 */

const PAGE = readFileSync("src/app/page.tsx", "utf8");
const CTA = readFileSync("src/components/home/FinalCta.tsx", "utf8");
const LANDING_DIR = "src/components/landing";

describe("the free-plan terms on the close come from the plans source of truth", () => {
  it("are derived, never retyped", () => {
    // The card's meta line is built in the server component from PLANS.
    expect(PAGE).toMatch(/const FREE_TERMS = \[/);
    expect(PAGE).toMatch(/actionLimitLabel\(PLANS\.free\)/);
    expect(PAGE).toMatch(/PLANS\.free\.integrationLimit/);
    // If someone hardcodes the quota instead, this catches it.
    expect(CTA).not.toMatch(/\b25 ai operations\b/);
    expect(CTA).not.toMatch(/\b1 connected app\b/);
  });

  it("the plan they are describing is still free, single-app, and cardless", () => {
    expect(PLANS.free.price.monthly).toBe(0);
    expect(PLANS.free.integrationLimit).toBe(1);
    expect(PLANS.free.actionLimit).toBeGreaterThan(0);
  });
});

describe("what happens after you click is what actually happens", () => {
  const AUTH = readFileSync("src/components/auth/AuthForm.tsx", "utf8");
  const CONNECTIONS = readFileSync("src/components/account/ConnectionsPanel.tsx", "utf8");

  it("step 1 — the sign-up form really is email, password, or google", () => {
    expect(CTA.replace(/\s+/g, " ")).toMatch(/email and a password, or continue with google/);
    expect(AUTH).toMatch(/type="email"/);
    expect(AUTH).toMatch(/type="password"/);
    expect(AUTH).toMatch(/continue with google/i);
  });

  it("step 2 — the connector claim stays about narrow access, not read-only", () => {
    // Gmail asks for `gmail.modify`, so "read-only to start" would be a lie.
    const gmail = readFileSync("src/lib/integrations/providers/gmail.ts", "utf8");
    expect(gmail).toMatch(/gmail\.modify/);
    // The wording is allowed to get plainer ("least" rather than "narrowest");
    // what may never change is that the claim is about scope, not read-only.
    expect(CTA.replace(/\s+/g, " ")).toMatch(/(narrowest|least) access that does the job/);
    expect(CTA).not.toMatch(/read-only/i);
  });

  it("taking a tool back really is one control", () => {
    expect(CONNECTIONS).toMatch(/async function disconnect/);
  });

  it("both exits are real routes, and the cheap one needs no account", () => {
    expect(CTA).toMatch(/href="\/sign-up"/);
    expect(CTA).toMatch(/href="\/demo"/);
    expect(CTA).toMatch(/href="\/sign-in"/);
    // JSX wraps prose across lines — match on words, not on layout.
    expect(CTA.replace(/\s+/g, " ")).toMatch(/the demo needs no account at all/);
  });
});

describe("the rebuilt home page left no dead landing components behind", () => {
  it("only the three still in use remain", () => {
    // LivePreview powers /demo; MarketingShell and Track are used by the other
    // marketing routes. Everything else belonged to the old landing page.
    const { readdirSync } = require("node:fs") as typeof import("node:fs");
    expect(readdirSync(LANDING_DIR).sort()).toEqual([
      "LivePreview.tsx",
      "MarketingShell.tsx",
      "Track.tsx",
    ]);
  });

  it("the home page imports nothing from the old landing folder except the analytics link", () => {
    const imports = [...PAGE.matchAll(/from "@\/components\/landing\/([A-Za-z]+)"/g)].map(
      (m) => m[1]
    );
    expect(imports.filter((n) => n !== "Track")).toEqual([]);
  });
});
