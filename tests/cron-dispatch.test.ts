import { describe, expect, it } from "vitest";
import {
  TICK_TARGETS,
  formatReport,
  resolveBaseUrl,
  runTicks,
} from "@/lib/cron/dispatch";

/**
 * The scheduler is the difference between "an operator" and "a form that
 * forgets you". These tests pin the two properties that make it safe to run
 * unattended: it never calls anything without a secret, and it never leaks
 * that secret into a log line.
 */

function recordingFetch(
  handler: (url: string, init: RequestInit) => Response | Promise<Response>
) {
  const calls: Array<{ url: string; init: RequestInit }> = [];
  const impl = (async (url: string | URL | Request, init?: RequestInit) => {
    const u = String(url);
    calls.push({ url: u, init: init ?? {} });
    return handler(u, init ?? {});
  }) as unknown as typeof fetch;
  return { impl, calls };
}

describe("resolveBaseUrl", () => {
  it("prefers explicit app config over the platform's URL", () => {
    expect(
      resolveBaseUrl({ NEXT_PUBLIC_APP_URL: "https://a.example", URL: "https://b.example" })
    ).toBe("https://a.example");
  });

  it("falls back to the platform site URL, then the canonical domain", () => {
    expect(resolveBaseUrl({ URL: "https://b.example" })).toBe("https://b.example");
    expect(resolveBaseUrl({})).toBe("https://cosignolabs.com");
  });

  it("strips trailing slashes so paths never double up", () => {
    expect(resolveBaseUrl({ URL: "https://b.example///" })).toBe("https://b.example");
  });

  it("ignores DEPLOY_URL — it pins to one immutable deploy", () => {
    expect(resolveBaseUrl({ DEPLOY_URL: "https://deploy-123--x.netlify.app" })).toBe(
      "https://cosignolabs.com"
    );
  });
});

describe("runTicks", () => {
  it("fails closed with no secret: makes zero requests", async () => {
    const { impl, calls } = recordingFetch(() => new Response("{}", { status: 200 }));
    const report = await runTicks({ env: {}, fetchImpl: impl });

    expect(report.ran).toBe(false);
    expect(calls).toHaveLength(0);
    expect(report.skipped).toMatch(/CRON_SECRET/);
  });

  it("treats a whitespace-only secret as absent", async () => {
    const { impl, calls } = recordingFetch(() => new Response("{}", { status: 200 }));
    const report = await runTicks({ env: { CRON_SECRET: "   " }, fetchImpl: impl });

    expect(report.ran).toBe(false);
    expect(calls).toHaveLength(0);
  });

  it("POSTs every target with the shared secret header", async () => {
    const { impl, calls } = recordingFetch(() => new Response("{}", { status: 200 }));
    const report = await runTicks({
      env: { CRON_SECRET: "s3cret", URL: "https://x.example" },
      fetchImpl: impl,
    });

    expect(report.ran).toBe(true);
    expect(calls.map((c) => c.url)).toEqual([
      "https://x.example/api/missions/tick",
      "https://x.example/api/automations/tick",
    ]);
    for (const call of calls) {
      expect(call.init.method).toBe("POST");
      expect((call.init.headers as Record<string, string>)["x-cron-secret"]).toBe("s3cret");
    }
    expect(report.outcomes.every((o) => o.ok)).toBe(true);
  });

  it("ticks missions before automations so enqueued work is not delayed a full interval", () => {
    expect(TICK_TARGETS.map((t) => t.name)).toEqual(["missions", "automations"]);
  });

  it("records a failing target without aborting the others", async () => {
    const { impl } = recordingFetch((url) =>
      url.includes("missions")
        ? new Response("boom", { status: 500 })
        : new Response("{}", { status: 200 })
    );
    const report = await runTicks({ env: { CRON_SECRET: "s" }, fetchImpl: impl });

    expect(report.outcomes).toHaveLength(2);
    expect(report.outcomes[0]).toMatchObject({ name: "missions", ok: false, status: 500 });
    expect(report.outcomes[1]).toMatchObject({ name: "automations", ok: true });
  });

  it("survives a thrown request and reports it as a failure", async () => {
    const impl = (async () => {
      throw new TypeError("network down");
    }) as unknown as typeof fetch;
    const report = await runTicks({ env: { CRON_SECRET: "s" }, fetchImpl: impl });

    expect(report.ran).toBe(true);
    expect(report.outcomes.every((o) => !o.ok && o.status === null)).toBe(true);
  });

  it("never puts the secret or a response body in the log line", async () => {
    const { impl } = recordingFetch(
      () => new Response("secret-echoed-back s3cret", { status: 500 })
    );
    const report = await runTicks({ env: { CRON_SECRET: "s3cret" }, fetchImpl: impl });
    const line = formatReport(report);

    expect(line).not.toContain("s3cret");
    expect(line).not.toContain("secret-echoed-back");
    expect(line).toContain("missions=HTTP 500");
  });

  it("logs the skip reason plainly so a misconfigured deploy is obvious", async () => {
    const report = await runTicks({ env: {}, fetchImpl: (async () => new Response()) as never });
    expect(formatReport(report)).toMatch(/scheduler skipped/);
  });
});
