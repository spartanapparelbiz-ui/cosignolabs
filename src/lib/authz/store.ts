import { createHash, randomUUID, timingSafeEqual } from "node:crypto";
import type { Decision } from "./decide";

/**
 * Authorization ledger + API keys.
 *
 * The ledger is APPEND-ONLY by construction: there is no update or delete
 * method on this module, deliberately. A decision, once written, is a
 * permanent record of who authorized what and under which policy.
 *
 * Storage: process memory, keyed on globalThis so it survives dev hot-reload.
 * This is the correct shape for the v1 API and for demo mode; the durable
 * Supabase implementation lands with migration 0021 (schema included in
 * supabase/migrations) and slots in behind this same interface.
 */

export interface DecisionRecord {
  id: string;
  org: string;
  actor: string;
  action: string;
  resource: string;
  payload_hash: string;
  status: Decision["status"];
  authority: Decision["authority"];
  tier: number;
  blast_level: string;
  blast_score: number;
  policy_trace: Decision["policy_trace"];
  token_jti: string | null;
  /** Set when a token is presented at the tool boundary. */
  executed_at: string | null;
  created_at: string;
}

export interface ApiKeyRecord {
  id: string;
  org: string;
  name: string;
  /** SHA-256 of the key. The key itself is shown once, at creation, and never stored. */
  hash: string;
  created_at: string;
}

interface Registry {
  decisions: DecisionRecord[];
  keys: ApiKeyRecord[];
  spent: Set<string>;
  revoked: Set<string>;
}

const g = globalThis as unknown as { __cosignoAuthz?: Registry };
const registry: Registry = g.__cosignoAuthz ?? {
  decisions: [],
  keys: [],
  spent: new Set(),
  revoked: new Set(),
};
g.__cosignoAuthz = registry;

/* ----------------------------- api keys ---------------------------------- */

export function hashKey(key: string): string {
  return createHash("sha256").update(key).digest("hex");
}

/** Mint a key. The plaintext is returned ONCE and never persisted. */
export function createApiKey(org: string, name: string): { key: string; record: ApiKeyRecord } {
  const key = `csk_live_${randomUUID().replace(/-/g, "")}${randomUUID().replace(/-/g, "").slice(0, 8)}`;
  const record: ApiKeyRecord = {
    id: `key_${randomUUID().slice(0, 8)}`,
    org,
    name,
    hash: hashKey(key),
    created_at: new Date().toISOString(),
  };
  registry.keys.push(record);
  return { key, record };
}

/** Constant-time key lookup. Returns the owning org, or null. */
export function orgForKey(presented: string): string | null {
  const want = Buffer.from(hashKey(presented));
  for (const k of registry.keys) {
    const have = Buffer.from(k.hash);
    if (have.length === want.length && timingSafeEqual(have, want)) return k.org;
  }
  return null;
}

export function listApiKeys(org: string): ApiKeyRecord[] {
  return registry.keys.filter((k) => k.org === org);
}

/* ------------------------------ ledger ----------------------------------- */

export function appendDecision(rec: Omit<DecisionRecord, "id" | "created_at">): DecisionRecord {
  const full: DecisionRecord = {
    ...rec,
    id: `dec_${randomUUID().replace(/-/g, "").slice(0, 16)}`,
    created_at: new Date().toISOString(),
  };
  registry.decisions.push(full);
  return full;
}

/** Records the moment a token was actually spent at the tool boundary. */
export function markExecuted(decisionId: string): void {
  const d = registry.decisions.find((x) => x.id === decisionId);
  if (d && !d.executed_at) d.executed_at = new Date().toISOString();
}

export function listDecisions(org: string, limit = 50): DecisionRecord[] {
  return registry.decisions
    .filter((d) => d.org === org)
    .slice(-limit)
    .reverse();
}

export function countPriorClean(org: string, actor: string, action: string): number {
  return registry.decisions.filter(
    (d) => d.org === org && d.actor === actor && d.action === action && d.executed_at !== null
  ).length;
}

/* ------------------------------ tokens ----------------------------------- */

export const tokenState = {
  isSpent: (jti: string) => registry.spent.has(jti),
  isRevoked: (jti: string) => registry.revoked.has(jti),
  consume: (jti: string) => void registry.spent.add(jti),
};

export function revokeToken(jti: string): void {
  registry.revoked.add(jti);
}

/** Test hook — clears all authorization state. */
export function resetAuthzForTests(): void {
  registry.decisions.length = 0;
  registry.keys.length = 0;
  registry.spent.clear();
  registry.revoked.clear();
}

/** Seeds a demo org + key so the console and docs work with zero setup. */
export function ensureDemoKey(): { org: string; key: string } {
  const existing = registry.keys.find((k) => k.org === "org_demo");
  if (existing) return { org: "org_demo", key: "csk_live_demo…(hidden)" };
  const { key } = createApiKey("org_demo", "demo");
  return { org: "org_demo", key };
}
