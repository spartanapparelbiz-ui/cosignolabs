import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { approveAction } from "@/lib/actions/engine";
import { executeAction } from "@/lib/actions/executor";
import { gmailProvider } from "@/lib/integrations/providers/gmail";
import { listProviderMeta } from "@/lib/integrations/registry";
import { serverTier, resolveTier, mcpToolRisk } from "@/lib/integrations/tiers";
import { proposeConnectorAction } from "@/lib/integrations/runtime/propose";
import { assertIntegrationCapacity } from "@/lib/enforcement";
import { toView } from "@/lib/integrations/runtime/connections";
import { connectedCapabilitiesSummary } from "@/lib/integrations/runtime/summary";
import { buildSystemPrompt } from "@/lib/agent/systemPrompt";
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

/* --------------------------------------- capability tiers surfaced to UI */
describe("provider metadata exposes the per-capability tier", () => {
  it("Gmail's capabilities carry their server tier for the account panel", () => {
    const gmail = listProviderMeta().find((p) => p.key === "google")!;
    const byId = Object.fromEntries(gmail.actions.map((a) => [a.id, a.tier]));
    expect(byId.search_messages).toBe(1);
    expect(byId.send_message).toBe(2);
    expect(byId.trash).toBe(3);
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
      {
        name: tool.name,
        description: "x",
        input_schema: {},
        enabled: tool.enabled,
        sensitive: tool.sensitive,
        consented_at: tool.consented_at,
        // Unclassified on purpose: this exercises the name-based fallback in
        // mcpToolRisk, which is what rows written before classification hit.
        category: null,
        confidence: null,
        classified_by: null,
      },
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

/* ------------------------------------------------ planner awareness (§5) */
describe("the planner is told what's connected, and to suggest connecting", () => {
  it("summary is empty with nothing connected; the prompt says to suggest connecting", async () => {
    expect(await connectedCapabilitiesSummary("u1")).toBe("");
    const prompt = buildSystemPrompt("");
    expect(prompt).toMatch(/no tools connected/i);
    expect(prompt).toMatch(/tell them which tool to connect/i);
  });

  it("lists connected capabilities with their risk, and forbids self-running them", async () => {
    await connectGmail();
    const summary = await connectedCapabilitiesSummary("u1");
    expect(summary).toContain("Gmail");
    expect(summary).toContain("send_message(write)");
    expect(summary).toContain("trash(destructive)");
    const prompt = buildSystemPrompt(summary);
    expect(prompt).toContain("send_message(write)");
    expect(prompt).toMatch(/you never select that category|cannot run these yourself/i);
  });
});

/* --------------------------------- end-to-end: propose → approve → execute */
describe("the full connector loop works (propose → approve → real execute)", () => {
  const realFetch = globalThis.fetch;
  function okJson(body: unknown) {
    return {
      ok: true,
      status: 200,
      headers: { get: () => null },
      text: async () => JSON.stringify(body),
    } as unknown as Response;
  }
  beforeEach(() => {
    globalThis.fetch = vi.fn(async (url: string | URL | Request) => {
      const u = String(url);
      if (u.includes("/messages/send")) return okJson({ id: "sent-1" });
      if (u.includes("/trash")) return okJson({ id: "trashed-1" });
      if (u.includes("/messages?")) return okJson({ messages: [{ id: "m1" }], resultSizeEstimate: 1 });
      if (u.includes("oauth2.googleapis.com/token")) return okJson({ access_token: "fresh" });
      return okJson({});
    }) as unknown as typeof fetch;
  });
  afterEach(() => {
    globalThis.fetch = realFetch;
  });

  it("a proposed Gmail send, once approved, executes and records a REAL result", async () => {
    const id = await connectGmail();
    const proposed = await proposeConnectorAction("u1", "s1", {
      connectionId: id,
      capability: "send_message",
      args: { to: "lead@acme.com", subject: "hi", body: "hello" },
    });
    expect(proposed.action!.status).toBe("proposed");

    // Approve through the real engine → runs the executor → hits (mocked) Gmail.
    const executed = await approveAction("u1", proposed.action!.id);
    expect(executed.status).toBe("executed");
    expect(executed.result?.summary).toMatch(/sent an email to lead@acme\.com/i);
    // A REAL connected-account action is NOT flagged as sandbox/simulated.
    expect((executed.result as Record<string, unknown>).simulated).not.toBe(true);
  });

  it("sample mode (no connection) executes as clearly-labeled simulated", async () => {
    // A generic category — what the planner proposes with nothing connected —
    // runs in the sandbox and is flagged simulated so the UI can label it.
    const res = await executeAction("delete", { target: "old files" }, { userId: "u1" });
    expect(res.ok).toBe(true);
    expect(res.detail?.simulated).toBe(true);
    expect(res.summary).not.toMatch(/\(stub\)/i);
  });

  it("a tier-3 trash cannot execute without the typed confirmation", async () => {
    const id = await connectGmail();
    const proposed = await proposeConnectorAction("u1", "s1", {
      connectionId: id,
      capability: "trash",
      args: { ids: ["m1"] },
    });
    // No confirmation → blocked by the state machine.
    await expect(approveAction("u1", proposed.action!.id)).rejects.toMatchObject({
      code: "confirmation_required",
    });
    // Wrong word → still blocked.
    await expect(
      approveAction("u1", proposed.action!.id, { confirmation: "yes" })
    ).rejects.toMatchObject({ code: "confirmation_mismatch" });
    // Correct typed confirmation → executes.
    const executed = await approveAction("u1", proposed.action!.id, { confirmation: "connection_call" });
    expect(executed.status).toBe("executed");
    expect(executed.result?.summary).toMatch(/trash/i);
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
