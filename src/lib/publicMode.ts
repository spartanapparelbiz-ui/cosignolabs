/**
 * Guest identity for the public sandbox. Pure + dependency-free so it is safe
 * to use from the edge middleware and the server alike.
 *
 * A guest is an anonymous visitor of a not-yet-provisioned deployment running
 * with COSIGNO_PUBLIC_MODE=1. Each guest gets a random, unguessable id in its
 * own reserved namespace (`guest_` + 128 bits of hex). The in-memory store
 * scopes every row by this id, so guests are isolated from one another; the
 * `guest_` prefix keeps these ids from ever colliding with real user ids or
 * reserved ids like the dev demo user. Because the sandbox performs no real
 * external actions and persists nothing, an unguessable random id is a
 * sufficient isolation boundary (no signing secret required).
 */

export const GUEST_COOKIE = "cosigno_guest";
/** Header the edge middleware forwards so the SAME request already sees the id. */
export const GUEST_HEADER = "x-cosigno-guest";

const GUEST_RE = /^guest_[0-9a-f]{32}$/;

export function isGuestId(id: string | null | undefined): id is string {
  return typeof id === "string" && GUEST_RE.test(id);
}

/** Mint a fresh guest id. Uses Web Crypto (present at the edge and in Node 18+). */
export function newGuestId(): string {
  const uuid = globalThis.crypto.randomUUID();
  return "guest_" + uuid.replace(/-/g, "");
}
