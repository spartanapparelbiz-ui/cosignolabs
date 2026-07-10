import { beforeEach, describe, expect, it } from "vitest";
import { gmailProvider } from "@/lib/integrations/providers/gmail";
import { serverTier, resolveTier, mcpToolRisk } from "@/lib/integrations/tiers";
import { proposeConnectorAction } from "@/lib/integrations/runtime/propose";
import { assertIntegrationCapacity } from "@/lib/enforcement";
import { toView } from "@/lib/integrations/runtime/connections";
import { encryptSecret } from "@/lib/integrations/crypto";
import { MemoryStore } from "../../src/lib/store/memory";

/**
 * §6 acceptance for real integrations. The through-line: a connector can
 * PROPOSE, but every action is server-tiered and can only reach `executed`
 * through the approval state machine — a connector never bypasses the
 * signature loop, self-escalates, or leaks a token.
 */

function cap(id: string) {
  const a = gmailProvider.listActions().find((x) => x.id === id);
  if (!a) throw new Error(`no gmail capability ${id}`);
  return a;
}

let store: MemoryStore;
beforeEach(() => {
  store = new MemoryStore();
  (globalThis as Record<string, unknown>).__cosignoStore = store;
});

async function connectGmail() {
  const c = await store.createConnection({
    user_id: "u1",
    provider_key: "google",
    kind: "app",
    display_name: "Gmail",
    auth_type: "oauth2",
    encrypted_credentials: encryptSecret({ access_token: "ya29.SECRET-TOKEN", refresh_token: "r" }),
    scopes: "gmail.modify",
    status: "connected",
  });
  return c.id;
}

/* ---------------------------------------------- capability → server tier */
describe("Gmail capabilities are server-tiered by risk", () => {
  it("read = tier 1, send/modify = tier 2, trash = tier 3", () => {
    expect(serverTier(cap("search_messages"))).toBe(1);
    expect(serverTier(cap("read_message"))).toBe(1);
    expect(serverTier(cap("create_draft"))).toBe(1); // drafting sends nothing
    expect(serverTier(cap("send_message"))).toBe(2);
    expect(serverTier(cap("archive"))).toBe(2);
    expect(serverTier(cap("mark_read"))).toBe(2);
    expect(serverTier(cap("trash"))).toBe(3);
  });

  it("a connector requesting a LOWER tier than its risk is clamped + flagged", () => {
    // trash is destructive (3); asking for 1 must clamp back up to 3.
    expect(resolveTier(cap("trash"), 1)).toEqual({ tier: 3, clamped: true });
    // send is write (2); asking for 1 clamps to 2.
    expect(resolveTier(cap("send_message"), 1)).toEqual({ tier: 2, clamped: true });
    // asking for a MORE restrictive tier is allowed (not clamped).
    expect(resolveTier(cap("send_message"), 3)).toEqual({ tier: 3, clamped: false });
  });
});

/* --------------------------------------- propose → approval, never bypass */
describe("connector actions flow through the approval engine", () => {
  it("a Gmail send is proposed at tier 2 and does NOT reach executed on its own", async () => {
    const id = await connectGmail();
    const res = await proposeConnectorAction("u1", "s1", {
      connectionId: id,
      capability: "send_message",
      args: { to: "x@y.com", subject: "hi", body: "hello" },
    });
    expect(res.ok).toBe(true);
    expect(res.action!.category).toBe("connection_call");
    expect(res.action!.tier).toBe(2);
    expect(res.action!.status).toBe("proposed"); // waits for a signature
  });

  it("a Gmail trash is tier 3 (typed confirmation) and stays proposed", async () => {
    const id = await connectGmail();
    const res = await proposeConnectorAction("u1", "s1", {
      connectionId: id,
      capability: "trash",
      args: { ids: ["m1", "m2"] },
      requestedTier: 1, // a hostile lower request…
    });
    expect(res.action!.tier).toBe(3); // …is clamped back up
    expect(res.action!.status).toBe("proposed");
    expect(res.action!.tier_note).toMatch(/cannot lower/i);
  });

  it("refuses a capability the connection doesn't expose", async () => {
    const id = await connectGmail();
    const res = await proposeConnectorAction("u1", "s1", { connectionId: id, capability: "wire_money" });
    expect(res.ok).toBe(false);
  });
});

/* --------------------------------------- custom MCP: safe defaults + gate */
describe("custom MCP output can't self-execute or self-escalate", () => {
  async function connectMcpWithTool(tool: { name: string; sensitive: boolean; enabled: boolean; consented_at: string | null }) {
    const c = await store.createConnection({
      user_id: "u1",
      provider_key: "mcp",
      kind: "mcp",
      display_name: "Acme MCP",
      auth_type: "mcp_remote",
      encrypted_credentials: encryptSecret({ bearer: "b" }),
      scopes: null,
      status: "connected",
      metadata: { url: "https://mcp.example.com" },
    });
    await store.saveMcpTools("u1", c.id, [
      { name: tool.name, description: "x", enabled: tool.enabled, sensitive: tool.sensitive, consented_at: tool.consented_at },
    ]);
    return c.id;
  }

  it("a non-read MCP tool defaults to a safe tier and is only proposable once enabled", async () => {
    // Not enabled → cannot be proposed at all.
    const id = await connectMcpWithTool({ name: "wipe_database", sensitive: true, enabled: false, consented_at: null });
    const blocked = await proposeConnectorAction("u1", "s1", { connectionId: id, capability: "wipe_database" });
    expect(blocked.ok).toBe(false);

    // Destructive-sounding name → tier 3; enabling doesn't lower it.
    expect(mcpToolRisk({ name: "wipe_database", sensitive: true })).toBe("destructive");
    const id2 = await connectMcpWithTool({ name: "wipe_database", sensitive: true, enabled: true, consented_at: "2026-01-01" });
    const res = await proposeConnectorAction("u1", "s1", { connectionId: id2, capability: "wipe_database" });
    expect(res.action!.tier).toBe(3);
    expect(res.action!.status).toBe("proposed"); // never auto-runs
  });

  it("an unknown tool name defaults to write (tier 2), never tier-1 auto-run", () => {
    expect(mcpToolRisk({ name: "do_something", sensitive: false })).toBe("write");
    expect(mcpToolRisk({ name: "get_weather", sensitive: false })).toBe("read");
  });
});

/* ------------------------------------------------ plan gating (server) */
describe("plan gating is enforced server-side", () => {
  it("a free user's 2nd integration is blocked with an upgrade prompt", async () => {
    await connectGmail(); // 1 connection; free limit is 1
    await expect(assertIntegrationCapacity("u1")).rejects.toMatchObject({ status: 402 });
  });

  it("custom MCP is a pro+ feature — blocked on free even with no connections", async () => {
    await expect(assertIntegrationCapacity("u1", { customMcp: true })).rejects.toMatchObject({ status: 402 });
  });
});

/* ------------------------------------------------ credentials never leak */
describe("tokens never reach the client", () => {
  it("the connection view carries no access/refresh token", async () => {
    const id = await connectGmail();
    const rec = await store.getConnection("u1", id);
    const view = JSON.stringify(toView(rec!));
    expect(view).not.toContain("ya29.SECRET-TOKEN");
    expect(view).not.toContain("access_token");
    expect(view).not.toContain("encrypted_credentials");
  });
});
