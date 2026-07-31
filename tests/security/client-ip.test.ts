import { afterEach, describe, expect, it } from "vitest";
import { clientIp } from "@/lib/clientIp";

/**
 * Rate-limit keys derive from the client IP, so a forgeable IP = a bypassable
 * limit. These pin the anti-spoofing contract: the CLIENT-CLAIMED (leftmost)
 * X-Forwarded-For value is never used; we key off what the trusted edge
 * appended (or Cloudflare's unforgeable header).
 */

function req(headers: Record<string, string>): { headers: Headers } {
  return { headers: new Headers(headers) };
}

afterEach(() => {
  delete process.env.TRUSTED_PROXY_HOPS;
});

describe("clientIp — spoof resistance", () => {
  it("ignores the attacker-claimed leftmost XFF, uses the edge-appended (rightmost) value", () => {
    // attacker prepends a fake; the trusted proxy appended the REAL source last.
    const ip = clientIp(req({ "x-forwarded-for": "1.2.3.4, 203.0.113.9" }) as never);
    expect(ip).toBe("203.0.113.9");
    expect(ip).not.toBe("1.2.3.4");
  });

  it("rotating the forged leftmost value cannot change the key", () => {
    const a = clientIp(req({ "x-forwarded-for": "9.9.9.9, 203.0.113.9" }) as never);
    const b = clientIp(req({ "x-forwarded-for": "8.8.8.8, 203.0.113.9" }) as never);
    const c = clientIp(req({ "x-forwarded-for": "evil, 203.0.113.9" }) as never);
    expect(new Set([a, b, c]).size).toBe(1); // same key despite rotating fakes
    expect(a).toBe("203.0.113.9");
  });

  it("prefers Cloudflare's unforgeable cf-connecting-ip over any XFF", () => {
    const ip = clientIp(
      req({ "cf-connecting-ip": "198.51.100.7", "x-forwarded-for": "1.2.3.4, 5.6.7.8" }) as never
    );
    expect(ip).toBe("198.51.100.7");
  });

  it("honors TRUSTED_PROXY_HOPS for multi-proxy chains", () => {
    // client, realClient(by edge1), edge1(by edge2) => 2 trusted hops => realClient
    process.env.TRUSTED_PROXY_HOPS = "2";
    const ip = clientIp(req({ "x-forwarded-for": "fake, 203.0.113.9, 10.0.0.1" }) as never);
    expect(ip).toBe("203.0.113.9");
  });

  it("single trusted proxy (default) reads the last hop", () => {
    const ip = clientIp(req({ "x-forwarded-for": "203.0.113.9" }) as never);
    expect(ip).toBe("203.0.113.9");
  });

  it("falls back to x-real-ip, then a stable 'unknown'", () => {
    expect(clientIp(req({ "x-real-ip": "203.0.113.5" }) as never)).toBe("203.0.113.5");
    expect(clientIp(req({}) as never)).toBe("unknown");
  });

  it("never over-indexes when hops exceed the chain length", () => {
    process.env.TRUSTED_PROXY_HOPS = "9";
    const ip = clientIp(req({ "x-forwarded-for": "203.0.113.9" }) as never);
    expect(ip).toBe("203.0.113.9");
  });
});
