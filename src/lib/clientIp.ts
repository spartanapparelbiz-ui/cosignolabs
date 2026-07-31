import type { NextRequest } from "next/server";

/**
 * Spoof-resistant client IP for rate-limit keys.
 *
 * `X-Forwarded-For` is "client, proxy1, …, proxyN": every proxy APPENDS the
 * address it received the request from. The LEFTMOST value is whatever the
 * client CLAIMED — fully forgeable. Keying a rate limit off it lets an attacker
 * rotate the header (`X-Forwarded-For: <random>`) on each request and bypass
 * every IP-based limit. So we never trust the leftmost value.
 *
 * Instead we use, in order:
 *   1. `cf-connecting-ip` — Cloudflare OVERWRITES this on every request; a
 *      client cannot forge it when the app sits behind Cloudflare.
 *   2. the value YOUR trusted edge appended to `x-forwarded-for` — read from
 *      the RIGHT by `TRUSTED_PROXY_HOPS` (default 1, i.e. a single edge like
 *      Railway / Vercel / Fly). A client can prepend fakes but cannot stop the
 *      trusted proxy from appending the true source last.
 *   3. `x-real-ip` — last resort (only some edges set/overwrite it).
 *
 * TRUSTED_PROXY_HOPS = number of trusted proxies in front of the app.
 *   - direct on Railway/Vercel/Fly:        1 (default)
 *   - Cloudflare in front of that platform: 2  (or just rely on cf-connecting-ip)
 * Set it too LOW and you'd read a proxy's own IP (over-limiting, not a bypass);
 * set it too HIGH and you'd read a client-claimed value (a bypass) — so the
 * default is deliberately the safe end (1).
 */
export function clientIp(req: NextRequest): string {
  const h = (n: string) => req.headers.get(n)?.trim() || "";

  const cf = h("cf-connecting-ip");
  if (cf) return firstToken(cf);

  const xff = h("x-forwarded-for");
  if (xff) {
    const parts = xff
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    if (parts.length) {
      const hops = trustedHops(parts.length);
      const picked = parts[parts.length - hops];
      if (picked) return picked;
    }
  }

  const real = h("x-real-ip");
  if (real) return firstToken(real);

  return "unknown";
}

/** Number of trusted proxy hops; clamped to [1, len] so we never over-index. */
function trustedHops(len: number): number {
  const raw = Number(process.env.TRUSTED_PROXY_HOPS);
  const hops = Number.isFinite(raw) && raw >= 1 ? Math.floor(raw) : 1;
  return Math.min(hops, len);
}

/** cf-connecting-ip / x-real-ip are single addresses, but guard against a list. */
function firstToken(v: string): string {
  return v.split(",")[0].trim() || "unknown";
}
