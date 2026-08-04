import { describe, expect, it } from "vitest";
import {
  actionRisk,
  maxRisk,
  requiredApproval,
  riskFromBlast,
  willBullets,
} from "@/lib/risk";
import { CATEGORIES, type ActionCategory, type ActionRecord } from "@/lib/types";

type A = Pick<ActionRecord, "category" | "tier" | "payload"> & { injection_flag?: boolean };

function action(category: ActionCategory, payload: Record<string, unknown> = {}): A {
  const meta = CATEGORIES[category];
  return { category, tier: meta.pinned ? 3 : meta.defaultTier, payload };
}

describe("four-level risk", () => {
  it("reads a search as low and a payment as critical", () => {
    expect(actionRisk(action("search")).level).toBe("low");
    expect(actionRisk(action("draft")).level).toBe("low");
    expect(actionRisk(action("update_record")).level).toBe("medium");
    expect(actionRisk(action("send_email")).level).toBe("high");
    expect(actionRisk(action("payment")).level).toBe("critical");
  });

  it("always explains itself — a badge without a reason is decoration", () => {
    for (const category of Object.keys(CATEGORIES) as ActionCategory[]) {
      const risk = actionRisk(action(category));
      expect(risk.because.length).toBeGreaterThan(10);
      expect(risk.because.endsWith(".")).toBe(true);
    }
  });

  it("escalates on a large amount, and says which threshold it crossed", () => {
    const small = actionRisk(action("spend", { amount_cents: 1_000 }));
    expect(small.level).toBe("high");
    const big = actionRisk(action("spend", { amount_cents: 250_000 }));
    expect(big.level).toBe("critical");
    expect(big.because).toMatch(/\$2,500\.00/);
  });

  it("escalates on breadth — many records at once is not a medium", () => {
    const wide = actionRisk(action("update_record", { count: 400 }));
    expect(wide.level).toBe("high");
    expect(wide.because).toMatch(/400 items/);
  });

  it("never lowers a category floor, whatever the payload says", () => {
    const cheapRefund = actionRisk(action("refund", { amount_cents: 1 }));
    expect(cheapRefund.level).toBe("critical");
    const emptyDelete = actionRisk(action("delete", {}));
    expect(emptyDelete.level).toBe("critical");
  });

  it("treats an injection-flagged action as high at minimum, and says why", () => {
    const flagged = actionRisk({ ...action("search"), injection_flag: true });
    expect(flagged.level).toBe("high");
    expect(flagged.because).toMatch(/outside content/i);
    // Still can't drag a critical action downward.
    expect(actionRisk({ ...action("payment"), injection_flag: true }).level).toBe("critical");
  });

  it("keeps the ladder ordered", () => {
    expect(maxRisk("low", "critical")).toBe("critical");
    expect(maxRisk("high", "medium")).toBe("high");
  });
});

describe("blast level → the same four words", () => {
  it("maps the engine's five levels onto four", () => {
    expect(riskFromBlast("minimal")).toBe("low");
    expect(riskFromBlast("low")).toBe("low");
    expect(riskFromBlast("moderate")).toBe("medium");
    expect(riskFromBlast("high")).toBe("high");
    expect(riskFromBlast("severe")).toBe("critical");
  });

  it("never reads an unknown level as safe", () => {
    expect(riskFromBlast("something-new")).toBe("high");
  });
});

describe("who has to say yes", () => {
  it("names the human step, never a tier number", () => {
    expect(requiredApproval({ category: "search", tier: 1 })).toMatch(/automatically/);
    expect(requiredApproval({ category: "update_record", tier: 2 })).toBe("your approval");
    expect(requiredApproval({ category: "send_email", tier: 2 })).toBe("your signature");
    expect(requiredApproval({ category: "delete", tier: 3 })).toBe("your signature");
  });
});

describe("what it will do", () => {
  it("lists concrete consequences, ending with reversibility", () => {
    const bullets = willBullets(action("payment", { amount_cents: 4_999 }));
    expect(bullets.some((b) => b.includes("$49.99"))).toBe(true);
    expect(bullets[bullets.length - 1]).toMatch(/cannot be undone/);
  });

  it("says a read-only action changes nothing", () => {
    const bullets = willBullets(action("search"));
    expect(bullets[0]).toMatch(/nothing changes/);
  });

  it("names the connected app for a connector call", () => {
    const bullets = willBullets({
      category: "connection_call",
      tier: 2,
      payload: { provider: "github", connection_name: "GitHub" },
    });
    expect(bullets.some((b) => b.includes("GitHub"))).toBe(true);
  });

  it("never throws on a hostile or empty payload", () => {
    expect(() => willBullets({ category: "delete", tier: 3, payload: {} })).not.toThrow();
    expect(() =>
      willBullets({ category: "spend", tier: 2, payload: { amount: "not a number" } })
    ).not.toThrow();
  });
});
