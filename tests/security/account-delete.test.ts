import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryStore } from "../../src/lib/store/memory";
import { resetRateLimitsForTests } from "../../src/lib/ratelimit";

/**
 * Regression suite for the "account already exists on re-signup" bug. Root
 * cause: DELETE /api/account wiped app data but never deleted the auth user,
 * so the auth provider kept the email forever and any re-signup hit
 * "already registered". Pins: deletion removes the sign-in account too, a
 * retry after partial success stays green, a provider failure is surfaced
 * honestly (never a silent success), and sandbox identities never trigger a
 * provider call.
 */

const deleteUser = vi.fn<(id: string) => Promise<void>>(async () => undefined);

vi.mock("@/lib/supabaseAuth/admin", () => ({
  deleteAuthUser: (id: string) => deleteUser(id),
}));

vi.mock("@/lib/auth", () => ({
  authConfigured: vi.fn(() => true),
  DEMO_USER_ID: "demo-user",
  getUserId: vi.fn(async () => "user_2real"),
  getUserEmail: vi.fn(async () => "person@example.com"),
}));

import { authConfigured, getUserId } from "@/lib/auth";
import { DELETE } from "../../src/app/api/account/route";

let store: MemoryStore;
beforeEach(() => {
  store = new MemoryStore();
  (globalThis as Record<string, unknown>).__cosignoStore = store;
  resetRateLimitsForTests();
  deleteUser.mockClear();
  deleteUser.mockImplementation(async () => undefined);
  vi.mocked(getUserId).mockResolvedValue("user_2real");
  vi.mocked(authConfigured).mockReturnValue(true);
});

function deleteReq() {
  return new NextRequest("http://localhost/api/account", {
    method: "DELETE",
    body: JSON.stringify({ confirmation: "delete" }),
    headers: { "Content-Type": "application/json" },
  });
}

describe("account deletion fully frees the email for re-signup", () => {
  it("deletes the app data AND the sign-in account", async () => {
    await store.createSession("user_2real", "some work");
    const res = await DELETE(deleteReq());
    expect(res.status).toBe(200);
    expect(deleteUser).toHaveBeenCalledExactlyOnceWith("user_2real");
    expect(await store.listSessions("user_2real")).toHaveLength(0);
  });

  it("a retry after the sign-in account is already gone still succeeds", async () => {
    // the admin helper treats an already-deleted user (404) as success
    deleteUser.mockResolvedValueOnce(undefined);
    const res = await DELETE(deleteReq());
    expect(res.status).toBe(200);
  });

  it("a provider failure is reported honestly, never as success", async () => {
    deleteUser.mockRejectedValueOnce(new Error("auth admin is not configured"));
    const res = await DELETE(deleteReq());
    expect(res.status).toBe(502);
    const body = await res.json();
    expect(body.error).toBe("signin_cleanup_failed");
    expect(String(body.message)).toMatch(/couldn't be fully deleted/i);
  });

  it("demo and guest identities never reach the auth provider", async () => {
    vi.mocked(getUserId).mockResolvedValue("demo-user");
    vi.mocked(authConfigured).mockReturnValue(false);
    const res = await DELETE(deleteReq());
    expect(res.status).toBe(200);
    expect(deleteUser).not.toHaveBeenCalled();
  });
});
