import { readFileSync } from "node:fs";
import { join } from "node:path";
import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it } from "vitest";
import { resetRateLimitsForTests } from "../../src/lib/ratelimit";

/**
 * §7 (polish pass) — the landing-page sandbox: public, stateless, and
 * physically unable to spend money or touch data. The route imports only
 * the pure mock planner; cards live in the visitor's browser.
 */

function previewReq(command: string, ip = "203.0.113.20"): NextRequest {
  return new NextRequest("http://localhost/api/preview", {
    method: "POST",
    body: JSON.stringify({ command }),
    headers: { "Content-Type": "application/json", "x-forwarded-for": ip },
  });
}

beforeEach(() => {
  resetRateLimitsForTests();
});

describe("sandbox isolation", () => {
  it("the route module has no import path to the store, Anthropic, or the operator", () => {
    const source = readFileSync(
      join(process.cwd(), "src", "app", "api", "preview", "route.ts"),
      "utf8"
    );
    expect(source).not.toMatch(/@\/lib\/store/);
    expect(source).not.toMatch(/@anthropic-ai/);
    expect(source).not.toMatch(/agent\/operator/);
    expect(source).not.toMatch(/agent\/pipeline/);
    // The pure planner module itself must stay pure.
    const planner = readFileSync(
      join(process.cwd(), "src", "lib", "agent", "mockPlanner.ts"),
      "utf8"
    );
    expect(planner).not.toMatch(/@anthropic-ai|\.\.\/store|systemPrompt/);
  });

  it("returns simulated cards without auth, tiers resolved server-side", async () => {
    const { POST } = await import("../../src/app/api/preview/route");
    const res = await POST(previewReq("clear my inbox of newsletters"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.cards.length).toBeGreaterThan(0);
    const write = body.cards.find((c: { category: string }) => c.category === "update_record");
    expect(write.tier).toBe(2);
  });

  it("a typed payment command is clamped to tier 3 even in the sandbox", async () => {
    const { POST } = await import("../../src/app/api/preview/route");
    const res = await POST(previewReq("pay the vendor invoice"));
    const body = await res.json();
    const payment = body.cards.find((c: { category: string }) => c.category === "payment");
    expect(payment.tier).toBe(3);
    expect(payment.tier_note).toMatch(/cannot self-escalate/i);
  });

  it('the "check my mail" preset produces injection-flagged cards', async () => {
    const { POST } = await import("../../src/app/api/preview/route");
    const res = await POST(previewReq("check my mail"));
    const body = await res.json();
    expect(body.cards.length).toBeGreaterThan(0);
    expect(body.cards.every((c: { injection_flag: boolean }) => c.injection_flag)).toBe(true);
  });

  it("an invoice command NEVER produces a substituted lead-reply scenario", async () => {
    // Spec acceptance #1: the demo must plan from the user's own words.
    const { POST } = await import("../../src/app/api/preview/route");
    const res = await POST(previewReq("follow up on the unpaid invoices"));
    const body = await res.json();
    expect(body.cards.length).toBeGreaterThan(0);
    const all = JSON.stringify(body.cards);
    expect(all).toContain("unpaid invoices"); // the user's actual subject
    expect(all).not.toMatch(/unanswered leads/); // never the canned scenario
  });

  it("a command outside the simulated domains gets an honest plan-only answer", async () => {
    const { POST } = await import("../../src/app/api/preview/route");
    const res = await POST(previewReq("negotiate my office lease renewal"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.unsupported).toBe(true);
    expect(body.cards).toHaveLength(0); // nothing pretends to execute
    expect(body.message).toMatch(/won't pretend/i);
    expect(body.planPreview.join(" ")).toMatch(/office lease renewal/);
    expect(body.planPreview.join(" ")).toMatch(/signature/);
  });

  it("commands over 200 chars are rejected", async () => {
    const { POST } = await import("../../src/app/api/preview/route");
    const res = await POST(previewReq("x".repeat(201)));
    expect(res.status).toBe(400);
  });

  it("21st request in a minute from one IP → 429; other IPs unaffected", async () => {
    const { POST } = await import("../../src/app/api/preview/route");
    for (let i = 0; i < 20; i++) {
      const res = await POST(previewReq(`command ${i}`));
      expect(res.status).toBe(200);
    }
    expect((await POST(previewReq("one more"))).status).toBe(429);
    expect((await POST(previewReq("hello", "198.51.100.30"))).status).toBe(200);
  });
});
