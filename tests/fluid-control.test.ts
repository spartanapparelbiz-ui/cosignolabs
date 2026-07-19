import { beforeEach, describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { approveAction } from "../src/lib/actions/engine";
import { runCommand } from "../src/lib/agent/pipeline";
import { whyMe } from "../src/lib/clarity";
import { replayOf } from "../src/lib/state";
import { getStore } from "../src/lib/store";
import { MemoryStore } from "../src/lib/store/memory";
import {
  activeGrantFor,
  resolveTier,
  temporaryAuthorityAllowed,
} from "../src/lib/tiers";
import type { TemporaryAuthorityRecord } from "../src/lib/types";

const USER = "test-user";

function freshStore(): MemoryStore {
  const store = new MemoryStore();
  (globalThis as unknown as { __cosignoStore?: unknown }).__cosignoStore = store;
  return store;
}

beforeEach(() => {
  freshStore();
});

function grant(
  category: TemporaryAuthorityRecord["category"],
  minutesFromNow: number,
  revoked = false
): TemporaryAuthorityRecord {
  const now = Date.now();
  return {
    id: `g_${category}`,
    user_id: USER,
    category,
    tier: 1,
    expires_at: new Date(now + minutesFromNow * 60_000).toISOString(),
    note: null,
    created_at: new Date(now).toISOString(),
    revoked_at: revoked ? new Date(now).toISOString() : null,
  };
}

/* ------------------------------------------------------ temporary authority */

describe("temporary authority (scoped, expiring, never a boundary rental)", () => {
  it("a live grant lowers an eligible tier-2 category to auto", () => {
    expect(resolveTier("update_record", [], [grant("update_record", 60)])).toBe(1);
  });

  it("expired and revoked grants change nothing", () => {
    expect(resolveTier("update_record", [], [grant("update_record", -5)])).toBe(2);
    expect(resolveTier("update_record", [], [grant("update_record", 60, true)])).toBe(2);
  });

  it("SIGN and pinned categories can never be granted — even with a stored row", () => {
    expect(temporaryAuthorityAllowed("send_email")).toBe(false);
    expect(temporaryAuthorityAllowed("spend")).toBe(false);
    expect(temporaryAuthorityAllowed("refund")).toBe(false);
    expect(temporaryAuthorityAllowed("update_record")).toBe(true);
    // Defense in depth: even if an ineligible row existed, the resolver ignores it.
    expect(resolveTier("send_email", [], [grant("send_email", 60)])).toBe(2);
    expect(resolveTier("refund", [], [grant("refund", 60)])).toBe(3);
    expect(activeGrantFor("send_email", [grant("send_email", 60)])).toBeNull();
  });

  it("grants never touch base settings — expiry restores the previous level by itself", () => {
    const grants = [grant("update_record", 60)];
    expect(resolveTier("update_record", [], grants)).toBe(1);
    // Same settings, no live grant → straight back to tier 2. Nothing to revert.
    expect(resolveTier("update_record", [], [])).toBe(2);
  });

  it("the API refuses ineligible categories", async () => {
    const { POST } = await import("../src/app/api/authority/route");
    const res = await POST(
      new NextRequest("http://localhost/api/authority", {
        method: "POST",
        body: JSON.stringify({ category: "send_email", minutes: 60 }),
        headers: { "Content-Type": "application/json" },
      })
    );
    expect(res.status).toBe(403);
  });

  it("grant → resolver lowers to auto → revoke → tier 2 again", async () => {
    const { GET, POST, DELETE } = await import("../src/app/api/authority/route");
    const res = await POST(
      new NextRequest("http://localhost/api/authority", {
        method: "POST",
        body: JSON.stringify({ category: "update_record", minutes: 60 }),
        headers: { "Content-Type": "application/json" },
      })
    );
    expect(res.status).toBe(200);
    const { grant: g } = await res.json();

    // Read back through the same authenticated door the pipeline would use.
    const live = (await (await GET()).json()).grants;
    expect(resolveTier("update_record", [], live)).toBe(1);

    const del = await DELETE(
      new NextRequest(`http://localhost/api/authority?id=${g.id}`, { method: "DELETE" })
    );
    expect(del.status).toBe(200);
    const after = (await (await GET()).json()).grants;
    expect(resolveTier("update_record", [], after)).toBe(2);
  });
});

/* ----------------------------------------------------------------- why me? */

describe("why me? — every handoff explains the boundary", () => {
  it("locked, external, routine, and held actions each get an honest reason", () => {
    expect(whyMe({ category: "payment", tier: 3, injection_flag: false })).toContain("moves money");
    expect(whyMe({ category: "send_email", tier: 2, injection_flag: false })).toContain(
      "outside your workspace"
    );
    expect(whyMe({ category: "update_record", tier: 2, injection_flag: false })).toContain(
      "one-click approval"
    );
    expect(whyMe({ category: "send_email", tier: 2, injection_flag: true })).toContain(
      "External content"
    );
  });
});

/* ------------------------------------------------------------------ replay */

describe("delegation replay (operational history, never hidden reasoning)", () => {
  it("orders accepted → boundary → signed → executed, from the real record", async () => {
    const { session, actions } = await runCommand(USER, "send a follow-up email to john");
    const target = actions.find((a) => a.status === "proposed")!;
    await approveAction(USER, target.id, { signature: { name: "Nicholas" } });

    const store = getStore();
    const all = await store.listActions(USER, { session_id: session.id, limit: 100 });
    const ids = new Set(all.map((a) => a.id));
    const events = (await store.listEvents(USER)).filter((e) => ids.has(e.action_id));

    const lines = replayOf(events, all, session.created_at, session.title);
    const texts = lines.map((l) => l.text);

    expect(texts[0]).toContain("Delegation accepted");
    expect(texts.some((t) => t.startsWith("Boundary reached"))).toBe(true);
    expect(texts.some((t) => t.startsWith("Signed:"))).toBe(true);
    expect(texts.some((t) => t.startsWith("Completed:"))).toBe(true);
    // Chronological, oldest first.
    for (let i = 1; i < lines.length; i++) {
      expect(Date.parse(lines[i].at)).toBeGreaterThanOrEqual(Date.parse(lines[i - 1].at));
    }
  });
});
