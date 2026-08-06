import { beforeEach, describe, expect, it } from "vitest";
import {
  applyRequirementToTier,
  applyRules,
  describeRule,
  parsePermissionRule,
} from "../src/lib/rules";
import { proposeConnectorAction } from "../src/lib/integrations/runtime/propose";
import { getStore } from "../src/lib/store";
import { MemoryStore } from "../src/lib/store/memory";
import type { CustomApiConfig } from "../src/lib/integrations/types";
import type { PermissionRuleRecord } from "../src/lib/types";

const USER = "demo-user";

function freshStore(): MemoryStore {
  const store = new MemoryStore();
  (globalThis as unknown as { __cosignoStore?: unknown }).__cosignoStore = store;
  return store;
}
beforeEach(() => {
  freshStore();
});

/* ------------------------------------------------------ deterministic parse */

describe("parsePermissionRule (plain language → structured, deterministic)", () => {
  it("'never refund more than $200 without my signature'", () => {
    const r = parsePermissionRule("Never refund more than $200 without my signature.");
    expect(r.requirement).toBe("sign");
    expect(r.target).toBe("payment");
    expect(r.verb).toBe("refund");
    expect(r.condition).toEqual({ kind: "amount", op: ">", value: 200 });
    expect(r.confidence).toBe("high");
  });

  it("'draft Slack messages but never post in #announcements without approval'", () => {
    const r = parsePermissionRule(
      "Cosigno can draft Slack messages but never post in #announcements without approval."
    );
    expect(r.requirement).toBe("approve");
    expect(r.target).toBe("slack");
    expect(r.verb).toBe("post");
    expect(r.condition).toEqual({ kind: "channel", match: "#announcements" });
  });

  it("'internal calendar events can be moved automatically'", () => {
    const r = parsePermissionRule("Internal calendar events can be moved automatically.");
    expect(r.requirement).toBe("auto");
    expect(r.target).toBe("calendar");
    expect(r.verb).toBe("move");
  });

  it("'any payment-related action requires my signature'", () => {
    const r = parsePermissionRule("Any payment-related action requires my signature.");
    expect(r.requirement).toBe("sign");
    expect(r.target).toBe("payment");
  });

  it("'cannot close pull requests' forbids", () => {
    const r = parsePermissionRule("Cosigno can archive GitHub issues but cannot close pull requests.");
    expect(r.requirement).toBe("never");
    expect(r.target).toBe("github");
  });

  it("defaults to approval and flags low confidence when nothing is clear", () => {
    const r = parsePermissionRule("do the thing please");
    expect(r.requirement).toBe("approve");
    expect(r.confidence).toBe("low");
  });

  // Regression: the amount must anchor to "$"/dollars/modifier, not a stray id.
  it("captures the DOLLAR amount, not a leading invoice/order number", () => {
    const r = parsePermissionRule("Invoice 90210: block payments over $500.");
    expect(r.requirement).toBe("never");
    expect(r.condition).toEqual({ kind: "amount", op: ">", value: 500 });
  });

  // Regression: prohibition synonyms must forbid, not silently downgrade to approve.
  it.each([
    "Refunds are prohibited.",
    "Wire transfers are banned.",
    "Disallow deploys to prod.",
  ])("treats '%s' as a hard block", (text) => {
    expect(parsePermissionRule(text).requirement).toBe("never");
  });

  // Regression: "up to $X" is inclusive.
  it("'up to $500' is an inclusive (<=) threshold", () => {
    const r = parsePermissionRule("Refunds up to $500 require my approval.");
    expect(r.condition).toEqual({ kind: "amount", op: "<=", value: 500 });
  });

  it("renders a readable description", () => {
    const r = parsePermissionRule("never delete anything");
    expect(describeRule(r).toLowerCase()).toContain("never allowed");
  });
});

/* -------------------------------------------------- fold requirement → tier */

describe("applyRequirementToTier (only ever tightens)", () => {
  it("'never' blocks", () => {
    expect(applyRequirementToTier(1, "never")).toEqual({ tier: 1, blocked: true });
  });
  it("approve/sign raise to at least tier 2", () => {
    expect(applyRequirementToTier(1, "approve")).toEqual({ tier: 2, blocked: false });
    expect(applyRequirementToTier(1, "sign")).toEqual({ tier: 2, blocked: false });
  });
  it("never LOWERS a boundary — 'auto' leaves a tier-3 floor at 3", () => {
    expect(applyRequirementToTier(3, "auto")).toEqual({ tier: 3, blocked: false });
    expect(applyRequirementToTier(2, "auto")).toEqual({ tier: 2, blocked: false });
    // approve on a tier-3 action does not drop it to 2.
    expect(applyRequirementToTier(3, "approve")).toEqual({ tier: 3, blocked: false });
  });
});

/* --------------------------------------------------------- rule resolution */

function rule(text: string): PermissionRuleRecord {
  const parsed = parsePermissionRule(text);
  return {
    id: text,
    user_id: USER,
    text,
    enabled: true,
    created_at: "",
    updated_at: "",
    ...parsed,
  };
}

describe("applyRules (most restrictive matching rule wins)", () => {
  it("matches a payment rule against a refund action by synonym", () => {
    const rules = [rule("never refund more than $200 without my signature")];
    const d = applyRules(rules, { target: "custom", summary: "Acme: issue refund", amount: 250 });
    expect(d.requirement).toBe("sign");
  });

  it("does not fire the amount rule below the threshold", () => {
    const rules = [rule("never refund more than $200 without my signature")];
    const d = applyRules(rules, { target: "custom", summary: "Acme: issue refund", amount: 50 });
    expect(d.requirement).toBeNull();
  });

  it("disabled rules never fire", () => {
    const r = rule("never delete anything");
    r.enabled = false;
    const d = applyRules([r], { target: "custom", summary: "delete record" });
    expect(d.requirement).toBeNull();
  });

  it("picks the strictest when several match", () => {
    const rules = [rule("any action requires approval"), rule("never delete anything")];
    const d = applyRules(rules, { target: "custom", summary: "delete the record" });
    expect(d.requirement).toBe("never");
  });

  // Regression: rule verbs collapse synonyms; matching must expand them back so
  // a rule fires on a synonym-worded action summary.
  it("matches a 'delete' rule against a 'Remove contact' action (synonym)", () => {
    const d = applyRules([rule("never delete anything")], { target: "custom", summary: "HubSpot: Remove contact" });
    expect(d.requirement).toBe("never");
  });

  it("matches a 'wire money' rule against a 'Create transfer' action (synonym)", () => {
    const d = applyRules([rule("never wire money")], { target: "custom", summary: "Acme: Create transfer" });
    expect(d.requirement).toBe("never");
  });

  /* Regression: synonyms matched as bare substrings, so a rule about SENDING
     email fired on reading it — "promotional senders" contains "send". A rule
     that stops the wrong actions is worse than no rule, because the person
     stops believing the ones that are right. */
  it("does not fire a 'send email' rule on an action that only reads mail", () => {
    const d = applyRules([rule("always ask before sending email")], {
      target: "search",
      category: "search",
      summary: "scan your inbox for newsletter and promotional senders from the last 30 days.",
    });
    expect(d.requirement).toBeNull();
  });

  it("still fires that rule on an action that actually sends mail", () => {
    const d = applyRules([rule("always ask before sending email")], {
      target: "send_email",
      category: "send_email",
      summary: "send the email about the proposal to the recipient named in your command.",
    });
    expect(d.requirement).toBe("approve");
  });

  it("keeps ordinary inflections matching (delete → deleting/deleted)", () => {
    for (const summary of ["deleting the stale records", "deleted the old branch", "delete it"]) {
      expect(applyRules([rule("never delete anything")], { target: "custom", summary }).requirement).toBe(
        "never"
      );
    }
  });

  it("does not let an unrelated word that merely starts the same match", () => {
    // "postpone" is not "post"; "payload" is not "pay".
    expect(
      applyRules([rule("always ask before posting to slack")], {
        target: "slack",
        summary: "postpone the slack reminder",
      }).requirement
    ).toBeNull();
  });

  // Regression: a non-numeric string arg must NOT read as 0 and satisfy "under $X".
  it("does not fire an 'under $100' rule when the amount is non-numeric/unknown", () => {
    const d = applyRules([rule("approve any payment under $100")], {
      target: "custom",
      summary: "Acme: charge customer",
      // amount omitted (as argAmount would yield for a non-numeric value)
    });
    expect(d.requirement).toBeNull();
  });
});

/* ----------------------------------- enforcement at the connector Boundary */

async function customConnection(actions: CustomApiConfig["actions"]) {
  const store = getStore();
  const cfg: CustomApiConfig = { base_url: "https://api.acme.com", auth: { placement: "bearer" }, actions };
  return store.createConnection({
    user_id: USER,
    provider_key: "custom",
    kind: "custom",
    display_name: "Acme",
    auth_type: "apikey",
    encrypted_credentials: "x",
    scopes: null,
    status: "connected",
    metadata: cfg as unknown as Record<string, unknown>,
  });
}

describe("proposeConnectorAction enforces rules (tighten-only, never bypass)", () => {
  it("a 'never' rule BLOCKS a matching proposal", async () => {
    const store = getStore();
    const conn = await customConnection([
      { id: "delete_thing", summary: "delete a thing", method: "DELETE", path: "/things/{id}", risk: "destructive" },
    ]);
    const parsed = parsePermissionRule("never delete anything");
    await store.createPermissionRule(USER, { text: "never delete anything", ...parsed });
    const session = await store.createSession(USER, "t");

    const res = await proposeConnectorAction(USER, session.id, {
      connectionId: conn.id,
      capability: "delete_thing",
    });
    expect(res.ok).toBe(false);
    expect(res.error?.toLowerCase()).toContain("permission rule");
  });

  it("a rule RAISES a tier-1 read from auto-execute to waiting", async () => {
    const store = getStore();
    const conn = await customConnection([
      { id: "list_customers", summary: "list customers", method: "GET", path: "/customers", risk: "read" },
    ]);
    const parsed = parsePermissionRule("any action requires approval");
    await store.createPermissionRule(USER, { text: "any action requires approval", ...parsed });
    const session = await store.createSession(USER, "t");

    const res = await proposeConnectorAction(USER, session.id, {
      connectionId: conn.id,
      capability: "list_customers",
    });
    expect(res.ok).toBe(true);
    expect(res.action?.tier).toBe(2);
    // tier-2 waits for approval — it must NOT have auto-executed.
    expect(res.action?.status).toBe("proposed");
    expect(res.action?.tier_note ?? "").toContain("permission rule");
  });

  it("with NO rules, a tier-1 read still auto-executes (behavior unchanged)", async () => {
    const store = getStore();
    const conn = await customConnection([
      { id: "list_customers", summary: "list customers", method: "GET", path: "/customers", risk: "read" },
    ]);
    const session = await store.createSession(USER, "t");
    const res = await proposeConnectorAction(USER, session.id, {
      connectionId: conn.id,
      capability: "list_customers",
    });
    expect(res.ok).toBe(true);
    expect(res.action?.tier).toBe(1);
    // Unchanged behavior: a tier-1 read AUTO-RUNS (executed, or failed offline
    // with no real API) — the point is it never STOPS to wait at the boundary.
    expect(res.action?.status).not.toBe("proposed");
  });
});
