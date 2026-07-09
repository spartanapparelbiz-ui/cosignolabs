import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import { isProduction } from "../../env";

/**
 * SSRF defense for user-supplied URLs (custom MCP endpoints + any icon we
 * fetch on their behalf). The threat: a user (or a hostile server via a
 * redirect) points us at an internal address — the cloud metadata endpoint
 * (169.254.169.254), a loopback admin port, a private-range service — and we
 * happily fetch it. We block that by:
 *   1. allowing only http(s),
 *   2. resolving the hostname and rejecting if ANY resolved IP is private/
 *      loopback/link-local/ULA/CGNAT/unspecified/metadata,
 *   3. fetching with redirects DISABLED (a 3xx to an internal host is the
 *      classic bypass) — fail closed.
 *
 * Residual: a pure DNS-rebinding attacker could resolve public here and
 * private at connect time (undici re-resolves). Mitigated in practice by
 * blocking redirects + short timeouts; a full fix needs IP-pinned connects,
 * noted for follow-up. Loopback is permitted ONLY in development (local MCP).
 */

export class SsrfError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SsrfError";
  }
}

/** Parse an IPv4 dotted string to its 32-bit value, or null. */
function ipv4ToInt(ip: string): number | null {
  const parts = ip.split(".");
  if (parts.length !== 4) return null;
  let n = 0;
  for (const p of parts) {
    if (!/^\d{1,3}$/.test(p)) return null;
    const v = Number(p);
    if (v > 255) return null;
    n = (n << 8) | v;
  }
  return n >>> 0;
}

function v4InRange(ip: number, base: string, bits: number): boolean {
  const b = ipv4ToInt(base);
  if (b === null) return false;
  const mask = bits === 0 ? 0 : (~0 << (32 - bits)) >>> 0;
  return (ip & mask) === (b & mask);
}

/** True if an IPv4 address is private/loopback/link-local/reserved. */
function isBlockedV4(ip: string): boolean {
  const n = ipv4ToInt(ip);
  if (n === null) return true; // unparseable → block
  return (
    v4InRange(n, "0.0.0.0", 8) || // "this" network / unspecified
    v4InRange(n, "10.0.0.0", 8) || // private
    v4InRange(n, "100.64.0.0", 10) || // CGNAT
    v4InRange(n, "127.0.0.0", 8) || // loopback
    v4InRange(n, "169.254.0.0", 16) || // link-local (incl. 169.254.169.254 metadata)
    v4InRange(n, "172.16.0.0", 12) || // private
    v4InRange(n, "192.0.0.0", 24) || // IETF protocol assignments
    v4InRange(n, "192.168.0.0", 16) || // private
    v4InRange(n, "198.18.0.0", 15) || // benchmarking
    v4InRange(n, "224.0.0.0", 4) || // multicast
    v4InRange(n, "240.0.0.0", 4) // reserved / broadcast
  );
}

/** True if an IPv6 address is loopback/ULA/link-local/unspecified/mapped-private. */
function isBlockedV6(ip: string): boolean {
  const a = ip.toLowerCase().split("%")[0]; // strip zone id
  if (a === "::1" || a === "::") return true; // loopback / unspecified
  // IPv4-mapped (::ffff:a.b.c.d) or IPv4-compatible → validate the v4 part.
  const mapped = a.match(/(?:::ffff:)?(\d+\.\d+\.\d+\.\d+)$/);
  if (mapped) return isBlockedV4(mapped[1]);
  const head = a.split(":")[0] ?? "";
  const h = parseInt(head || "0", 16);
  if (Number.isNaN(h)) return true;
  if ((h & 0xfe00) === 0xfc00) return true; // fc00::/7 ULA
  if ((h & 0xffc0) === 0xfe80) return true; // fe80::/10 link-local
  if (a.startsWith("fd00:ec2:")) return true; // AWS IMDSv6 metadata
  return false;
}

export function isBlockedIp(ip: string): boolean {
  const v = isIP(ip);
  if (v === 4) return isBlockedV4(ip);
  if (v === 6) return isBlockedV6(ip);
  return true; // not an IP → block
}

/**
 * Validate that a URL is safe to fetch: http(s), a resolvable public host.
 * Throws SsrfError otherwise. Loopback is allowed only in development.
 */
export async function assertPublicUrl(
  raw: string,
  opts: { allowLoopback?: boolean } = {}
): Promise<URL> {
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    throw new SsrfError("invalid URL");
  }
  if (u.protocol !== "https:" && u.protocol !== "http:") {
    throw new SsrfError("only http(s) URLs are allowed");
  }
  const allowLoopback = opts.allowLoopback ?? !isProduction();

  // If the host is already a literal IP, check it directly.
  const literal = u.hostname.replace(/^\[|\]$/g, "");
  if (isIP(literal)) {
    if (isBlockedIp(literal) && !(allowLoopback && isLoopback(literal))) {
      throw new SsrfError("that address is not allowed");
    }
    return u;
  }

  // Resolve the hostname; block if ANY resolved address is internal.
  let addrs: { address: string }[];
  try {
    addrs = await lookup(u.hostname, { all: true });
  } catch {
    throw new SsrfError("could not resolve that host");
  }
  if (addrs.length === 0) throw new SsrfError("host did not resolve");
  for (const { address } of addrs) {
    if (isBlockedIp(address) && !(allowLoopback && isLoopback(address))) {
      throw new SsrfError("that host resolves to a non-public address");
    }
  }
  return u;
}

function isLoopback(ip: string): boolean {
  return ip === "::1" || ip.startsWith("127.");
}

/**
 * Fetch a user-supplied URL with SSRF protection and redirects disabled.
 * The caller still owns timeout + response-size handling. A 3xx (or any
 * network error) fails closed.
 */
export async function safeFetch(
  raw: string,
  init: RequestInit & { allowLoopback?: boolean } = {}
): Promise<Response> {
  const { allowLoopback, ...rest } = init;
  await assertPublicUrl(raw, { allowLoopback });
  let res: Response;
  try {
    res = await fetch(raw, { ...rest, redirect: "error" });
  } catch (err) {
    // undici throws on a disallowed redirect and on network errors.
    if (err instanceof SsrfError) throw err;
    const msg = err instanceof Error ? err.message : "";
    if (/redirect/i.test(msg)) throw new SsrfError("redirects are not allowed");
    throw new SsrfError("could not reach that host");
  }
  return res;
}
