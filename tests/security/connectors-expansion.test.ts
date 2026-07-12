import { afterEach, describe, expect, it, vi } from "vitest";
import { getProvider, listProviders } from "@/lib/integrations/registry";
import { bundledLogo } from "@/lib/integrations/logos";
import { serverTier } from "@/lib/integrations/tiers";
import { googleCalendarProvider } from "@/lib/integrations/providers/googleCalendar";
import { googleDriveProvider } from "@/lib/integrations/providers/googleDrive";
import { outlookProvider } from "@/lib/integrations/providers/outlook";
import { notionProvider, slackProvider } from "@/lib/integrations/providers/oauth";

/**
 * The expanded connector set (Calendar, Drive, Outlook + real Slack/Notion
 * capabilities). What's proven: registry + logos are complete, risk classes
 * map to the right approval tiers, the Google trio shares one env pair,
 * Slack's ok:false envelope is a real failure, Notion's Basic-auth token
 * exchange, and Drive's multipart upload preserves its content type.
 */

const CREDS = { access_token: "tok-user-a" };

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

function stubFetch(handler: (url: string, init?: RequestInit) => unknown) {
  const calls: { url: string; init?: RequestInit }[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit) => {
      calls.push({ url: String(url), init });
      return {
        ok: true,
        status: 200,
        headers: { get: () => null },
        text: async () => JSON.stringify(handler(String(url), init) ?? {}),
      } as unknown as Response;
    })
  );
  return calls;
}

describe("registry + logos are complete", () => {
  it("all seven first-party providers are registered with a bundled logo", () => {
    const keys = listProviders().map((p) => p.key);
    for (const k of ["google", "google-calendar", "google-drive", "outlook", "github", "slack", "notion"]) {
      expect(keys).toContain(k);
      expect(bundledLogo(k)).toBe(`/logos/${k}.svg`);
    }
  });

  it("every provider's destructive actions land on tier 3, writes on 2, reads on 1", () => {
    for (const p of listProviders()) {
      for (const a of p.listActions()) {
        const tier = serverTier(a);
        if (a.risk === "destructive") expect(tier).toBe(3);
        else if (a.risk === "write") expect(tier).toBe(2);
        else if (a.risk === "read") expect(tier).toBe(1);
        else expect(tier).toBe(a.mutates ? 2 : 1);
      }
    }
    // The dangerous ones specifically:
    expect(serverTier(googleCalendarProvider.listActions().find((a) => a.id === "delete_event")!)).toBe(3);
    expect(serverTier(googleDriveProvider.listActions().find((a) => a.id === "trash_file")!)).toBe(3);
    expect(serverTier(outlookProvider.listActions().find((a) => a.id === "trash")!)).toBe(3);
    expect(serverTier(slackProvider.listActions().find((a) => a.id === "post_message")!)).toBe(2);
  });
});

describe("the Google trio shares one OAuth app", () => {
  it("setting GOOGLE_CLIENT_ID/SECRET configures gmail, calendar, and drive together", () => {
    vi.stubEnv("GOOGLE_CLIENT_ID", "");
    vi.stubEnv("GOOGLE_CLIENT_SECRET", "");
    expect(googleCalendarProvider.isConfigured()).toBe(false);
    expect(googleDriveProvider.isConfigured()).toBe(false);

    vi.stubEnv("GOOGLE_CLIENT_ID", "one-app");
    vi.stubEnv("GOOGLE_CLIENT_SECRET", "one-secret");
    expect(getProvider("google")!.isConfigured()).toBe(true);
    expect(googleCalendarProvider.isConfigured()).toBe(true);
    expect(googleDriveProvider.isConfigured()).toBe(true);
    // Outlook is a different app — still unconfigured.
    expect(outlookProvider.isConfigured()).toBe(false);
  });

  it("each Google connector asks only for its own narrow scope", () => {
    vi.stubEnv("GOOGLE_CLIENT_ID", "one-app");
    const url = (p: typeof googleCalendarProvider) =>
      p.buildAuthUrl!({ state: "s", redirectUri: "https://x/cb", codeChallenge: "c" });
    const cal = url(googleCalendarProvider);
    expect(cal).toContain("calendar.events");
    expect(cal).not.toContain("gmail");
    expect(cal).not.toContain("drive");
    const drive = url(googleDriveProvider);
    expect(drive).toContain("drive.file");
    expect(drive).not.toContain("gmail");
  });
});

describe("calendar + drive + outlook execute real, bounded calls", () => {
  it("calendar list_events flags results untrusted; create_event validates input", async () => {
    stubFetch(() => ({ items: [{ id: "e1", summary: "standup" }] }));
    const res = await googleCalendarProvider.execute("list_events", {}, CREDS);
    expect(res.ok).toBe(true);
    expect((res.detail as Record<string, unknown>).untrusted).toBe(true);

    const bad = await googleCalendarProvider.execute("create_event", { title: "x" }, CREDS);
    expect(bad.ok).toBe(false); // no start/end
  });

  it("drive create_text_file uploads multipart with its own content type", async () => {
    const calls = stubFetch(() => ({ id: "f1", name: "notes.md" }));
    const res = await googleDriveProvider.execute(
      "create_text_file",
      { name: "notes.md", mime: "text/markdown", content: "# hi" },
      CREDS
    );
    expect(res.ok).toBe(true);
    const upload = calls.find((c) => c.url.includes("uploadType=multipart"))!;
    const headers = upload.init?.headers as Record<string, string>;
    const typeKey = Object.keys(headers).find((k) => k.toLowerCase() === "content-type")!;
    expect(headers[typeKey]).toContain("multipart/related");
    expect(String(upload.init?.body)).toContain("# hi");
    // And binary/unknown types are refused up front.
    const bad = await googleDriveProvider.execute(
      "create_text_file",
      { name: "x.bin", mime: "application/octet-stream", content: "x" },
      CREDS
    );
    expect(bad.ok).toBe(false);
  });

  it("outlook trash moves to deleteditems (never a permanent delete)", async () => {
    const calls = stubFetch(() => ({}));
    const res = await outlookProvider.execute("trash", { id: "m1" }, CREDS);
    expect(res.ok).toBe(true);
    const move = calls.find((c) => c.url.includes("/move"))!;
    expect(String(move.init?.body)).toContain("deleteditems");
  });
});

describe("slack: the ok:false envelope is a failure, not a fake success", () => {
  it("post_message with ok:false surfaces as a failed action", async () => {
    stubFetch(() => ({ ok: false, error: "channel_not_found" }));
    await expect(
      slackProvider.execute("post_message", { channel: "nope", text: "hi" }, CREDS)
    ).rejects.toThrow(/channel_not_found/);
  });

  it("post_message success posts the channel and text", async () => {
    const calls = stubFetch(() => ({ ok: true }));
    const res = await slackProvider.execute("post_message", { channel: "general", text: "ship it" }, CREDS);
    expect(res.ok).toBe(true);
    const post = calls.find((c) => c.url.includes("chat.postMessage"))!;
    expect(String(post.init?.body)).toContain("ship it");
  });
});

describe("notion: Basic-auth token exchange + versioned API calls", () => {
  it("exchangeCode sends Basic auth with a JSON body (never form client_secret)", async () => {
    vi.stubEnv("NOTION_CLIENT_ID", "nid");
    vi.stubEnv("NOTION_CLIENT_SECRET", "nsecret");
    const calls = stubFetch(() => ({ access_token: "nat" }));
    const creds = await notionProvider.exchangeCode!({ code: "c", redirectUri: "https://x/cb" });
    expect(creds.access_token).toBe("nat");
    const call = calls[0];
    const headers = call.init?.headers as Record<string, string>;
    const auth = headers[Object.keys(headers).find((k) => k.toLowerCase() === "authorization")!];
    expect(auth).toBe(`Basic ${Buffer.from("nid:nsecret").toString("base64")}`);
    expect(String(call.init?.body)).not.toContain("nsecret");
    expect(String(call.init?.body)).toContain('"grant_type":"authorization_code"');
  });

  it("every Notion data call carries the version header", async () => {
    const calls = stubFetch(() => ({ results: [] }));
    await notionProvider.execute("search_pages", { query: "roadmap" }, CREDS);
    const headers = calls[0].init?.headers as Record<string, string>;
    const vKey = Object.keys(headers).find((k) => k.toLowerCase() === "notion-version")!;
    expect(headers[vKey]).toBeTruthy();
  });
});
