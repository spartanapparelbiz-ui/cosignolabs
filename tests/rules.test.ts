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

describe("applyRules — matching is on normalized identity, never on words", () => {
  /**
   * Every case below states the action the way the system states it: which
   * provider, and which capability id. Nothing here passes a sentence for the
   * engine to interpret, because the engine no longer interprets sentences.
   */

  it("matches a refund rule against Stripe's refund action", () => {
    const rules = [rule("never refund more than $200 without my signature")];
    const d = applyRules(rules, { target: "stripe", category: "refund", amount: 250 });
    expect(d.requirement).toBe("sign");
  });

  it("does not fire the amount rule below the threshold", () => {
    const rules = [rule("never refund more than $200 without my signature")];
    const d = applyRules(rules, { target: "stripe", category: "refund", amount: 50 });
    expect(d.requirement).toBeNull();
  });

  it("disabled rules never fire", () => {
    const r = rule("never delete anything");
    r.enabled = false;
    expect(applyRules([r], { target: "google", actionId: "trash" }).requirement).toBeNull();
  });

  it("picks the strictest when several match", () => {
    const rules = [rule("any action requires approval"), rule("never delete anything")];
    const d = applyRules(rules, { target: "google", actionId: "trash" });
    expect(d.requirement).toBe("never");
  });

  /* -------------------------------------------------- zero false positives */

  /**
   * The rule this whole layer exists for. "Send email" must govern sending and
   * NOTHING else in the mailbox — not searching it, not reading a message, not
   * labelling one. Previously every one of these matched, because each summary
   * sentence happened to contain a word the rule also used.
   */
  it("a 'send email' rule governs sending only, across every mail operation", () => {
    const r = [rule("always ask before sending email")];
    const fires = (actionId: string) =>
      applyRules(r, { target: "google", actionId }).requirement !== null;

    expect(fires("send_message")).toBe(true);
    for (const readOnly of ["search_messages", "read_message", "create_draft", "archive", "label", "mark_read", "trash"]) {
      expect(fires(readOnly), `send-rule must not fire on ${readOnly}`).toBe(false);
    }
  });

  /**
   * This was written against GitHub, which exposes no delete capability — so
   * every assertion held whether or not operation matching worked at all. A
   * test that cannot fail is worse than no test in a suite whose whole job is
   * removing false assurance. Google Drive has both a delete and reads, so a
   * regression in either direction now fails here.
   */
  it("a 'delete' rule governs deleting only, not reading the same resource", () => {
    const r = [rule("never delete a file in google drive")];
    const fires = (actionId: string) =>
      applyRules(r, { target: "google-drive", actionId }).requirement !== null;

    // It fires on the delete — proving the rule is live, not inert.
    expect(fires("trash_file"), "delete-rule must fire on the delete").toBe(true);
    // …and on nothing else in the same app.
    for (const other of ["list_files", "create_text_file", "update_text_file"]) {
      expect(fires(other), `delete-rule must not fire on ${other}`).toBe(false);
    }
  });

  it("a rule scoped to one provider never reaches another", () => {
    const r = [rule("always ask before posting to slack")];
    expect(applyRules(r, { target: "slack", actionId: "post_message" }).requirement).toBe("approve");
    expect(applyRules(r, { target: "notion", actionId: "create_page" }).requirement).toBeNull();
    expect(applyRules(r, { target: "google", actionId: "send_message" }).requirement).toBeNull();
  });

  it("an email-family rule covers both mail providers and nothing else", () => {
    const r = [rule("always ask before sending email")];
    expect(applyRules(r, { target: "google", actionId: "send_message" }).requirement).toBe("approve");
    expect(applyRules(r, { target: "outlook", actionId: "send_message" }).requirement).toBe("approve");
    expect(applyRules(r, { target: "slack", actionId: "post_message" }).requirement).toBeNull();
  });

  it("does not fire an 'under $100' rule when the amount is unknown", () => {
    const d = applyRules([rule("approve any payment under $100")], {
      target: "stripe",
      category: "payment",
    });
    expect(d.requirement).toBeNull();
  });
});

/* ------------------------------------------- the adversarial audit matrix -- */

/**
 * Every operation of every built-in provider, against a rule for every
 * operation. A rule must fire on its own operation and on no other. This is
 * the property the safety-rules page promises, checked exhaustively rather
 * than sampled.
 */
describe("adversarial matrix: one rule fires on exactly one operation", () => {
  const PROVIDER_RULES: { provider: string; scopeWord: string; actions: Record<string, string> }[] = [
    {
      provider: "google",
      scopeWord: "gmail",
      actions: {
        search_messages: "read",
        read_message: "read",
        create_draft: "draft",
        send_message: "send",
        archive: "archive",
        label: "update",
        mark_read: "update",
        trash: "delete",
      },
    },
    {
      provider: "outlook",
      scopeWord: "outlook",
      actions: {
        search_messages: "read",
        read_message: "read",
        create_draft: "draft",
        send_message: "send",
        mark_read: "update",
        trash: "delete",
      },
    },
    {
      provider: "github",
      scopeWord: "github",
      actions: { whoami: "read", list_repos: "read", list_issues: "read", create_issue: "create" },
    },
    {
      provider: "slack",
      scopeWord: "slack",
      actions: { list_channels: "read", post_message: "post" },
    },
    {
      provider: "notion",
      scopeWord: "notion",
      actions: { search_pages: "read", create_page: "create", append_note: "update" },
    },
    {
      provider: "google-drive",
      scopeWord: "google drive",
      actions: {
        list_files: "read",
        create_text_file: "create",
        update_text_file: "update",
        trash_file: "delete",
      },
    },
    {
      provider: "google-calendar",
      scopeWord: "google calendar",
      actions: {
        list_events: "read",
        find_free_slots: "read",
        create_event: "create",
        delete_event: "delete",
      },
    },
  ];

  /** A sentence that unambiguously names one operation, for rule-building. */
  const RULE_FOR: Record<string, (scope: string) => string> = {
    read: (s) => `always ask before reading ${s}`,
    draft: (s) => `always ask before drafting in ${s}`,
    send: (s) => `always ask before sending in ${s}`,
    post: (s) => `always ask before posting in ${s}`,
    create: (s) => `always ask before creating in ${s}`,
    update: (s) => `always ask before updating in ${s}`,
    archive: (s) => `always ask before archiving in ${s}`,
    delete: (s) => `always ask before deleting in ${s}`,
  };

  for (const { provider, scopeWord, actions } of PROVIDER_RULES) {
    for (const [ruleOp, build] of Object.entries(RULE_FOR)) {
      it(`${provider}: a "${ruleOp}" rule fires on ${ruleOp} actions only`, () => {
        const parsed = parsePermissionRule(build(scopeWord));
        // The rule must first have parsed to the operation it names.
        expect(parsed.verb, `"${build(scopeWord)}" parsed as ${parsed.verb}`).toBe(ruleOp);

        const r = [rule(build(scopeWord))];
        for (const [actionId, actionOp] of Object.entries(actions)) {
          const fired = applyRules(r, { target: provider, actionId }).requirement !== null;
          expect(fired, `${ruleOp}-rule on ${provider}.${actionId} (a ${actionOp})`).toBe(
            actionOp === ruleOp
          );
        }
      });
    }
  }
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
