import { beforeEach, describe, expect, it } from "vitest";
import {
  canonicalize,
  hashPayload,
  issueToken,
  readToken,
  verifyToken,
} from "@/lib/authz/token";

/**
 * The Approval Token is the enforcement primitive: if it can be forged,
 * replayed, or re-pointed at a different payload, the entire authorization
 * layer is decorative. These pin every one of those properties.
 */

const base = {
  org: "org_1",
  actor: "agent:support-bot",
  action: "refund.issue",
  resource: "ord_2231",
  decision_id: "dec_1",
  authority: "sign" as const,
};

function freshState() {
  const spent = new Set<string>();
  const revoked = new Set<string>();
  return {
    spent,
    revoked,
    isSpent: (j: string) => spent.has(j),
    isRevoked: (j: string) => revoked.has(j),
    consume: (j: string) => void spent.add(j),
  };
}

let state: ReturnType<typeof freshState>;
beforeEach(() => {
  state = freshState();
});

describe("canonical hashing", () => {
  it("is independent of key order", () => {
    expect(canonicalize({ a: 1, b: 2 })).toBe(canonicalize({ b: 2, a: 1 }));
    expect(hashPayload({ amount: 4800, id: "x" })).toBe(hashPayload({ id: "x", amount: 4800 }));
  });

  it("distinguishes different values, nesting, and types", () => {
    expect(hashPayload({ amount: 4800 })).not.toBe(hashPayload({ amount: 480000 }));
    expect(hashPayload({ a: { b: 1 } })).not.toBe(hashPayload({ a: { b: 2 } }));
    expect(hashPayload({ a: 1 })).not.toBe(hashPayload({ a: "1" }));
    expect(hashPayload([1, 2])).not.toBe(hashPayload([2, 1]));
  });
});

describe("issue + verify", () => {
  it("issues a token that verifies against the exact authorized payload", () => {
    const payload = { amount_cents: 4800, order: "ord_2231" };
    const { token } = issueToken({ ...base, payload });
    const res = verifyToken(token, { action: "refund.issue", payload }, state);
    expect(res.valid).toBe(true);
  });

  it("binds to the payload — a bigger refund cannot reuse a small one's token", () => {
    const { token } = issueToken({ ...base, payload: { amount_cents: 4800 } });
    const res = verifyToken(token, { payload: { amount_cents: 480000 } }, state);
    expect(res).toEqual({ valid: false, reason: "payload_mismatch" });
  });

  it("is single-use — the second presentation is a replay", () => {
    const payload = { amount_cents: 4800 };
    const { token } = issueToken({ ...base, payload });
    expect(verifyToken(token, { payload }, state).valid).toBe(true);
    expect(verifyToken(token, { payload }, state)).toEqual({ valid: false, reason: "replayed" });
  });

  it("rejects a tampered signature", () => {
    const { token } = issueToken({ ...base, payload: {} });
    const [v, body] = token.split(".");
    expect(verifyToken(`${v}.${body}.deadbeef`, {}, state)).toEqual({
      valid: false,
      reason: "bad_signature",
    });
  });

  it("rejects tampered claims (re-signing is required, and impossible without the key)", () => {
    const { token, claims } = issueToken({ ...base, payload: {} });
    const forged = { ...claims, authority: "auto", action: "payment.send" };
    const body = Buffer.from(JSON.stringify(forged)).toString("base64url");
    const sig = token.split(".")[2];
    expect(verifyToken(`cg1.${body}.${sig}`, {}, state).valid).toBe(false);
  });

  it("rejects a token whose action or actor does not match execution", () => {
    const { token } = issueToken({ ...base, payload: {} });
    expect(verifyToken(token, { action: "payment.send" }, freshState())).toEqual({
      valid: false,
      reason: "wrong_action",
    });
    expect(verifyToken(token, { actor: "agent:other" }, freshState())).toEqual({
      valid: false,
      reason: "wrong_actor",
    });
  });

  it("expires, and expiry is clamped to at most 15 minutes", () => {
    const { token } = issueToken({ ...base, payload: {}, ttl_seconds: -100 });
    // negative ttl clamps up to the 5s floor, so it is briefly valid…
    expect(readToken(token).valid).toBe(true);
    const long = issueToken({ ...base, payload: {}, ttl_seconds: 999_999 });
    expect(long.claims.exp - long.claims.iat).toBe(900);
  });

  it("honors revocation before spend", () => {
    const { token, claims } = issueToken({ ...base, payload: {} });
    state.revoked.add(claims.jti);
    expect(verifyToken(token, {}, state)).toEqual({ valid: false, reason: "revoked" });
  });

  it("rejects malformed tokens and foreign versions", () => {
    for (const bad of ["", "nope", "a.b", "cg9.x.y", "cg1..", "cg1.@@@.zzz"]) {
      expect(verifyToken(bad, {}, freshState()).valid).toBe(false);
    }
  });

  it("does not consume the token when verification fails", () => {
    const payload = { amount_cents: 1 };
    const { token } = issueToken({ ...base, payload });
    verifyToken(token, { payload: { amount_cents: 2 } }, state); // mismatch
    expect(state.spent.size).toBe(0);
    expect(verifyToken(token, { payload }, state).valid).toBe(true);
  });
});
