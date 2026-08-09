import { describe, it, expect } from "vitest";
import {
  effectLine,
  extractDiff,
  impactChips,
  payloadCount,
  resultPreview,
  reversibilityChip,
  sessionCounts,
  sessionCountsLine,
} from "@/lib/actionPresentation";
import type { ActionRecord } from "@/lib/types";

/**
 * Card presentation is derived from SERVER-resolved facts (category, tier,
 * payload) — never from model prose — so the "what this will do" line and
 * the impact chips can't be talked into understating an effect. These pin
 * the derivations and their totality (weird payloads never throw).
 */

function act(
  category: ActionRecord["category"],
  tier: ActionRecord["tier"],
  payload: Record<string, unknown> = {}
) {
  return { category, tier, payload };
}

describe("effectLine — one calm sentence, reversibility included", () => {
  it("read-only categories say nothing changes", () => {
    expect(effectLine(act("search", 1))).toMatch(/read-only/i);
    expect(effectLine(act("summarize", 1))).toMatch(/read-only/i);
    expect(effectLine(act("draft", 1))).toMatch(/nothing is sent/);
  });

  it("effects state their size from the payload", () => {
    expect(effectLine(act("send_email", 2, { count: 3 }))).toBe(
      "Sends 3 emails on your behalf."
    );
    expect(effectLine(act("send_email", 2))).toBe(
      "Sends 1 email on your behalf."
    );
    expect(effectLine(act("update_record", 2, { match_count: 47 }))).toMatch(
      /Changes 47 records/
    );
    expect(effectLine(act("delete", 3, { count: 12 }))).toMatch(
      /Permanently deletes 12 items — it can't be undone/
    );
  });

  it("money categories name the amount when present", () => {
    expect(effectLine(act("refund", 3, { amount: "$40" }))).toMatch(/\$40/);
    expect(effectLine(act("payment", 3))).toMatch(/Moves money out/);
  });

  it("never throws on junk payloads", () => {
    for (const p of [{}, { count: "??" }, { amount: 12 }, { drafts: null }]) {
      expect(() => effectLine(act("send_email", 2, p as never))).not.toThrow();
    }
  });
});

describe("payloadCount — counts from keys or arrays", () => {
  it("prefers explicit count keys, falls back to array length", () => {
    expect(payloadCount({ match_count: 47 })).toBe(47);
    expect(payloadCount({ count: "3" })).toBe(3);
    expect(payloadCount({ drafts: [1, 2, 3] })).toBe(3);
    expect(payloadCount({})).toBeNull();
  });
});

describe("impactChips — what it touches, risk chip last", () => {
  it("derives chips from the payload and closes with reversibility", () => {
    const chips = impactChips(
      act("update_record", 2, {
        operation: "archive+label",
        label: "newsletters",
        match_count: 47,
      })
    );
    const labels = chips.map((c) => c.label);
    expect(labels).toContain("47 records");
    expect(labels).toContain('label "newsletters"');
    expect(labels[labels.length - 1]).toBe("changes data");
  });

  it("caps the row (max 4 payload chips + 1 risk chip)", () => {
    const chips = impactChips(
      act("update_record", 2, {
        source: "shopify",
        target: "products",
        match_count: 3,
        amount: "$12",
        operation: "reprice",
        label: "sale",
        window_days: 7,
      })
    );
    expect(chips.length).toBeLessThanOrEqual(5);
    expect(chips[chips.length - 1].grade).not.toBe("neutral");
  });

  it("risk grading: permanent for delete/money, safe for tier-1 reads", () => {
    expect(reversibilityChip("delete", 3).grade).toBe("permanent");
    expect(reversibilityChip("payment", 3).label).toBe("moves money");
    expect(reversibilityChip("search", 1)).toEqual({
      label: "read-only",
      grade: "safe",
    });
    expect(reversibilityChip("send_email", 2).grade).toBe("external");
  });
});

describe("extractDiff — before → after only when the payload is change-shaped", () => {
  it("reads changes: {field: {from, to}}", () => {
    const rows = extractDiff({
      changes: { price: { from: "$40", to: "$32" }, status: { from: "live", to: "sale" } },
    });
    expect(rows).toEqual([
      { field: "price", before: "$40", after: "$32" },
      { field: "status", before: "live", after: "sale" },
    ]);
  });

  it("reads top-level before/after objects (union of keys)", () => {
    const rows = extractDiff({
      before: { price: 40 },
      after: { price: 32, badge: "sale" },
    });
    expect(rows).toContainEqual({ field: "price", before: "40", after: "32" });
    expect(rows).toContainEqual({ field: "badge", before: "—", after: "sale" });
  });

  it("returns null for non-change payloads (falls back to the plain well)", () => {
    expect(extractDiff({ query: "newsletters", window_days: 30 })).toBeNull();
    expect(extractDiff({})).toBeNull();
    expect(extractDiff({ changes: "not-an-object" })).toBeNull();
  });
});

describe("resultPreview — compact list preview of what came back", () => {
  it("surfaces the first list in the result, capped at 5", () => {
    const p = resultPreview({
      summary: "found 7 newsletter emails.",
      emails: ["a", "b", "c", "d", "e", "f", "g"],
    });
    expect(p?.summary).toMatch(/found 7/);
    expect(p?.items).toHaveLength(5);
    expect(p?.more).toBe(2);
  });

  it("summary-only results still preview; empty results don't", () => {
    expect(resultPreview({ summary: "done." })?.items).toEqual([]);
    expect(resultPreview(null)).toBeNull();
    expect(resultPreview({})).toBeNull();
  });
});

describe("sessionCounts — the quiet audit-trail line", () => {
  it("counts everything proposed and how it resolved", () => {
    const counts = sessionCounts([
      { status: "proposed" },
      { status: "executed" },
      { status: "executed" },
      { status: "vetoed" },
    ]);
    expect(counts).toEqual({ proposed: 4, executed: 2, vetoed: 1, failed: 0 });
    expect(sessionCountsLine(counts)).toBe("4 proposed · 2 executed · 1 vetoed");
  });

  it("is null with no actions, includes failures only when present", () => {
    expect(sessionCountsLine(sessionCounts([]))).toBeNull();
    expect(
      sessionCountsLine(sessionCounts([{ status: "failed" }]))
    ).toMatch(/1 failed/);
  });
});

describe("operatorOf — the operator lane an action belongs to", () => {
  it("maps every real category to its operator group", async () => {
    const { operatorOf } = await import("../src/lib/actionPresentation");
    expect(operatorOf("search")).toBe("research");
    expect(operatorOf("summarize")).toBe("research");
    expect(operatorOf("draft")).toBe("communication");
    expect(operatorOf("send_email")).toBe("communication");
    expect(operatorOf("post_content")).toBe("communication");
    expect(operatorOf("update_record")).toBe("records");
    expect(operatorOf("webhook")).toBe("records");
    expect(operatorOf("spend")).toBe("finance");
    expect(operatorOf("payment")).toBe("finance");
    expect(operatorOf("refund")).toBe("finance");
    expect(operatorOf("delete")).toBe("cleanup");
    expect(operatorOf("connection_call")).toBe("connections");
  });

  it("covers the full CATEGORY_LIST (no category falls to the generic label)", async () => {
    const { operatorOf } = await import("../src/lib/actionPresentation");
    const { CATEGORY_LIST } = await import("../src/lib/types");
    for (const meta of CATEGORY_LIST) {
      expect(operatorOf(meta.category), meta.category).not.toBe("operator");
    }
  });
});
