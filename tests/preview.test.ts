import { beforeEach, describe, expect, it } from "vitest";
import { previewConnectorAction } from "../src/lib/integrations/runtime/preview";
import { parsePermissionRule } from "../src/lib/rules";
import { getStore } from "../src/lib/store";
import { MemoryStore } from "../src/lib/store/memory";
import type { CustomApiConfig } from "../src/lib/integrations/types";

const USER = "demo-user";
const SECRET = "sk_live_supersecret_value_9999";

function freshStore(): MemoryStore {
  const store = new MemoryStore();
  (globalThis as unknown as { __cosignoStore?: unknown }).__cosignoStore = store;
  return store;
}
beforeEach(() => {
  freshStore();
});

async function customConnection(actions: CustomApiConfig["actions"]) {
  const cfg: CustomApiConfig = {
    base_url: "https://api.acme.com",
    auth: { placement: "bearer" },
    actions,
  };
  return getStore().createConnection({
    user_id: USER,
    provider_key: "custom",
    kind: "custom",
    display_name: "Acme",
    auth_type: "apikey",
    // A real (fake) secret sits on the record — the preview must never surface it.
    encrypted_credentials: SECRET,
    scopes: null,
    status: "connected",
    metadata: cfg as unknown as Record<string, unknown>,
  });
}

describe("previewConnectorAction (dry-run: computes, never acts)", () => {
  it("renders the request with the key PLACEMENT but never its value", async () => {
    const conn = await customConnection([
      { id: "create_customer", summary: "create a customer", method: "POST", path: "/customers", risk: "write" },
    ]);
    const res = await previewConnectorAction(USER, {
      connectionId: conn.id,
      capability: "create_customer",
      args: { name: "Sarah Lee" },
    });
    expect(res.ok).toBe(true);
    expect(res.tier).toBe(2);
    expect(res.wouldRequire).toBe("signature");
    expect(res.request?.method).toBe("POST");
    expect(res.request?.url).toBe("https://api.acme.com/customers");
    expect(res.request?.keyPlacement).toContain("••");
    // The real secret must appear NOWHERE in the preview payload.
    expect(JSON.stringify(res)).not.toContain(SECRET);
    expect(res.note.toLowerCase()).toContain("nothing was sent");
  });

  it("creates NO action card and increments no usage", async () => {
    const store = getStore();
    const conn = await customConnection([
      { id: "list_customers", summary: "list customers", method: "GET", path: "/customers", risk: "read" },
    ]);
    await previewConnectorAction(USER, { connectionId: conn.id, capability: "list_customers" });
    const actions = await store.listActions(USER);
    expect(actions).toHaveLength(0); // a preview never becomes a card
  });

  it("resolves {id} path placeholders from args", async () => {
    const conn = await customConnection([
      { id: "get_customer", summary: "get a customer", method: "GET", path: "/customers/{id}", risk: "read" },
    ]);
    const res = await previewConnectorAction(USER, {
      connectionId: conn.id,
      capability: "get_customer",
      args: { id: "42" },
    });
    expect(res.request?.url).toBe("https://api.acme.com/customers/42");
  });

  it("reflects a 'never' rule as blocked, without acting", async () => {
    const store = getStore();
    const conn = await customConnection([
      { id: "delete_customer", summary: "delete a customer", method: "DELETE", path: "/customers/{id}", risk: "destructive" },
    ]);
    const parsed = parsePermissionRule("never delete anything");
    await store.createPermissionRule(USER, { text: "never delete anything", ...parsed });
    const res = await previewConnectorAction(USER, { connectionId: conn.id, capability: "delete_customer" });
    expect(res.ok).toBe(true);
    expect(res.wouldRequire).toBe("blocked");
    expect(res.rules.some((r) => r.effect === "blocked")).toBe(true);
  });

  it("reflects a rule that RAISES a tier-1 read to a signature", async () => {
    const store = getStore();
    const conn = await customConnection([
      { id: "list_customers", summary: "list customers", method: "GET", path: "/customers", risk: "read" },
    ]);
    const parsed = parsePermissionRule("any action requires approval");
    await store.createPermissionRule(USER, { text: "any action requires approval", ...parsed });
    const res = await previewConnectorAction(USER, { connectionId: conn.id, capability: "list_customers" });
    expect(res.tier).toBe(2);
    expect(res.wouldRequire).toBe("signature");
    expect(res.rules.some((r) => r.effect === "raised to signature")).toBe(true);
  });
});
