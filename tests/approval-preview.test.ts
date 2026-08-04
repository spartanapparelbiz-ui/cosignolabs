import { beforeEach, describe, expect, it } from "vitest";
import { MemoryStore } from "../src/lib/store/memory";
import { collectTwins } from "@/lib/twin/collect";
import { buildTwin } from "@/lib/twin/model";
import { previewAgainstTwin, previewForActions } from "@/lib/workspace-model/approvalPreview";
import type { ActionRecord } from "@/lib/types";
import type { CustomApiConfig } from "@/lib/integrations/types";

/**
 * The Workspace Model is load-bearing on the approval card now: it is what
 * tells a person whether the thing they are about to approve can be taken
 * back. These lock down the two properties that matter — the model must
 * identify the RIGHT connection, and it must never claim an undo it can't
 * perform.
 */

let store: MemoryStore;
beforeEach(() => {
  store = new MemoryStore();
  (globalThis as Record<string, unknown>).__cosignoStore = store;
});

const USER = "user_1";

async function mcpConnection(displayName: string, tools: string[]) {
  const conn = await store.createConnection({
    user_id: USER,
    provider_key: "mcp", // every MCP server shares this key — that's the trap
    kind: "mcp",
    display_name: displayName,
    auth_type: "mcp_remote",
    encrypted_credentials: null,
    scopes: null,
    status: "connected",
    metadata: { url: `https://${displayName}.example.com/mcp`, transport: "http" },
  });
  await store.saveMcpTools(
    USER,
    conn.id,
    tools.map((name) => ({
      connection_id: conn.id,
      name,
      description: name,
      input_schema: {},
      enabled: true,
      sensitive: true,
      consented_at: new Date().toISOString(),
    }))
  );
  return conn;
}

async function customConnection(displayName: string) {
  const config: CustomApiConfig = {
    base_url: "https://example.com",
    auth: { placement: "bearer" },
    actions: [
      { id: "list_widgets", summary: "list widgets", method: "GET", path: "/widgets", risk: "read" },
      { id: "create_widget", summary: "create a widget", method: "POST", path: "/widgets", risk: "write" },
      { id: "delete_widget", summary: "delete a widget", method: "DELETE", path: "/widgets/{id}", risk: "destructive" },
    ],
  };
  return store.createConnection({
    user_id: USER,
    provider_key: "custom",
    kind: "custom",
    display_name: displayName,
    auth_type: "apikey",
    encrypted_credentials: "cipher",
    scopes: null,
    status: "connected",
    metadata: config as unknown as Record<string, unknown>,
  });
}

describe("twin identity", () => {
  it("keeps two MCP servers apart — they share a provider key, not a model", async () => {
    const alpha = await mcpConnection("alpha", ["alpha_search"]);
    const beta = await mcpConnection("beta", ["beta_delete_thing"]);

    const collected = await collectTwins(USER);
    const keys = collected.map((c) => c.twin.connection_key).sort();
    expect(keys).toEqual([alpha.id, beta.id].sort());

    // The critical property: beta's operations must not appear on alpha's twin,
    // or an approval could offer an undo belonging to somebody else's server.
    const alphaTwin = collected.find((c) => c.twin.connection_key === alpha.id)!.twin;
    const alphaOps = alphaTwin.resources.flatMap((r) => r.operations.map((o) => o.id));
    expect(alphaOps).toEqual(["alpha_search"]);
    expect(alphaTwin.provider_key).toBe("mcp");
    expect(alphaTwin.name).toBe("alpha");
  });

  it("models custom API connectors instead of dropping them", async () => {
    const conn = await customConnection("acme billing");
    const collected = await collectTwins(USER);
    const twin = collected.find((c) => c.twin.connection_key === conn.id)?.twin;

    expect(twin).toBeTruthy();
    expect(twin!.kind).toBe("custom");
    const ops = twin!.resources.flatMap((r) => r.operations);
    expect(ops.map((o) => o.id).sort()).toEqual(["create_widget", "delete_widget", "list_widgets"]);
    // A read is the only class that changes nothing.
    expect(ops.find((o) => o.id === "list_widgets")!.mutates).toBe(false);
    expect(ops.find((o) => o.id === "delete_widget")!.mutates).toBe(true);
  });

  it("keys an available-but-unconnected provider by provider key", async () => {
    const collected = await collectTwins(USER, { includeAvailable: true });
    const github = collected.find((c) => c.twin.provider_key === "github");
    expect(github?.twin.connection_key).toBe("github");
    expect(github?.connection_id).toBeNull();
  });
});

/* ------------------------------------------------------------------ undo */

const twin = buildTwin({
  connection_key: "conn_1",
  provider_key: "custom",
  name: "Acme",
  kind: "custom",
  status: "connected",
  source: "openapi",
  actions: [
    { id: "list_widgets", summary: "list widgets", mutates: false },
    { id: "create_widget", summary: "create a widget", mutates: true },
    { id: "delete_widget", summary: "delete a widget", mutates: true },
    { id: "update_gadget", summary: "update a gadget", mutates: true },
  ],
});

describe("undo, derived from what the connection actually declares", () => {
  it("names the real inverse operation for a create", () => {
    const p = previewAgainstTwin(twin, "create_widget", { name: "thing" });
    expect(p.undo_support).toBe("full");
    expect(p.undo).toContain("delete_widget");
    expect(p.mutation).toBe("create");
  });

  it("says a read has nothing to undo", () => {
    const p = previewAgainstTwin(twin, "list_widgets", {});
    expect(p.undo).toMatch(/nothing to undo/i);
  });

  it("never offers to restore values it was never given", () => {
    // A connector call carries the values going IN. There is no captured
    // before-state, so an update must NOT claim it can put things back.
    const p = previewAgainstTwin(twin, "update_gadget", { colour: "red" });
    expect(p.undo_support).toBe("partial");
    expect(p.undo).toMatch(/previous state/i);
    expect(p.undo).not.toMatch(/can undo this by running/);
  });

  it("calls a delete permanent when the connection can't rebuild the record", () => {
    const p = previewAgainstTwin(twin, "delete_widget", { id: "w_1" });
    expect(p.undo_support).toBe("none");
    expect(p.undo).toMatch(/not captured|cannot be rebuilt|no create operation/i);
  });

  it("flags a capability the connection no longer declares", () => {
    const p = previewAgainstTwin(twin, "drop_database", {});
    expect(p.unknown_operation).toBe(true);
    expect(p.undo).toMatch(/no longer offers/);
  });

  it("flags a connection that has disappeared", () => {
    const p = previewAgainstTwin(undefined, "create_widget", {});
    expect(p.unknown_connection).toBe(true);
    expect(p.unknown_operation).toBe(true);
  });
});

/* -------------------------------------------------------------- batching */

function action(over: Partial<ActionRecord>): ActionRecord {
  return {
    id: `act_${Math.random().toString(16).slice(2)}`,
    session_id: "s1",
    user_id: USER,
    category: "connection_call",
    tier: 2,
    status: "proposed",
    summary: "do the thing",
    payload: {},
    result: null,
    veto_reason: null,
    injection_flag: false,
    tier_note: null,
    created_at: new Date().toISOString(),
    resolved_at: null,
    ...over,
  };
}

describe("previewing a queue", () => {
  it("previews each connector card against its own connection", async () => {
    const conn = await customConnection("acme");
    const create = action({
      payload: { kind: "custom", connection_id: conn.id, action: "create_widget", args: { name: "x" } },
    });
    const remove = action({
      payload: { kind: "custom", connection_id: conn.id, action: "delete_widget", args: { id: "1" } },
    });

    const previews = await previewForActions(USER, [create, remove]);
    expect(previews[create.id].undo_support).toBe("full");
    expect(previews[remove.id].undo_support).toBe("none");
  });

  it("ignores actions that aren't connector calls", async () => {
    const previews = await previewForActions(USER, [action({ category: "draft", payload: {} })]);
    expect(previews).toEqual({});
  });

  it("returns nothing rather than throwing when the model can't be built", async () => {
    (globalThis as Record<string, unknown>).__cosignoStore = {
      listConnections: () => Promise.reject(new Error("store down")),
    };
    const previews = await previewForActions(
      USER,
      [action({ payload: { kind: "app", connection_id: "c1", action: "create_issue" } })]
    );
    expect(previews).toEqual({});
  });
});
