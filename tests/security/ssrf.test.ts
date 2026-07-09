import { afterEach, describe, expect, it, vi } from "vitest";
import { isBlockedIp, assertPublicUrl, SsrfError } from "@/lib/integrations/net/ssrf";

// dns.lookup is mocked so we can drive what a hostname resolves to.
const dnsMock = vi.hoisted(() => ({
  lookup: vi.fn(async () => [{ address: "140.82.113.4", family: 4 }]),
}));
vi.mock("node:dns/promises", () => dnsMock);

/**
 * SSRF is the sharpest edge a custom-connector feature adds: a user (or a
 * hostile server via a redirect) can try to make the server fetch an internal
 * address — cloud metadata, loopback, a private-range admin port. These pin
 * that the classifier and the URL guard fail CLOSED.
 */

describe("private/reserved IP classification", () => {
  it("blocks loopback, private, link-local, CGNAT, and cloud metadata", () => {
    for (const ip of [
      "127.0.0.1", "127.1.2.3",
      "10.0.0.5", "172.16.0.1", "172.31.255.255", "192.168.1.1",
      "169.254.169.254", // AWS/GCP metadata
      "100.64.0.1", // CGNAT
      "0.0.0.0",
      "::1", "fe80::1", "fc00::1", "fd00:ec2::254",
      "::ffff:10.0.0.1", // IPv4-mapped private
    ]) {
      expect(isBlockedIp(ip), ip).toBe(true);
    }
  });

  it("allows normal public addresses", () => {
    for (const ip of ["8.8.8.8", "1.1.1.1", "140.82.113.4", "2606:4700:4700::1111"]) {
      expect(isBlockedIp(ip), ip).toBe(false);
    }
  });

  it("blocks anything that isn't a valid IP", () => {
    expect(isBlockedIp("not-an-ip")).toBe(true);
    expect(isBlockedIp("")).toBe(true);
  });
});

describe("assertPublicUrl", () => {
  it("rejects non-http(s) schemes", async () => {
    await expect(assertPublicUrl("file:///etc/passwd")).rejects.toBeInstanceOf(SsrfError);
    await expect(assertPublicUrl("ftp://host/x")).rejects.toBeInstanceOf(SsrfError);
    await expect(assertPublicUrl("gopher://x")).rejects.toBeInstanceOf(SsrfError);
  });

  it("rejects a literal internal IP host (metadata endpoint)", async () => {
    await expect(
      assertPublicUrl("http://169.254.169.254/latest/meta-data/", { allowLoopback: false })
    ).rejects.toBeInstanceOf(SsrfError);
    await expect(
      assertPublicUrl("https://10.0.0.1/admin", { allowLoopback: false })
    ).rejects.toThrow(/not allowed/);
  });

  it("rejects a hostname that RESOLVES to an internal address", async () => {
    dnsMock.lookup.mockResolvedValueOnce([{ address: "10.1.2.3", family: 4 }]);
    await expect(
      assertPublicUrl("https://sneaky.example.com/rpc", { allowLoopback: false })
    ).rejects.toThrow(/non-public/);
  });

  it("allows a hostname resolving to a public address", async () => {
    dnsMock.lookup.mockResolvedValueOnce([{ address: "140.82.113.4", family: 4 }]);
    await expect(
      assertPublicUrl("https://api.example.com/rpc", { allowLoopback: false })
    ).resolves.toBeInstanceOf(URL);
  });
});

describe("safeFetch disables redirects (fail closed)", () => {
  const realFetch = globalThis.fetch;
  afterEach(() => {
    globalThis.fetch = realFetch;
    vi.restoreAllMocks();
  });

  it("passes redirect:error to fetch so a 3xx can't bounce to an internal host", async () => {
    dnsMock.lookup.mockResolvedValueOnce([{ address: "140.82.113.4", family: 4 }]);
    const spy = vi.fn(async () => ({ ok: true, status: 200 }) as unknown as Response);
    globalThis.fetch = spy as unknown as typeof fetch;

    const { safeFetch } = await import("@/lib/integrations/net/ssrf");
    await safeFetch("https://api.example.com/x", { method: "GET" });
    expect(spy).toHaveBeenCalledWith(
      "https://api.example.com/x",
      expect.objectContaining({ redirect: "error" })
    );
  });
});
