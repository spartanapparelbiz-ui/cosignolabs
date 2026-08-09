import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryStore } from "../src/lib/store/memory";
import { resetRateLimitsForTests } from "../src/lib/ratelimit";

/**
 * The whole journey, through the real route handlers: attach a photo, ask
 * about it, get an answer.
 *
 * This is the test that would have caught the original bug. Every piece
 * passed its own unit test while the journey as a whole was broken — the
 * upload succeeded, the source said "ready", the model replied confidently,
 * and the reply was about a photo that had been thrown away two steps
 * earlier. Only an end-to-end assertion on what the model received can tell
 * those two situations apart.
 */

const sent: Record<string, unknown>[] = [];

vi.mock("@anthropic-ai/sdk", () => {
  class FakeProvider {
    messages = {
      create: async (params: Record<string, unknown>) => {
        sent.push(params);
        // The stub answers from what it was actually given, so an empty
        // delivery cannot masquerade as a good answer.
        const content = (params.messages as { content: unknown[] }[])[0].content as Record<string, unknown>[];
        const images = content.filter((b) => b.type === "image").length;
        return {
          content: [
            {
              type: "text",
              text:
                images > 0
                  ? `I can see ${images} image. It shows a navy crewneck sweatshirt on a light wooden surface.`
                  : "I couldn't open the attachment, so I can't describe it.",
            },
          ],
          usage: { input_tokens: 900, output_tokens: 32 },
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
  getUserId: vi.fn(async () => "photo-user"),
}));

let store: MemoryStore;

beforeEach(async () => {
  sent.length = 0;
  store = new MemoryStore();
  (globalThis as Record<string, unknown>).__cosignoStore = store;
  resetRateLimitsForTests();
  process.env.PLANNER_API_KEY = "test-key";
  process.env.PLANNER_MODEL_DEFAULT = "test-model";
  const { resetPlannerCacheForTests } = await import("../src/lib/agent/provider");
  resetPlannerCacheForTests();
});

/** A real, minimal PNG the sniffer will accept. */
function pngBytes(): Buffer {
  const b = Buffer.alloc(24);
  Buffer.from("89504e470d0a1a0a", "hex").copy(b, 0);
  b.writeUInt32BE(1200, 16);
  b.writeUInt32BE(1600, 20);
  return b;
}

async function uploadPhoto(name = "IMG_4021.png") {
  const { POST } = await import("../src/app/api/sources/file/route");
  const form = new FormData();
  form.append("file", new File([new Uint8Array(pngBytes())], name, { type: "image/png" }));
  const res = await POST(new NextRequest("http://localhost/api/sources/file", { method: "POST", body: form }));
  return { status: res.status, body: await res.json() };
}

async function ask(question: string, sourceIds: string[]) {
  const { POST } = await import("../src/app/api/analyze/route");
  const res = await POST(
    new NextRequest("http://localhost/api/analyze", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ question, sourceIds }),
    })
  );
  return { status: res.status, body: await res.json() };
}

describe("attach a photo, ask about it, get an answer", () => {
  it("delivers the uploaded image to the model and returns a real answer", async () => {
    const upload = await uploadPhoto();
    expect(upload.status).toBe(200);
    expect(upload.body.source.status).toBe("ready");

    const asked = await ask("give me a detailed report on this photo", [upload.body.source.id]);
    expect(asked.status).toBe(200);

    // The model was handed the actual picture.
    expect(sent).toHaveLength(1);
    const content = (sent[0].messages as { content: unknown[] }[])[0].content as Record<string, unknown>[];
    const image = content.find((b) => b.type === "image");
    expect(image).toBeDefined();
    expect((image!.source as Record<string, string>).data).toBe(pngBytes().toString("base64"));

    // And it answered the question rather than proposing work.
    expect(sent[0].tool_choice).toBeUndefined();
    expect(asked.body.answer).toContain("navy crewneck");
    expect(asked.body.images_seen).toBe(1);
    expect(asked.body.looked_at).toContain("IMG_4021.png");
    expect(asked.body.could_not_read).toHaveLength(0);
  });

  it("never lets a filename stand in for the picture", async () => {
    const upload = await uploadPhoto("IMG_4021.png");
    await ask("what is this?", [upload.body.source.id]);

    const content = (sent[0].messages as { content: unknown[] }[])[0].content as Record<string, unknown>[];
    const text = content
      .filter((b) => b.type === "text")
      .map((b) => String(b.text))
      .join("\n");

    // The filename may appear as a caption — that is useful. What must NEVER
    // happen is the filename arriving INSTEAD of the image, which is exactly
    // what produced confident descriptions of a phone model.
    expect(content.some((b) => b.type === "image")).toBe(true);
    expect(text).not.toMatch(/image attached:/i);
    expect(text).not.toMatch(/does not read text from images/i);
  });

  it("reports an unreadable attachment instead of describing it anyway", async () => {
    // A file the server genuinely cannot read.
    const { POST } = await import("../src/app/api/sources/file/route");
    const form = new FormData();
    form.append("file", new File([new Uint8Array([0x00, 0x01, 0x02, 0x03, 0xff, 0xfe])], "mystery.bin", { type: "application/octet-stream" }));
    const res = await POST(new NextRequest("http://localhost/api/sources/file", { method: "POST", body: form }));
    const source = (await res.json()).source;
    expect(source.status).toBe("unsupported");

    const asked = await ask("describe this", [source.id]);
    expect(asked.status).toBe(200);
    expect(asked.body.images_seen).toBe(0);
    expect(asked.body.could_not_read.join(" ")).toMatch(/mystery\.bin/);

    // The model is told, in the prompt, that it cannot see the file.
    const content = (sent[0].messages as { content: unknown[] }[])[0].content as Record<string, unknown>[];
    const text = content.filter((b) => b.type === "text").map((b) => String(b.text)).join("\n");
    expect(text).toMatch(/NOT available to you/);
    expect(text).toMatch(/do not describe/i);
  });

  it("cannot read another account's attachment", async () => {
    const upload = await uploadPhoto();
    const id = upload.body.source.id;

    const auth = await import("@/lib/auth");
    vi.mocked(auth.getUserId).mockResolvedValueOnce("someone-else");

    const asked = await ask("what is this?", [id]);
    // Not found, not "here is the other person's photo".
    expect(asked.status).toBe(404);
    expect(sent).toHaveLength(0);
  });
});

describe("attach a video by its frames", () => {
  it("stores sampled frames and shows the model every one of them", async () => {
    const { POST } = await import("../src/app/api/sources/video/route");
    const form = new FormData();
    form.append("name", "walkthrough.mp4");
    form.append("mime", "video/mp4");
    form.append("duration", "42");
    form.append("width", "1920");
    form.append("height", "1080");
    form.append("size_bytes", "18400000");
    for (const [i, at] of [2.6, 13.1, 23.6, 34.1].entries()) {
      form.append("frames", new File([new Uint8Array(pngBytes())], `frame-${i}.png`, { type: "image/png" }));
      form.append("timestamps", String(at));
    }

    const res = await POST(new NextRequest("http://localhost/api/sources/video", { method: "POST", body: form }));
    expect(res.status).toBe(200);
    const source = (await res.json()).source;
    expect(source.kind).toBe("video");
    expect(source.detail.frames).toBe(4);
    // The summary says frames were sampled — it never claims the video was watched.
    expect(source.summary).toMatch(/4 frames sampled/);

    const asked = await ask("what happens in this video?", [source.id]);
    expect(asked.body.images_seen).toBe(4);
    expect(asked.body.looked_at[0]).toMatch(/walkthrough\.mp4 \(4 frames\)/);

    // Each frame is captioned with its real timestamp, so the answer can cite
    // a moment instead of guessing an order.
    const content = (sent[0].messages as { content: unknown[] }[])[0].content as Record<string, unknown>[];
    expect(content.filter((b) => b.type === "image")).toHaveLength(4);
    const captions = content.filter((b) => b.type === "text").map((b) => String(b.text)).join("\n");
    expect(captions).toMatch(/frame at 0:02/);
    expect(captions).toMatch(/frame at 0:34/);
  });

  it("refuses frames that are not really images", async () => {
    const { POST } = await import("../src/app/api/sources/video/route");
    const form = new FormData();
    form.append("name", "fake.mp4");
    form.append("frames", new File([new Uint8Array(Buffer.from("this is not an image"))], "f.jpg", { type: "image/jpeg" }));
    const res = await POST(new NextRequest("http://localhost/api/sources/video", { method: "POST", body: form }));
    expect(res.status).toBe(422);
  });
});
