import { beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { MemoryStore } from "../src/lib/store/memory";
import { globalSearch } from "../src/lib/search/global";
import type { MissionRunState } from "../src/lib/types";

/**
 * One search across the workspace, and the constraint that keeps it honest: it
 * covers only what cosigno already holds. It does not reach into connected
 * systems — that would fire live API calls on every keystroke, and offering
 * "Customers" to someone with no CRM connected promises a category the product
 * cannot deliver.
 *
 * Everything it returns is a link. A result that goes nowhere is a dead end
 * wearing a costume.
 */

vi.mock("@/lib/auth", () => ({
  authConfigured: () => true,
  DEMO_USER_ID: "demo-user",
  getUserId: vi.fn(async () => "user-a"),
}));

const SEARCH_SRC = readFileSync("src/lib/search/global.ts", "utf8");
const BAR_SRC = readFileSync("src/components/app/CommandBar.tsx", "utf8");

const USER = "user-a";
let store: MemoryStore;

beforeEach(async () => {
  store = new MemoryStore();
  (globalThis as Record<string, unknown>).__cosignoStore = store;
});

async function seed() {
  const session = await store.createSession(USER, "t");
  await store.createMission({
    user_id: USER,
    session_id: session.id,
    goal: "fix the checkout bug",
  } as never);
  const m2 = await store.createMission({
    user_id: USER,
    session_id: session.id,
    goal: "tidy the inbox",
  } as never);
  await store.updateMission(USER, m2.id, {
    state: "completed" as MissionRunState,
    receipt: { completed_steps: [{ summary: "opened issue #7 in cosignolabs" }] },
  });
  await store.createAction({
    user_id: USER,
    session_id: session.id,
    category: "send_email",
    tier: 2,
    summary: "send the welcome email to Grace",
    payload: {},
  } as never);
  await store.createConnection({
    user_id: USER,
    kind: "app",
    provider_key: "github",
    display_name: "GitHub",
    status: "connected",
    auth_type: "oauth2",
    metadata: {},
  } as never);
  return session;
}

describe("it searches what cosigno actually holds", () => {
  it("finds a mission by its goal", async () => {
    await seed();
    const r = await globalSearch(USER, "checkout");
    expect(r.some((x) => x.kind === "mission" && /checkout/i.test(x.title))).toBe(true);
  });

  it("finds a mission by what it ACHIEVED, not just what was asked", async () => {
    await seed();
    // People remember "issue #7" far more often than the words they typed.
    const r = await globalSearch(USER, "issue #7");
    expect(r.some((x) => x.kind === "mission")).toBe(true);
  });

  it("finds a decision that is waiting", async () => {
    await seed();
    const r = await globalSearch(USER, "grace");
    const decision = r.find((x) => x.kind === "decision");
    expect(decision?.subtitle).toMatch(/waiting for your approval/i);
  });

  it("finds a connected app", async () => {
    await seed();
    const r = await globalSearch(USER, "github");
    expect(r.some((x) => x.kind === "app" && x.providerKey === "github")).toBe(true);
  });

  it("finds the pages themselves", async () => {
    const r = await globalSearch(USER, "approvals");
    expect(r.some((x) => x.kind === "page" && x.href === "/app/approvals")).toBe(true);
  });

  it("returns nothing for a query that matches nothing", async () => {
    await seed();
    expect(await globalSearch(USER, "zzzznothing")).toEqual([]);
  });

  it("returns nothing for an empty query rather than everything", async () => {
    await seed();
    expect(await globalSearch(USER, "   ")).toEqual([]);
  });
});

describe("every result goes somewhere", () => {
  it("no result lacks a destination", async () => {
    await seed();
    for (const q of ["checkout", "github", "grace", "approvals", "inbox"]) {
      for (const r of await globalSearch(USER, q)) {
        expect(r.href).toBeTruthy();
        expect(r.href.startsWith("/")).toBe(true);
        expect(r.title.trim().length).toBeGreaterThan(0);
      }
    }
  });

  it("puts waiting decisions before everything else", async () => {
    await seed();
    // They are the only results that cost the reader something by being missed.
    const r = await globalSearch(USER, "e");
    const firstDecision = r.findIndex((x) => x.kind === "decision");
    const firstMission = r.findIndex((x) => x.kind === "mission");
    if (firstDecision !== -1 && firstMission !== -1) {
      expect(firstDecision).toBeLessThan(firstMission);
    }
  });
});

describe("it never reaches into a connected system", () => {
  it("makes no provider calls", async () => {
    // Searching live APIs per keystroke would hammer someone else's rate limit.
    expect(SEARCH_SRC).not.toMatch(/runProviderAction|runMcpTool|discoverConnection|fetch\(/);
  });

  it("offers no category the product can't deliver", async () => {
    await seed();
    const kinds = new Set(
      (await globalSearch(USER, "e")).map((r) => r.kind)
    );
    for (const k of kinds) {
      expect(["mission", "decision", "app", "file", "page"]).toContain(k);
    }
  });
});

describe("the command bar behaves", () => {
  it("opens on the shortcut and closes on escape", () => {
    expect(BAR_SRC).toMatch(/metaKey \|\| e\.ctrlKey/);
    expect(BAR_SRC).toMatch(/e\.key === "Escape"/);
  });

  it("is keyboard navigable", () => {
    expect(BAR_SRC).toMatch(/ArrowDown/);
    expect(BAR_SRC).toMatch(/ArrowUp/);
    expect(BAR_SRC).toMatch(/e\.key === "Enter"/);
  });

  it("says plainly when nothing matched", () => {
    // An empty box makes the reader guess whether it is broken or empty.
    expect(BAR_SRC).toMatch(/Nothing here matches/);
  });

  it("offers a way forward instead of ending on a dead end", () => {
    // Nothing matching a search is the single most common moment to lose
    // someone. What they typed is a job description often enough that handing
    // it to the operator is a better answer than an apology.
    expect(BAR_SRC).toMatch(/Make it a mission instead/);
    expect(BAR_SRC).toMatch(/cosigno:compose/);
  });

  it("shows real work before anything is typed, never a blank panel", () => {
    expect(BAR_SRC).toMatch(/recent=1/);
    expect(BAR_SRC).toMatch(/Recent searches/);
  });

  it("debounces rather than firing per keystroke", () => {
    expect(BAR_SRC).toMatch(/setTimeout\(/);
    expect(BAR_SRC).toMatch(/clearTimeout\(/);
  });

  it("is announced as a dialog", () => {
    expect(BAR_SRC).toMatch(/role="dialog"/);
    expect(BAR_SRC).toMatch(/aria-modal="true"/);
  });
});
