import { createHmac, randomUUID, timingSafeEqual, createHash } from "node:crypto";

/**
 * The Approval Token — the primitive that makes cosigno enforceable rather
 * than advisory.
 *
 * An agent does not "ask permission" and then proceed on the honor system. It
 * receives a token, and the tool boundary refuses to act without one. The
 * token is deliberately weak on purpose — it authorizes exactly ONE action:
 *
 *   · scoped     — one actor, one action type, one resource
 *   · bound      — carries a hash of the EXACT payload that was authorized, so
 *                  a token issued for a $48 refund cannot execute a $4,800 one
 *   · expiring   — seconds-to-minutes, not hours
 *   · single-use — a jti that is burned on first verification (replay-proof)
 *   · revocable  — can be killed mid-flight before it is spent
 *   · attributable — carries the decision id, so the ledger can always answer
 *                  "which policy and which human authorized this?"
 *
 * Signed with HMAC-SHA256. Verification is constant-time. The signing key is
 * server-only and never reaches a client bundle.
 */

const VERSION = "cg1";

export interface TokenClaims {
  /** Unique token id — burned on first use. */
  jti: string;
  /** Organization the token was issued to. */
  org: string;
  /** The non-human (or human) principal this authorizes. */
  actor: string;
  /** Action type, e.g. "refund.issue". */
  action: string;
  /** Stable identifier for the target resource. */
  resource: string;
  /** SHA-256 of the canonicalized payload this token authorizes. */
  payload_hash: string;
  /** The decision that issued this token — the ledger anchor. */
  decision_id: string;
  /** Authority under which it was granted. */
  authority: "auto" | "approve" | "sign";
  /** Issued-at / expiry, epoch seconds. */
  iat: number;
  exp: number;
}

export type VerifyFailure =
  | "malformed"
  | "bad_signature"
  | "expired"
  | "replayed"
  | "revoked"
  | "payload_mismatch"
  | "wrong_action"
  | "wrong_actor";

export type VerifyResult =
  | { valid: true; claims: TokenClaims }
  | { valid: false; reason: VerifyFailure };

/* -------------------------------------------------------------------------- */
/* signing key                                                                 */
/* -------------------------------------------------------------------------- */

/**
 * The dev fallback key is pinned to globalThis, not a module-level binding.
 * Route handlers are separate module instances: a per-module key would make a
 * token signed by /authorize fail verification in /tokens/verify — the layer
 * would appear to work while silently rejecting every legitimate token.
 */
const keyRegistry = globalThis as unknown as { __cosignoAuthzDevKey?: string };

function signingKey(): string {
  const configured = process.env.COSIGNO_AUTHZ_SIGNING_KEY?.trim();
  if (configured) return configured;
  if (process.env.NODE_ENV === "production") {
    // Fail closed: an unsigned authorization layer is worse than none.
    throw new Error("COSIGNO_AUTHZ_SIGNING_KEY is required in production");
  }
  if (!keyRegistry.__cosignoAuthzDevKey) {
    keyRegistry.__cosignoAuthzDevKey = randomUUID() + randomUUID();
    console.warn(
      "[cosigno] COSIGNO_AUTHZ_SIGNING_KEY unset — using an ephemeral dev key (tokens won't survive a restart)."
    );
  }
  return keyRegistry.__cosignoAuthzDevKey;
}

/* -------------------------------------------------------------------------- */
/* canonical hashing                                                           */
/* -------------------------------------------------------------------------- */

/**
 * Deterministic JSON: object keys sorted at every depth, so an identical
 * payload always hashes identically regardless of key order in transit.
 */
export function canonicalize(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value) ?? "null";
  if (Array.isArray(value)) return `[${value.map(canonicalize).join(",")}]`;
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, v]) => v !== undefined)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${canonicalize(v)}`).join(",")}}`;
}

/** SHA-256 of the canonical form — the payload binding. */
export function hashPayload(payload: unknown): string {
  return createHash("sha256").update(canonicalize(payload)).digest("hex");
}

/* -------------------------------------------------------------------------- */
/* sign / verify                                                               */
/* -------------------------------------------------------------------------- */

const b64u = (b: Buffer) => b.toString("base64url");

function sign(body: string): string {
  return createHmac("sha256", signingKey()).update(body).digest("base64url");
}

export interface IssueInput {
  org: string;
  actor: string;
  action: string;
  resource: string;
  payload: unknown;
  decision_id: string;
  authority: "auto" | "approve" | "sign";
  /** Lifetime in seconds. Clamped to [5, 900] — tokens are not sessions. */
  ttl_seconds?: number;
}

export function issueToken(input: IssueInput): { token: string; claims: TokenClaims } {
  const now = Math.floor(Date.now() / 1000);
  const ttl = Math.min(900, Math.max(5, Math.floor(input.ttl_seconds ?? 120)));
  const claims: TokenClaims = {
    jti: randomUUID(),
    org: input.org,
    actor: input.actor,
    action: input.action,
    resource: input.resource,
    payload_hash: hashPayload(input.payload),
    decision_id: input.decision_id,
    authority: input.authority,
    iat: now,
    exp: now + ttl,
  };
  const body = b64u(Buffer.from(JSON.stringify(claims)));
  return { token: `${VERSION}.${body}.${sign(body)}`, claims };
}

/** Decode + signature check only. Does NOT consume the token. */
export function readToken(token: string): VerifyResult {
  const parts = token.split(".");
  if (parts.length !== 3 || parts[0] !== VERSION) return { valid: false, reason: "malformed" };
  const [, body, sig] = parts;

  const expected = Buffer.from(sign(body));
  const given = Buffer.from(sig);
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) {
    return { valid: false, reason: "bad_signature" };
  }

  let claims: TokenClaims;
  try {
    claims = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as TokenClaims;
  } catch {
    return { valid: false, reason: "malformed" };
  }
  if (!claims?.jti || !claims.action || !claims.payload_hash) {
    return { valid: false, reason: "malformed" };
  }
  if (claims.exp * 1000 <= Date.now()) return { valid: false, reason: "expired" };
  return { valid: true, claims };
}

export interface VerifyExpectation {
  /** The action about to be executed — must match what was authorized. */
  action?: string;
  /** The actor presenting the token. */
  actor?: string;
  /** The EXACT payload about to be executed — re-hashed and compared. */
  payload?: unknown;
}

/**
 * Full verification at the tool boundary. `consume` burns the jti; `isSpent`
 * and `isRevoked` are supplied by the caller so this stays pure and testable.
 */
export function verifyToken(
  token: string,
  expect: VerifyExpectation,
  state: {
    isSpent: (jti: string) => boolean;
    isRevoked: (jti: string) => boolean;
    consume: (jti: string) => void;
  }
): VerifyResult {
  const read = readToken(token);
  if (!read.valid) return read;
  const { claims } = read;

  if (state.isRevoked(claims.jti)) return { valid: false, reason: "revoked" };
  if (state.isSpent(claims.jti)) return { valid: false, reason: "replayed" };
  if (expect.action !== undefined && expect.action !== claims.action) {
    return { valid: false, reason: "wrong_action" };
  }
  if (expect.actor !== undefined && expect.actor !== claims.actor) {
    return { valid: false, reason: "wrong_actor" };
  }
  if (expect.payload !== undefined && hashPayload(expect.payload) !== claims.payload_hash) {
    return { valid: false, reason: "payload_mismatch" };
  }

  state.consume(claims.jti);
  return { valid: true, claims };
}
