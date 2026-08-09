import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryStore } from "../src/lib/store/memory";
import { resetRateLimitsForTests } from "../src/lib/ratelimit";

/**
 * Streaming the answer.
 *
 * The point is entirely about WHEN the user sees words, so that is what these
 * assert: that text arrives in pieces rather than one lump, that the header
 * saying what was read lands BEFORE the first word, and that a mid-stream
 * failure is reported rather than closing a silent connection the UI cannot
 * distinguish from a bug.
 */

const CHUNKS = ["The photo shows ", "a navy crewneck ", "on light wood."];

vi.mock("@anthropic-ai/sdk", () => {
  class FakeProvider {
    messages = {
      create: async () => ({ content: [{ type: "text", text: CHUNKS.join("") }], usage: {} }),
      stream: (params: Record<string, unknown>) => {
        seen.push(params);
        if (failNext) {
          failNext = false;
          // Async-iterating a failed stream must reject, the way the real SDK
          // surfaces a mid-generation provider error.
          return {
            async *[Symbol.asyncIterator]() {
              yield { type: "message_start", message: { usage: { input_tokens: 10 } } };
              throw Object.assign(new Error("overloaded"), { status: 529 });
            },
          };
        }
        return {
          async *[Symbol.asyncIterator]() {
            yield { type: "message_start", message: { usage: { input_tokens: 900 } } };
            for (const text of CHUNKS) {
              yield { type: "content_block_delta", delta: { type: "text_delta", text } };
            }
            yield { type: "message_delta", usage: { output_tokens: 12 } };
          },
        };
      },
    };
    constructor(public opts: unknown) {}
  }
  return { default: FakeProvider };
});

vi.mock("@/lib/auth", () => ({
  authConfigured: () => true,
  DEMO_USER_ID: "demo-user",
  getUserId: vi.fn(async () => "stream-user"),
}));

const seen: Record<string, unknown>[] = [];
let failNext = false;
let store: MemoryStore;

beforeEach(async () => {
  seen.length = 0;
  failNext = false;
  store = new MemoryStore();
  (globalThis as Record<string, unknown>).__cosignoStore = store;
  resetRateLimitsForTests();
  process.env.PLANNER_API_KEY = "test-key";
  process.env.PLANNER_MODEL_DEFAULT = "test-model";
  const { resetPlannerCacheForTests } = await import("../src/lib/agent/provider");
  resetPlannerCacheForTests();
});

function pngBytes(): Buffer {
  const b = Buffer.alloc(24);
  Buffer.from("89504e470d0a1a0a", "hex").copy(b, 0);
  b.writeUInt32BE(800, 16);
  b.writeUInt32BE(600, 20);
  return b;
}

/** Drive the SSE route and collect the decoded events in order. */
async function streamAsk(question: string, sourceIds: string[]) {
  const { POST } = await import("../src/app/api/analyze/stream/route");
  const res = await POST(
    new NextRequest("http://localhost/api/analyze/stream", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ question, sourceIds }),
    })
  );
  if (!res.body) return { status: res.status, events: [] as Record<string, unknown>[] };

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  const events: Record<string, unknown>[] = [];
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const frames = buffer.split("\n\n");
    buffer = frames.pop() ?? "";
    for (const frame of frames) {
      const line = frame.split("\n").find((l) => l.startsWith("data: "));
      if (line) events.push(JSON.parse(line.slice(6)));
    }
  }
  return { status: res.status, events, contentType: res.headers.get("content-type") };
}

async function addPhoto(name = "photo.png") {
  return store.createMissionSource({
    user_id: "stream-user",
    kind: "file",
    name,
    subtype: "image/png",
    size_bytes: 24,
    status: "ready",
    summary: `[image: ${name}]`,
    media: [{ mime: "image/png", data: pngBytes().toString("base64"), label: name }],
  });
}

describe("the answer arrives as it is written", () => {
  it("emits each fragment separately instead of one finished lump", async () => {
    const source = await addPhoto();
    const { status, events, contentType } = await streamAsk("describe this photo", [source.id]);

    expect(status).toBe(200);
    expect(contentType).toContain("text/event-stream");

    const texts = events.filter((e) => e.type === "text").map((e) => e.text);
    // Several separate deliveries is the whole feature — one combined event
    // would be buffering with extra steps.
    expect(texts).toEqual(CHUNKS);
    expect(texts.join("")).toBe(CHUNKS.join(""));
    expect(events.at(-1)).toEqual({ type: "done" });
  });

  it("says what it opened BEFORE the first word of the answer", async () => {
    const source = await addPhoto("receipt.png");
    const { events } = await streamAsk("what is this?", [source.id]);

    const metaAt = events.findIndex((e) => e.type === "meta");
    const firstTextAt = events.findIndex((e) => e.type === "text");
    expect(metaAt).toBeGreaterThanOrEqual(0);
    // The user should know what is being read while it is still being read,
    // not discover afterwards that something was skipped.
    expect(metaAt).toBeLessThan(firstTextAt);

    const meta = events[metaAt];
    expect(meta.images_seen).toBe(1);
    expect(meta.looked_at).toEqual(["receipt.png"]);
  });

  it("streams the real image, not a description of it", async () => {
    const source = await addPhoto();
    await streamAsk("describe this", [source.id]);

    const content = (seen[0].messages as { content: unknown[] }[])[0].content as Record<string, unknown>[];
    const image = content.find((b) => b.type === "image");
    expect(image).toBeDefined();
    expect((image!.source as Record<string, string>).data).toBe(pngBytes().toString("base64"));
  });

  it("names an unreadable attachment in the header, before answering", async () => {
    const bad = await store.createMissionSource({
      user_id: "stream-user",
      kind: "file",
      name: "notes.bin",
      subtype: "application/octet-stream",
      size_bytes: 10,
      status: "unsupported",
      summary: "",
      media: [],
    });
    const { events } = await streamAsk("summarize this", [bad.id]);
    const meta = events.find((e) => e.type === "meta")!;
    expect((meta.could_not_read as string[]).join(" ")).toMatch(/notes\.bin/);
    expect(meta.images_seen).toBe(0);
  });

  it("reports a mid-stream failure instead of closing silently", async () => {
    failNext = true;
    const source = await addPhoto();
    const { status, events } = await streamAsk("describe this", [source.id]);

    // The response already committed to 200 before the failure, so the error
    // has to travel in-band. A silent close looks exactly like a UI bug.
    expect(status).toBe(200);
    const error = events.find((e) => e.type === "error");
    expect(error).toBeDefined();
    expect(String(error!.message)).toBeTruthy();
  });

  it("still refuses another account's attachment", async () => {
    const source = await addPhoto();
    const auth = await import("@/lib/auth");
    vi.mocked(auth.getUserId).mockResolvedValueOnce("intruder");

    const { status } = await streamAsk("what is this?", [source.id]);
    // Rejected before the stream opens, so it is a real status code.
    expect(status).toBe(404);
    expect(seen).toHaveLength(0);
  });
});

describe("exporting a document", () => {
  it("returns a real file for every format the picker offers", async () => {
    const { FORMATS } = await import("../src/lib/files/formats");
    const { GET } = await import("../src/app/api/files/[id]/export/route");

    const file = await store.createFile({
      user_id: "stream-user",
      session_id: null,
      name: "condition-report",
      mime: "text/markdown",
      content: "Findings:\n\n- Pilling on the sleeve\n- Collar is wavy",
    });

    for (const f of FORMATS) {
      const res = await GET(
        new NextRequest(`http://localhost/api/files/${file.id}/export?format=${f.id}`),
        { params: Promise.resolve({ id: file.id }) }
      );
      expect(res.status).toBe(200);
      expect(res.headers.get("content-type")).toContain(f.mime);
      // The filename decides what the OS does with the download; the wrong
      // extension makes a valid file look corrupt.
      expect(res.headers.get("content-disposition")).toContain(`${f.extension}"`);
      expect((await res.arrayBuffer()).byteLength).toBeGreaterThan(0);
    }
  });

  it("refuses a format it cannot produce", async () => {
    const { GET } = await import("../src/app/api/files/[id]/export/route");
    const file = await store.createFile({
      user_id: "stream-user",
      session_id: null,
      name: "doc",
      mime: "text/plain",
      content: "hi",
    });
    const res = await GET(
      new NextRequest(`http://localhost/api/files/${file.id}/export?format=exe`),
      { params: Promise.resolve({ id: file.id }) }
    );
    expect(res.status).toBe(400);
  });

  it("will not export another account's document", async () => {
    const file = await store.createFile({
      user_id: "someone-else",
      session_id: null,
      name: "private",
      mime: "text/plain",
      content: "secret",
    });
    const { GET } = await import("../src/app/api/files/[id]/export/route");
    const res = await GET(
      new NextRequest(`http://localhost/api/files/${file.id}/export?format=pdf`),
      { params: Promise.resolve({ id: file.id }) }
    );
    expect(res.status).toBe(404);
  });
});
