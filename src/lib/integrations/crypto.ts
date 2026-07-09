import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
  timingSafeEqual,
} from "node:crypto";
import { isProduction } from "../env";

/**
 * Credential vault — the ONLY place integration secrets (OAuth tokens, API
 * keys, MCP bearer tokens) are turned into bytes for storage. Everything a
 * connection needs to authenticate is encrypted here with AES-256-GCM and
 * only the ciphertext is ever written to the database.
 *
 * Key: INTEGRATIONS_ENCRYPTION_KEY, a 32-byte key as base64 (44 chars) or
 * hex (64 chars). Generate one with:
 *     node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
 *
 * Fail-closed: in production a missing/short key throws, so we never silently
 * store secrets in plaintext or with a weak key. In development only, if the
 * key is unset we derive an EPHEMERAL per-process key so the demo runs — those
 * ciphertexts don't survive a restart, which is the correct dev behavior.
 */

const ALGO = "aes-256-gcm";
const IV_LEN = 12; // 96-bit nonce, the GCM standard
const TAG_LEN = 16;
const VERSION = "v1";

let cachedKey: Buffer | null = null;
let warnedEphemeral = false;

function parseKey(raw: string): Buffer | null {
  const s = raw.trim();
  // base64 (allow standard/url-safe) → 32 bytes
  try {
    const b = Buffer.from(s, "base64");
    if (b.length === 32) return b;
  } catch {
    /* fall through */
  }
  // hex → 32 bytes
  if (/^[0-9a-fA-F]{64}$/.test(s)) return Buffer.from(s, "hex");
  return null;
}

function getKey(): Buffer {
  if (cachedKey) return cachedKey;
  const raw = process.env.INTEGRATIONS_ENCRYPTION_KEY?.trim();
  if (raw) {
    const key = parseKey(raw);
    if (!key) {
      throw new Error(
        "INTEGRATIONS_ENCRYPTION_KEY is set but not a 32-byte base64 or hex value"
      );
    }
    cachedKey = key;
    return key;
  }
  if (isProduction()) {
    // Never store secrets without a real key in production.
    throw new Error("INTEGRATIONS_ENCRYPTION_KEY is required in production");
  }
  // Development only: ephemeral key so the vault works locally.
  if (!warnedEphemeral) {
    warnedEphemeral = true;
    console.warn(
      "[cosigno] INTEGRATIONS_ENCRYPTION_KEY unset — using an ephemeral dev key (secrets won't survive a restart)."
    );
  }
  cachedKey = randomBytes(32);
  return cachedKey;
}

/** True when a persistent key is configured (safe to store secrets that outlive the process). */
export function vaultConfigured(): boolean {
  return Boolean(process.env.INTEGRATIONS_ENCRYPTION_KEY?.trim());
}

/**
 * Encrypt an arbitrary JSON-serializable value. Output is a self-describing,
 * URL-safe string: `v1.<iv>.<tag>.<ciphertext>` (all base64url). Storable as
 * a plain text column.
 */
export function encryptSecret(value: unknown): string {
  const key = getKey();
  const iv = randomBytes(IV_LEN);
  const cipher = createCipheriv(ALGO, key, iv);
  const plaintext = Buffer.from(JSON.stringify(value), "utf8");
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [
    VERSION,
    iv.toString("base64url"),
    tag.toString("base64url"),
    ciphertext.toString("base64url"),
  ].join(".");
}

/** Decrypt a value produced by {@link encryptSecret}. Throws on tampering/format errors. */
export function decryptSecret<T = unknown>(blob: string): T {
  const parts = blob.split(".");
  if (parts.length !== 4 || parts[0] !== VERSION) {
    throw new Error("malformed ciphertext");
  }
  const iv = Buffer.from(parts[1], "base64url");
  const tag = Buffer.from(parts[2], "base64url");
  const ciphertext = Buffer.from(parts[3], "base64url");
  if (iv.length !== IV_LEN || tag.length !== TAG_LEN) {
    throw new Error("malformed ciphertext");
  }
  const decipher = createDecipheriv(ALGO, getKey(), iv);
  decipher.setAuthTag(tag);
  const plaintext = Buffer.concat([
    decipher.update(ciphertext),
    decipher.final(), // throws if the auth tag doesn't verify (tampered/wrong key)
  ]);
  return JSON.parse(plaintext.toString("utf8")) as T;
}

/** Constant-time compare for secret-equality checks (e.g. state tokens). */
export function safeEqual(a: string, b: string): boolean {
  const ba = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ba.length !== bb.length) return false;
  return timingSafeEqual(ba, bb);
}

/** A short, non-reversible fingerprint of a secret — safe to log for correlation. */
export function fingerprint(value: string): string {
  // Not the value, not reversible: last-4 style marker for support/debugging.
  return `…${value.slice(-4)}(${value.length})`;
}

/** Generate a cryptographically-random token (for OAuth state, etc.). */
export function randomToken(bytes = 32): string {
  return randomBytes(bytes).toString("base64url");
}
