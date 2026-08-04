import { describe, expect, it } from "vitest";
import { buildTwin } from "@/lib/twin/model";
import { coverageOf, describeAction, describeConnection } from "@/lib/workspace-model/actionSpec";

/**
 * The universal action model: every action from every kind of connection
 * describes itself in the same shape, so a user asks "can the connected system
 * do this?" rather than "can cosigno do this?".
 *
 * The property that matters most is VERIFICATION. Completion has to mean the
 * outcome happened, not that a request was accepted — and where the connector
 * gives cosigno no way to check, it must say so rather than imply a guarantee.
 */

const shop = buildTwin({
  connection_key: "conn_shop",
  provider_key: "custom",
  name: "Shop API",
  kind: "custom",
  status: "connected",
  source: "openapi",
  actions: [
    { id: "list_products", summary: "List products", mutates: false },
    {
      id: "update_product",
      summary: "Update a product",
      mutates: true,
      inputs: [
        { name: "product_id", required: true, type: "text" },
        { name: "price_cents", required: false, type: "number" },
      ],
    },
    { id: "delete_product", summary: "Delete a product", mutates: true },
    { id: "create_refund", summary: "Refund a payment", mutates: true },
  ],
});

/** A connector that writes but exposes no way to read anything back. */
const blind = buildTwin({
  connection_key: "conn_blind",
  provider_key: "mcp",
  name: "Blind server",
  kind: "mcp",
  status: "connected",
  source: "mcp",
  actions: [{ id: "send_notice", summary: "Send a notice", mutates: true }],
});

describe("every action, the same shape", () => {
  it("describes an action with every field the model promises", () => {
    const spec = describeAction(shop, "update_product")!;
    expect(spec.name).toBe("Update product");
    expect(spec.expected_result).toContain("new values");
    expect(spec.permissions.length).toBeGreaterThan(0);
    expect(spec.risk).toBeTruthy();
    expect(spec.risk_because.length).toBeGreaterThan(10);
    expect(spec.approval).toBeTruthy();
    expect(spec.validation.length).toBeGreaterThan(0);
    expect(spec.success_criteria).toBeTruthy();
    expect(spec.verification.how).toBeTruthy();
    expect(spec.rollback.how).toBeTruthy();
  });

  it("lists declared inputs, and says when the connector declared none", () => {
    const declared = describeAction(shop, "update_product")!;
    expect(declared.inputs_declared).toBe(true);
    expect(declared.inputs.map((i) => i.label)).toEqual(["Product id", "Price cents"]);
    expect(declared.inputs[0].required).toBe(true);
    expect(declared.validation[0]).toContain("product id");

    // "Didn't say" is a different answer from "takes nothing".
    const undeclared = describeAction(shop, "delete_product")!;
    expect(undeclared.inputs_declared).toBe(false);
    expect(undeclared.validation.join(" ")).toMatch(/didn't declare its inputs/);
  });

  it("gives money actions their real risk and permission, whatever the connector is", () => {
    const refund = describeAction(shop, "create_refund")!;
    expect(refund.risk).toBe("critical");
    expect(refund.permissions).toContain("Finance.Refund");
    expect(refund.approval).toBe("your signature");
  });

  it("says success means the outcome, never that the request was accepted", () => {
    for (const id of ["update_product", "create_refund", "delete_product"]) {
      const spec = describeAction(shop, id)!;
      expect(spec.success_criteria).toMatch(/not merely that the request was accepted/);
    }
  });
});

describe("verification", () => {
  it("names the read operation that would confirm a write", () => {
    const spec = describeAction(shop, "update_product")!;
    expect(spec.verification.possible).toBe(true);
    expect(spec.verification.operation).toBe("list_products");
    expect(spec.verification.how).toContain("list_products");
  });

  it("confirms a delete by checking the thing is gone", () => {
    const spec = describeAction(shop, "delete_product")!;
    expect(spec.verification.how).toMatch(/is gone/);
  });

  it("admits when a write cannot be verified at all", () => {
    const spec = describeAction(blind, "send_notice")!;
    expect(spec.verification.possible).toBe(false);
    expect(spec.verification.operation).toBeNull();
    expect(spec.verification.how).toMatch(/cannot confirm this worked/);
    // And it promises to say so rather than reporting success.
    expect(spec.verification.how).toMatch(/say exactly that/);
  });

  it("treats a read as self-confirming", () => {
    const spec = describeAction(shop, "list_products")!;
    expect(spec.verification.possible).toBe(true);
    expect(spec.verification.how).toMatch(/own result is the confirmation/);
  });

  it("returns null for an operation the connection doesn't declare", () => {
    expect(describeAction(shop, "drop_everything")).toBeNull();
  });
});

describe("coverage", () => {
  it("reports how much of a connection cosigno can stand behind", () => {
    const coverage = coverageOf(shop);
    expect(coverage.actions).toBe(4);
    // Three of four. The refund is NOT verifiable: this connector exposes no
    // way to read refunds back, so cosigno can issue one and cannot confirm
    // it landed. That gap is exactly what this report exists to surface.
    expect(coverage.verifiable).toBe(3);
    expect(describeAction(shop, "create_refund")!.verification.possible).toBe(false);
    expect(coverage.summary).toContain("cosigno can verify afterwards");
  });

  it("counts the unverifiable honestly", () => {
    expect(coverageOf(blind).verifiable).toBe(0);
  });

  it("says plainly when a connection has advertised nothing", () => {
    const empty = buildTwin({
      connection_key: "c",
      name: "Quiet",
      kind: "mcp",
      status: "connected",
      source: "mcp",
      actions: [],
    });
    expect(coverageOf(empty).summary).toMatch(/hasn't advertised any actions/);
  });

  it("describes every action a connection exposes", () => {
    expect(describeConnection(shop).map((s) => s.id).sort()).toEqual([
      "create_refund",
      "delete_product",
      "list_products",
      "update_product",
    ]);
  });
});
