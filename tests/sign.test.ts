import { beforeEach, describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { approveAction } from "../src/lib/actions/engine";
import { runCommand } from "../src/lib/agent/pipeline";
import { classifyDelegation } from "../src/lib/delegate";
import { signRequired } from "../src/lib/sign";
import { authorizationHash } from "../src/lib/signRecord";
import { installedKeys, installSkill, SKILLS, uninstallSkill } from "../src/lib/skills";
import { getStore } from "../src/lib/store";
import { MemoryStore } from "../src/lib/store/memory";

const USER = "test-user";

function freshStore(): MemoryStore {
  const store = new MemoryStore();
  (globalThis as unknown as { __cosignoStore?: unknown }).__cosignoStore = store;
  return store;
}

beforeEach(() => {
  freshStore();
});

/* ------------------------------------------------------------ sign levels */

describe("authorization levels (auto / approve / sign)", () => {
  it("all tier-3 actions require the SIGN interaction", () => {
    expect(signRequired("delete", 3)).toBe(true);
    expect(signRequired("refund", 3)).toBe(true);
    expect(signRequired("payment", 3)).toBe(true);
  });

  it("outward-facing tier-2 actions sign; internal tier-2 stays one click", () => {
    expect(signRequired("send_email", 2)).toBe(true);
    expect(signRequired("post_content", 2)).toBe(true);
    expect(signRequired("spend", 2)).toBe(true);
    expect(signRequired("update_record", 2)).toBe(false);
    expect(signRequired("connection_call", 2)).toBe(false);
  });

  it("tier-1 never signs — it's pre-authorized auto", () => {
    expect(signRequired("search", 1)).toBe(false);
    expect(signRequired("draft", 1)).toBe(false);
  });
});

/* ----------------------------------------------------- authorization record */

describe("signed approvals seal a tamper-evident authorization record", () => {
  it("a signed approval records method, name, and a verifiable hash", async () => {
    const { actions } = await runCommand(USER, "clear my inbox of newsletters");
    const tier2 = actions.find((a) => a.tier === 2)!;

    await approveAction(USER, tier2.id, {
      signature: { name: "Nicholas", image: "data:image/png;base64,aGk=" },
    });

    const events = await getStore().listEvents(USER, tier2.id);
    const approved = events.find((e) => e.type === "approved")!;
    const auth = (approved.detail as Record<string, unknown>).authorization as {
      method: string;
      signed_name: string | null;
      authorized_at: string;
      record_hash: string;
      signature_image?: string;
    };

    expect(auth.method).toBe("signed");
    expect(auth.signed_name).toBe("Nicholas");
    expect(auth.signature_image).toBe("data:image/png;base64,aGk=");

    // The hash recomputes from the sealed fields — any tampering shows.
    const final = await getStore().getAction(USER, tier2.id);
    const recomputed = authorizationHash({
      user_id: USER,
      action_id: tier2.id,
      category: tier2.category,
      tier: tier2.tier,
      method: "signed",
      signed_name: "Nicholas",
      summary: tier2.summary,
      payload: final!.payload,
      authorized_at: auth.authorized_at,
    });
    expect(recomputed).toBe(auth.record_hash);
    // …and a doctored payload does NOT reproduce it.
    const doctored = authorizationHash({
      user_id: USER,
      action_id: tier2.id,
      category: tier2.category,
      tier: tier2.tier,
      method: "signed",
      signed_name: "Nicholas",
      summary: tier2.summary,
      payload: { ...final!.payload, to: "attacker@example.com" },
      authorized_at: auth.authorized_at,
    });
    expect(doctored).not.toBe(auth.record_hash);
  });

  it("a one-click approval records method 'approved' with no signature", async () => {
    const { actions } = await runCommand(USER, "clear my inbox of newsletters");
    const tier2 = actions.find((a) => a.tier === 2)!;
    await approveAction(USER, tier2.id, {});
    const events = await getStore().listEvents(USER, tier2.id);
    const auth = (events.find((e) => e.type === "approved")!.detail as Record<string, unknown>)
      .authorization as { method: string; signed_name: string | null; record_hash: string };
    expect(auth.method).toBe("approved");
    expect(auth.signed_name).toBeNull();
    expect(auth.record_hash).toMatch(/^[0-9a-f]{64}$/);
  });

  it("tier-3 still enforces its confirmation contract — signature or not", async () => {
    const { actions } = await runCommand(USER, "delete the old duplicates in my drive");
    const tier3 = actions.find((a) => a.tier === 3);
    if (!tier3) return; // planner shape may vary; the acceptance suite pins this
    await expect(
      approveAction(USER, tier3.id, { signature: { name: "Nicholas" } })
    ).rejects.toMatchObject({ code: "confirmation_required" });
  });
});

/* ------------------------------------------------------------ signature API */

describe("saved signature (Hold to Sign)", () => {
  it("PUT stores, GET returns, DELETE removes — bounded PNG only", async () => {
    const routes = await import("../src/app/api/signature/route");
    const put = await routes.PUT(
      new NextRequest("http://localhost/api/signature", {
        method: "PUT",
        body: JSON.stringify({ name: "Nicholas", image: "data:image/png;base64,aGk=" }),
        headers: { "Content-Type": "application/json" },
      })
    );
    expect(put.status).toBe(200);

    const got = await (await routes.GET()).json();
    expect(got.signature.name).toBe("Nicholas");

    // Non-PNG payloads are rejected at the schema.
    const bad = await routes.PUT(
      new NextRequest("http://localhost/api/signature", {
        method: "PUT",
        body: JSON.stringify({ name: "x", image: "data:text/html;base64,aGk=" }),
        headers: { "Content-Type": "application/json" },
      })
    );
    expect(bad.status).toBe(400);

    await routes.DELETE();
    const gone = await (await routes.GET()).json();
    expect(gone.signature).toBeNull();
  });
});

/* -------------------------------------------------------------- delegation */

describe("delegation classification (the user never picks the workflow)", () => {
  it("'watch for…' becomes a monitor-mode watch", () => {
    const intent = classifyDelegation("watch for important emails from investors");
    expect(intent.kind).toBe("watch");
    expect(intent.mode).toBe("monitor");
    expect(intent.interval_hours).toBe(1);
  });

  it("'tell me when…' and 'alert me…' are watches too", () => {
    expect(classifyDelegation("tell me when an order over $1,000 comes in").kind).toBe("watch");
    expect(classifyDelegation("alert me if MRR drops more than 10%").kind).toBe("watch");
  });

  it("a watch that asks for prepared responses uses prepare mode", () => {
    const intent = classifyDelegation("watch for refund requests and prepare replies");
    expect(intent.kind).toBe("watch");
    expect(intent.mode).toBe("prepare");
  });

  it("'every monday…' becomes a weekly prepare rule", () => {
    const intent = classifyDelegation("every monday, analyze ad performance and prepare recommendations");
    expect(intent.kind).toBe("automation");
    expect(intent.mode).toBe("prepare");
    expect(intent.interval_hours).toBe(168);
  });

  it("plain objectives stay missions", () => {
    expect(classifyDelegation("prepare everything for my investor meeting tomorrow").kind).toBe("mission");
    expect(classifyDelegation("clean up my inbox").kind).toBe("mission");
  });
});

/* ------------------------------------------------------------------ skills */

describe("skills install exactly what they say — and uninstall cleanly", () => {
  it("install creates the pack's rules; reinstall is idempotent", async () => {
    const store = getStore();
    const created = await installSkill(USER, "inbox-operator");
    expect(created).toBe(SKILLS.find((s) => s.key === "inbox-operator")!.items.length);

    const again = await installSkill(USER, "inbox-operator");
    expect(again).toBe(0); // nothing duplicated

    const automations = await store.listAutomations(USER);
    expect(installedKeys(automations).has("inbox-operator")).toBe(true);
    // Every rule is honest about its mode — monitor or prepare, never execute.
    for (const a of automations) {
      expect(["monitor", "prepare"]).toContain(a.mode);
    }
  });

  it("uninstall removes only that skill's rules", async () => {
    const store = getStore();
    await installSkill(USER, "inbox-operator");
    await installSkill(USER, "sales-operator");
    const removed = await uninstallSkill(USER, "inbox-operator");
    expect(removed).toBeGreaterThan(0);
    const left = await store.listAutomations(USER);
    expect(installedKeys(left).has("inbox-operator")).toBe(false);
    expect(installedKeys(left).has("sales-operator")).toBe(true);
  });
});
