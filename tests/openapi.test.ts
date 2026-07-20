import { describe, expect, it } from "vitest";
import { parseOpenApi, parseOpenApiText } from "../src/lib/integrations/openapi";

describe("parseOpenApi (deterministic spec → detected actions + risk)", () => {
  const spec3 = {
    openapi: "3.0.0",
    info: { title: "Acme CRM" },
    servers: [{ url: "https://api.acme.com/v1" }],
    paths: {
      "/customers": {
        get: { operationId: "listCustomers", summary: "List customers" },
        post: { operationId: "createCustomer", summary: "Create a customer" },
      },
      "/customers/{id}": {
        delete: { operationId: "deleteCustomer", summary: "Delete a customer" },
      },
    },
  };

  it("detects operations with server-recommended risk tiers", () => {
    const d = parseOpenApi(spec3);
    expect(d.title).toBe("Acme CRM");
    expect(d.base_url).toBe("https://api.acme.com/v1");
    const byId = Object.fromEntries(d.actions.map((a) => [a.id, a]));
    // camelCase operationIds split to snake_case so the risk heuristic sees the verb.
    expect(byId.list_customers.risk).toBe("read"); // GET + read-ish name
    expect(byId.list_customers.method).toBe("GET");
    expect(byId.create_customer.risk).toBe("write"); // POST
    expect(byId.delete_customer.risk).toBe("destructive"); // DELETE
    expect(byId.delete_customer.path).toBe("/customers/{id}");
  });

  it("supports Swagger 2 host + basePath + schemes", () => {
    const d = parseOpenApi({
      swagger: "2.0",
      info: { title: "Legacy" },
      host: "legacy.example.com",
      basePath: "/api",
      schemes: ["https"],
      paths: { "/ping": { get: { summary: "Ping" } } },
    });
    expect(d.base_url).toBe("https://legacy.example.com/api");
    expect(d.actions).toHaveLength(1);
  });

  it("falls back to method_path ids and de-duplicates", () => {
    const d = parseOpenApi({
      info: { title: "X" },
      servers: [{ url: "https://x.io" }],
      paths: {
        "/a": { get: {}, post: {} },
        "/b": { get: {} },
      },
    });
    const ids = d.actions.map((a) => a.id);
    expect(new Set(ids).size).toBe(ids.length); // all unique
    expect(ids).toContain("get_a");
  });

  it("reports honest notes instead of throwing on junk", () => {
    expect(parseOpenApi(null).notes.length).toBeGreaterThan(0);
    expect(parseOpenApi({ info: { title: "Empty" }, paths: {} }).actions).toHaveLength(0);
  });

  // Regression: two ops whose ids slug to the same >52-char stem must NOT hang.
  it("terminates and de-duplicates long colliding operation ids", () => {
    const longId = "a".repeat(65);
    const d = parseOpenApi({
      info: { title: "X" },
      servers: [{ url: "https://x.io" }],
      paths: {
        "/one": { get: { operationId: longId } },
        "/two": { get: { operationId: longId } },
      },
    });
    expect(d.actions).toHaveLength(2);
    expect(new Set(d.actions.map((a) => a.id)).size).toBe(2); // unique, no loop
  });

  it("parseOpenApiText handles bad JSON gracefully", () => {
    const d = parseOpenApiText("{ not json");
    expect(d.actions).toHaveLength(0);
    expect(d.notes[0].toLowerCase()).toContain("json");
  });
});
