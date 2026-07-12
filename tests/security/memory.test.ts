import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryStore } from "../../src/lib/store/memory";
import { resetRateLimitsForTests } from "../../src/lib/ratelimit";
import { memorySummary } from "../../src/lib/memory";
import { buildSystemPrompt } from "../../src/lib/agent/systemPrompt";

/**
 * Memory is user-controlled planner context: only enabled notes reach the
 * planner, the master switch cuts everything off, users are isolated, and
 * account deletion sweeps it. The agent has no write path.
 */

const currentUser = vi.hoisted(() => ({ id: "user-a" }));
vi.mock("@/lib/auth", () => ({
  clerkConfigured: () => true,
  DEMO_USER_ID: "demo-user",
  getUserId: vi.fn(async () => currentUser.id),
}));

let store: MemoryStore;

function jsonReq(url: string, method: string, body?: unknown) {
  return new NextRequest(url, {
    method,
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    headers: { "Content-Type": "application/json" },
  });
}

beforeEach(() => {
  store = new MemoryStore();
  (globalThis as Record<string, unknown>).__cosignoStore = store;
  resetRateLimitsForTests();
  currentUser.id = "user-a";
});

describe("memorySummary — what the planner actually sees", () => {
  it("includes only ENABLED notes, and nothing when the master switch is off", async () => {
    await store.createMemory("user-a", "keep replies under 100 words");
    const off = await store.createMemory("user-a", "secret preference");
    await store.updateMemory("user-a", off.id, { enabled: false });

    const summary = await memorySummary("user-a");
    expect(summary).toContain("keep replies under 100 words");
    expect(summary).not.toContain("secret preference");

    await store.setMemoryEnabled("user-a", false);
    expect(await memorySummary("user-a")).toBe("");
  });

  it("is bounded — a pathological memory set can't blow up the prompt", async () => {
    for (let i = 0; i < 30; i++) await store.createMemory("user-a", `note ${i}`);
    const summary = await memorySummary("user-a");
    expect(summary.split("\n").length).toBeLessThanOrEqual(12);
  });

  it("reaches the system prompt as a clearly-labeled user section", async () => {
    const prompt = buildSystemPrompt("", "- keep replies short");
    expect(prompt).toMatch(/saved user context/i);
    expect(prompt).toContain("keep replies short");
    // absent memory → no section
    expect(buildSystemPrompt("")).not.toMatch(/saved user context/i);
  });
});

describe("API: CRUD is owner-scoped", () => {
  it("create → list → edit → toggle → delete, all for the right user", async () => {
    const { POST, GET, PATCH } = await import("../../src/app/api/memory/route");
    const created = await POST(jsonReq("http://x/api/memory", "POST", { content: "prefers mornings" }));
    expect(created.status).toBe(200);
    const { memory } = await created.json();

    const listed = await (await GET()).json();
    expect(listed.memories).toHaveLength(1);
    expect(listed.memory_enabled).toBe(true);

    const { PATCH: PATCH_ID, DELETE } = await import("../../src/app/api/memory/[id]/route");
    const params = { params: Promise.resolve({ id: memory.id }) };
    await PATCH_ID(jsonReq(`http://x/api/memory/${memory.id}`, "PATCH", { content: "prefers afternoons" }), params);
    expect((await store.listMemories("user-a"))[0].content).toBe("prefers afternoons");

    // user B can't touch it
    currentUser.id = "user-b";
    const foreign = await PATCH_ID(jsonReq(`http://x/api/memory/${memory.id}`, "PATCH", { enabled: false }), params);
    expect(foreign.status).toBe(404);
    currentUser.id = "user-a";

    // master switch via collection PATCH
    await PATCH(jsonReq("http://x/api/memory", "PATCH", { memory_enabled: false }));
    expect((await store.getPrefs("user-a")).memory_enabled).toBe(false);

    await DELETE(jsonReq(`http://x/api/memory/${memory.id}`, "DELETE"), params);
    expect(await store.listMemories("user-a")).toHaveLength(0);
  });
});

describe("account cascade", () => {
  it("deleteAllUserData sweeps memories and prefs", async () => {
    await store.createMemory("user-a", "note");
    await store.setMemoryEnabled("user-a", false);
    await store.deleteAllUserData("user-a");
    expect(await store.listMemories("user-a")).toHaveLength(0);
    expect((await store.getPrefs("user-a")).memory_enabled).toBe(true); // back to default
  });
});
