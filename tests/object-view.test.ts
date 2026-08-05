import { describe, expect, it } from "vitest";
import { fieldLabel, formatValue, objectsFromAction } from "@/lib/objectView";
import type { ActionCategory, ActionRecord } from "@/lib/types";

function action(
  category: ActionCategory,
  payload: Record<string, unknown>,
  result: Record<string, unknown> | null = null
): Pick<ActionRecord, "category" | "payload" | "result"> {
  return { category, payload, result };
}

/**
 * The rule this file exists to enforce: a user never reads JSON, a brace, or a
 * raw field key to understand what changed.
 */

describe("values in words", () => {
  it("says money as money when the payload actually says it is money", () => {
    expect(formatValue(2200, "amount_cents")).toBe("$22.00");
    expect(formatValue(2200, "amount_cents", "EUR")).toBe("€22.00");
  });

  it("never invents a currency for a bare number", () => {
    // `price: 22` could be dollars, cents, euros or credits. Stamping a
    // currency on it is an assertion nobody observed.
    expect(formatValue(22, "price")).toBe("22");
    expect(formatValue(22, "price", "USD")).toBe("$22.00");
  });

  it("says booleans and empties as words", () => {
    expect(formatValue(true)).toBe("yes");
    expect(formatValue(false)).toBe("no");
    expect(formatValue(null)).toBe("empty");
    expect(formatValue("")).toBe("empty");
  });

  it("never prints a secret, whatever the payload calls it", () => {
    expect(formatValue("sk_live_abc123", "api_key")).toBe("hidden");
    expect(formatValue("Bearer xyz", "authorization")).toBe("hidden");
  });

  it("names the things in a list, or counts them when it can't", () => {
    expect(formatValue([{ name: "Grace" }, { name: "John" }])).toBe("Grace, John");
    expect(formatValue([1, 2, 3, 4])).toBe("4 items");
    expect(formatValue([])).toBe("none");
  });

  it("describes a nested object instead of serializing it", () => {
    expect(formatValue({ name: "Grace" })).toBe("Grace");
    expect(formatValue({ city: "Berlin", zip: "10115" })).toBe("city Berlin, zip 10115");
    const deep = formatValue({ a: { b: 1 }, c: { d: 2 }, e: { f: 3 }, g: { h: 4 } });
    expect(deep).toBe("4 details");
    expect(deep).not.toContain("{");
  });

  it("never emits JSON, braces, or quotes for any shape", () => {
    const shapes: unknown[] = [
      { nested: { deep: { deeper: true } } },
      [{ a: 1 }, { b: 2 }, { c: 3 }, { d: 4 }],
      new Date("2026-01-01").toISOString(),
      12345,
    ];
    for (const s of shapes) {
      const out = formatValue(s, "thing");
      expect(out).not.toContain("{");
      expect(out).not.toContain("[");
      expect(out).not.toContain('"');
    }
  });

  it("humanizes field names", () => {
    expect(fieldLabel("amount_cents")).toBe("Price");
    expect(fieldLabel("cust_name")).toBe("Cust name");
    expect(fieldLabel("createdAt")).toBe("Created at");
  });
});

describe("objects, not statistics", () => {
  it("reads a before → after pair as one object with its changes", () => {
    const view = objectsFromAction(
      action("update_record", {
        action: "update_product",
        args: {
          name: "Hydro Bottle",
          before: { amount_cents: 2200, status: "draft" },
          after: { amount_cents: 2600, status: "published" },
        },
      })
    );
    expect(view.cards).toHaveLength(1);
    const card = view.cards[0];
    expect(card.type).toBe("Product");
    expect(card.name).toBe("Hydro Bottle");
    expect(card.changes).toEqual([
      { label: "Price", before: "$22.00", after: "$26.00" },
      { label: "Status", before: "draft", after: "published" },
    ]);
    expect(card.summary).toBe("2 details updated");
  });

  it("reads a changes map", () => {
    const view = objectsFromAction(
      action("update_record", {
        action: "update_customer",
        args: { name: "Grace", changes: { email: { from: "g@old.com", to: "g@new.com" } } },
      })
    );
    expect(view.cards[0].type).toBe("Customer");
    expect(view.cards[0].name).toBe("Grace");
    expect(view.cards[0].summary).toBe("email updated");
    expect(view.cards[0].changes[0]).toEqual({
      label: "Email",
      before: "g@old.com",
      after: "g@new.com",
    });
  });

  it("makes one card per real object in a list, and says how many were left out", () => {
    const customers = Array.from({ length: 9 }, (_, i) => ({ name: `Person ${i}`, email: `p${i}@x.com` }));
    const view = objectsFromAction(action("update_record", { action: "update_customers", args: { customers } }));
    expect(view.cards).toHaveLength(6);
    expect(view.more).toBe(3);
    expect(view.cards[0].type).toBe("Customer");
    expect(view.cards[0].name).toBe("Person 0");
  });

  it("shows a create as proof: it didn't exist, now it does", () => {
    const view = objectsFromAction(
      action("connection_call", {
        action: "create_pull_request",
        args: { title: "PR #281", branch: "fix-checkout" },
      })
    );
    // The most checkable statement there is — either it's there or it isn't.
    expect(view.cards[0].changes[0]).toEqual({
      label: "Pull request",
      before: "No pull request",
      after: "PR #281",
    });
    // …and the detail still travels underneath.
    expect(view.cards[0].changes.some((c) => c.label === "Branch")).toBe(true);
  });

  it("shows a delete the other way round", () => {
    const view = objectsFromAction(
      action("delete", { action: "delete_repository", args: { name: "legacy-api" } })
    );
    expect(view.cards[0].changes[0]).toEqual({
      label: "Repository",
      before: "legacy-api",
      after: "no repository",
    });
  });

  it("falls back to the action's own arguments as one object", () => {
    const view = objectsFromAction(
      action("send_email", { action: "send_message", args: { subject: "Invoice", to: "a@b.com" } })
    );
    expect(view.empty).toBe(false);
    expect(view.cards[0].name).toBe("Invoice");
    expect(view.cards[0].changes.some((c) => c.label === "To")).toBe(true);
  });

  it("reports itself empty rather than inventing detail", () => {
    const view = objectsFromAction(action("search", { kind: "app", connection_id: "c1", action: "list_things" }));
    expect(view.empty).toBe(true);
    expect(view.cards).toEqual([]);
  });

  it("says a delete removed something", () => {
    const view = objectsFromAction(action("delete", { action: "delete_customer", args: { name: "Grace" } }));
    expect(view.cards[0].summary).toBe("removed");
  });

  it("never throws, whatever the payload is", () => {
    const hostile: Record<string, unknown>[] = [
      {},
      { args: null },
      { args: { before: "not an object", after: 42 } },
      { args: { changes: { a: "not a change" } } },
      { args: { list: [null, undefined, 1] } },
    ];
    for (const payload of hostile) {
      expect(() => objectsFromAction(action("update_record", payload))).not.toThrow();
    }
  });

  it("keeps secrets out of the cards entirely", () => {
    const view = objectsFromAction(
      action("update_record", { action: "update_connection", args: { name: "Acme", api_key: "sk_live_secret" } })
    );
    const rendered = JSON.stringify(view);
    expect(rendered).not.toContain("sk_live_secret");
    expect(view.cards[0].changes.find((c) => c.label === "Api key")?.after).toBe("hidden");
  });
});
