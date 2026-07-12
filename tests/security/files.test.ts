import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryStore } from "../../src/lib/store/memory";
import { resetRateLimitsForTests } from "../../src/lib/ratelimit";

/**
 * Files are owner-scoped text documents: CRUD stays inside the owner's
 * account, every edit bumps the version, unsupported mime types are
 * rejected, and account deletion sweeps everything.
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

describe("API: file CRUD is owner-scoped and versioned", () => {
  it("create → list → open → edit (version bump) → delete", async () => {
    const { POST, GET } = await import("../../src/app/api/files/route");
    const created = await POST(
      jsonReq("http://x/api/files", "POST", {
        name: "launch-notes",
        mime: "text/markdown",
        content: "# day one",
      })
    );
    expect(created.status).toBe(200);
    const { file } = await created.json();
    expect(file.version).toBe(1);

    const listed = await (await GET()).json();
    expect(listed.files).toHaveLength(1);

    const idRoute = await import("../../src/app/api/files/[id]/route");
    const params = { params: Promise.resolve({ id: file.id }) };

    const opened = await idRoute.GET(jsonReq(`http://x/api/files/${file.id}`, "GET"), params);
    expect((await opened.json()).file.content).toBe("# day one");

    const patched = await idRoute.PATCH(
      jsonReq(`http://x/api/files/${file.id}`, "PATCH", { content: "# day two" }),
      params
    );
    const after = (await patched.json()).file;
    expect(after.version).toBe(2);
    expect(after.content).toBe("# day two");

    await idRoute.DELETE(jsonReq(`http://x/api/files/${file.id}`, "DELETE"), params);
    expect(await store.listFiles("user-a")).toHaveLength(0);
  });

  it("another user gets 404 on open/edit and their delete is a no-op", async () => {
    const mine = await store.createFile({
      user_id: "user-a",
      name: "private",
      mime: "text/plain",
      content: "mine",
    });
    const idRoute = await import("../../src/app/api/files/[id]/route");
    const params = { params: Promise.resolve({ id: mine.id }) };

    currentUser.id = "user-b";
    expect((await idRoute.GET(jsonReq(`http://x/api/files/${mine.id}`, "GET"), params)).status).toBe(404);
    expect(
      (await idRoute.PATCH(jsonReq(`http://x/api/files/${mine.id}`, "PATCH", { content: "stolen" }), params)).status
    ).toBe(404);
    await idRoute.DELETE(jsonReq(`http://x/api/files/${mine.id}`, "DELETE"), params);

    expect(await store.listFiles("user-a")).toHaveLength(1);
    expect((await store.getFile("user-a", mine.id))?.content).toBe("mine");
  });

  it("rejects unsupported mime types and privileged fields", async () => {
    const { POST } = await import("../../src/app/api/files/route");
    const binary = await POST(
      jsonReq("http://x/api/files", "POST", { name: "evil", mime: "application/pdf", content: "x" })
    );
    expect(binary.status).toBe(400);

    const privileged = await POST(
      jsonReq("http://x/api/files", "POST", {
        name: "sneaky",
        mime: "text/plain",
        content: "x",
        user_id: "someone-else",
      })
    );
    expect(privileged.status).toBe(400);
    expect((await privileged.json()).error).toBe("privileged_field");
  });

  it("empty PATCH body is rejected — no silent version bumps", async () => {
    const f = await store.createFile({ user_id: "user-a", name: "n", mime: "text/plain", content: "c" });
    const idRoute = await import("../../src/app/api/files/[id]/route");
    const res = await idRoute.PATCH(
      jsonReq(`http://x/api/files/${f.id}`, "PATCH", {}),
      { params: Promise.resolve({ id: f.id }) }
    );
    expect(res.status).toBe(400);
    expect((await store.getFile("user-a", f.id))?.version).toBe(1);
  });
});

describe("account cascade", () => {
  it("deleteAllUserData sweeps files", async () => {
    await store.createFile({ user_id: "user-a", name: "a", mime: "text/plain", content: "1" });
    await store.createFile({ user_id: "user-a", name: "b", mime: "text/csv", content: "2" });
    await store.deleteAllUserData("user-a");
    expect(await store.listFiles("user-a")).toHaveLength(0);
  });
});
