import { describe, expect, it } from "vitest";
import {
  customBoundary,
  effectiveBoundary,
  providerBoundary,
} from "../src/lib/integrations/boundaries";
import { parsePermissionRule } from "../src/lib/rules";
import type { CustomApiConfig, IntegrationProvider } from "../src/lib/integrations/types";
import type { PermissionRuleRecord } from "../src/lib/types";

function rule(text: string): PermissionRuleRecord {
  return { id: text, user_id: "u", text, enabled: true, created_at: "", updated_at: "", ...parsePermissionRule(text) };
}

const cfg: CustomApiConfig = {
  base_url: "https://api.acme.com",
  auth: { placement: "bearer" },
  actions: [
    { id: "list_customers", summary: "list customers", method: "GET", path: "/customers", risk: "read" },
    { id: "create_customer", summary: "create a customer", method: "POST", path: "/customers", risk: "write" },
    { id: "delete_customer", summary: "delete a customer", method: "DELETE", path: "/customers/{id}", risk: "destructive" },
  ],
};

describe("customBoundary (explicit data + action boundary, derived)", () => {
  it("maps each action to a tier and plain requirement", () => {
    const b = customBoundary(cfg);
    const byId = Object.fromEntries(b.actions.map((a) => [a.id, a]));
    expect(byId.list_customers.requirement).toBe("auto");
    expect(byId.create_customer.requirement).toBe("signature");
    expect(byId.delete_customer.requirement).toBe("typed confirmation");
    // Read-only endpoints are surfaced as what it "can access".
    expect(b.data.canAccess.some((s) => s.includes("/customers"))).toBe(true);
    expect(b.data.cannotAccess.length).toBeGreaterThan(0);
  });
});

describe("effectiveBoundary (folds rules — tighten only)", () => {
  it("a 'never' rule marks the matching action blocked", () => {
    const eff = effectiveBoundary(customBoundary(cfg), [rule("never delete anything")], "custom");
    const del = eff.actions.find((a) => a.id === "delete_customer");
    expect(del?.ruleEffect).toBe("blocked");
  });

  it("a broad approval rule raises a tier-1 read", () => {
    const eff = effectiveBoundary(customBoundary(cfg), [rule("any action requires approval")], "custom");
    const list = eff.actions.find((a) => a.id === "list_customers");
    expect(list?.tier).toBe(2);
    expect(list?.ruleEffect).toBe("raised to signature");
  });

  it("no rules → boundary unchanged", () => {
    const base = customBoundary(cfg);
    expect(effectiveBoundary(base, [], "custom")).toEqual(base);
  });
});

describe("providerBoundary (from a provider's declared scopes + actions)", () => {
  it("derives data access from scopeSummary and tiers from actions", () => {
    const fake: IntegrationProvider = {
      key: "demo",
      name: "Demo",
      detail: "a demo provider",
      authType: "oauth2",
      scopeSummary: "read + send email",
      isConfigured: () => true,
      healthCheck: async () => ({ ok: true }),
      listActions: () => [
        { id: "read_mail", summary: "read mail", mutates: false },
        { id: "send_mail", summary: "send mail", mutates: true },
      ],
      execute: async () => ({ ok: true, summary: "" }),
    };
    const b = providerBoundary(fake);
    expect(b.data.canAccess).toContain("read + send email");
    const byId = Object.fromEntries(b.actions.map((a) => [a.id, a]));
    expect(byId.read_mail.requirement).toBe("auto");
    expect(byId.send_mail.requirement).toBe("signature");
  });
});
