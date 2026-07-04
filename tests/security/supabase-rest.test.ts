import { describe, expect, it } from "vitest";

/**
 * §3/§8 test 4 — direct Supabase REST calls with ONLY the public anon key
 * (exactly what an attacker extracts from the JS bundle) must be denied:
 *   (a) reading other users' actions   → zero rows
 *   (b) inserting an action            → error
 *   (c) updating a status to executed  → error / zero rows affected
 *
 * Runs whenever Supabase env vars are configured (locally against a real
 * project or in CI with a staging project); skipped otherwise since there
 * is no database to attack.
 */

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

const configured = Boolean(URL && ANON);

function rest(path: string, init: RequestInit = {}) {
  return fetch(`${URL}/rest/v1/${path}`, {
    ...init,
    headers: {
      apikey: ANON!,
      Authorization: `Bearer ${ANON}`,
      "Content-Type": "application/json",
      ...init.headers,
    },
  });
}

describe.skipIf(!configured)("anon-key Supabase REST attack surface", () => {
  it("(a) selecting actions returns zero rows", async () => {
    const res = await rest("actions?select=*&limit=50");
    if (res.ok) {
      const rows = await res.json();
      expect(Array.isArray(rows)).toBe(true);
      expect(rows.length).toBe(0);
    } else {
      expect(res.status).toBeGreaterThanOrEqual(400);
    }
  });

  it("(b) inserting an action is denied", async () => {
    const res = await rest("actions", {
      method: "POST",
      body: JSON.stringify({
        session_id: "11111111-1111-4111-8111-111111111111",
        user_id: "attacker",
        category: "payment",
        tier: 1,
        status: "executed",
        summary: "attacker insert",
        payload: {},
      }),
    });
    expect(res.ok).toBe(false);
    expect(res.status).toBeGreaterThanOrEqual(400);
  });

  it("(c) updating status to executed is denied", async () => {
    const res = await rest("actions?status=eq.proposed", {
      method: "PATCH",
      headers: { Prefer: "return=representation" },
      body: JSON.stringify({ status: "executed" }),
    });
    if (res.ok) {
      // If PostgREST returns 2xx, RLS must have matched zero rows.
      const rows = await res.json();
      expect(rows.length).toBe(0);
    } else {
      expect(res.status).toBeGreaterThanOrEqual(400);
    }
  });

  it("beta_applications is not readable with the anon key", async () => {
    const res = await rest("beta_applications?select=*");
    if (res.ok) {
      expect((await res.json()).length).toBe(0);
    } else {
      expect(res.status).toBeGreaterThanOrEqual(400);
    }
  });
});
