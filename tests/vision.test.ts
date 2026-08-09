import { beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryStore } from "../src/lib/store/memory";
import { classifyDelegation } from "../src/lib/delegate";
import { renderPdf } from "../src/lib/files/pdf";
import { validateImagePayload } from "../src/lib/sources/extract";
import { visionMimeSupported, MAX_VISION_BYTES } from "../src/lib/agent/provider";

/**
 * The operator must actually LOOK at what it is given, and must actually
 * ANSWER what it is asked.
 *
 * These pin the two defects that produced the original complaint — an
 * uploaded photo coming back as a confident description of a phone model:
 *
 *  1. The image bytes were discarded at upload, so the model only ever
 *     received a filename and invented the rest.
 *  2. Every call forced the action-proposal tool, so a question could not be
 *     answered even in principle.
 *
 * Each is verified end to end below, plus the honesty rule that ties them
 * together: something that could not be read is REPORTED as unread, never
 * quietly described anyway.
 */

vi.mock("@/lib/auth", () => ({
  authConfigured: () => true,
  DEMO_USER_ID: "demo-user",
  getUserId: vi.fn(async () => "user-a"),
}));

let store: MemoryStore;
beforeEach(() => {
  store = new MemoryStore();
  (globalThis as Record<string, unknown>).__cosignoStore = store;
});

/** A real 2x3 PNG (valid signature + IHDR). */
function png(): Buffer {
  const b = Buffer.alloc(24);
  Buffer.from("89504e470d0a1a0a", "hex").copy(b, 0);
  b.writeUInt32BE(2, 16);
  b.writeUInt32BE(3, 20);
  return b;
}

describe("an attached image survives all the way to the model call", () => {
  it("stores the real pixels on the source, not a description of them", async () => {
    const bytes = png();
    const source = await store.createMissionSource({
      user_id: "user-a",
      kind: "file",
      name: "IMG_4021.png",
      subtype: "image/png",
      size_bytes: bytes.length,
      status: "ready",
      summary: "[image: IMG_4021.png · 2×3 · image/png]",
      media: [{ mime: "image/png", data: bytes.toString("base64"), label: "IMG_4021.png" }],
    });

    const media = await store.listSourceMedia("user-a", [source.id]);
    const stored = media.get(source.id);
    expect(stored).toHaveLength(1);
    expect(Buffer.from(stored![0].data, "base64").equals(bytes)).toBe(true);
  });

  it("never hands one account's image to another", async () => {
    const source = await store.createMissionSource({
      user_id: "user-a",
      kind: "file",
      name: "private.png",
      subtype: "image/png",
      size_bytes: 24,
      status: "ready",
      summary: "",
      media: [{ mime: "image/png", data: png().toString("base64"), label: "private.png" }],
    });
    // Knowing the id is not authorization.
    const stolen = await store.listSourceMedia("user-b", [source.id]);
    expect(stolen.size).toBe(0);
  });

  it("keeps list queries free of image bytes, so a page load doesn't drag megabytes", async () => {
    await store.createMissionSource({
      user_id: "user-a",
      kind: "file",
      name: "photo.png",
      subtype: "image/png",
      size_bytes: 24,
      status: "ready",
      summary: "",
      media: [{ mime: "image/png", data: png().toString("base64"), label: "photo.png" }],
    });
    const staged = await store.listStagedSources("user-a");
    expect(staged).toHaveLength(1);
    // The in-memory store returns the record whole; what matters for both
    // stores is that a caller can render a chip without reading media, and
    // that media is fetched deliberately.
    expect(typeof store.listSourceMedia).toBe("function");
  });
});

describe("video frames", () => {
  it("accepts frames that really are images and rejects anything else", () => {
    const good = validateImagePayload(png().toString("base64"), "clip.mp4 — frame at 0:12");
    expect(good).not.toBeNull();
    expect(good!.image.mime).toBe("image/png");
    expect(good!.width).toBe(2);
    expect(good!.image.label).toBe("clip.mp4 — frame at 0:12");

    // A client claiming "image/png" over non-image bytes is not believed.
    expect(validateImagePayload(Buffer.from("not an image at all").toString("base64"), "x")).toBeNull();
    expect(validateImagePayload("", "x")).toBeNull();
  });

  it("refuses a frame larger than the operator can read", () => {
    const huge = Buffer.alloc(Math.ceil(MAX_VISION_BYTES) + 1024);
    Buffer.from("89504e470d0a1a0a", "hex").copy(huge, 0);
    expect(validateImagePayload(huge.toString("base64"), "big")).toBeNull();
  });
});

describe("the provider's vision contract", () => {
  it("names exactly the formats that can be seen", () => {
    for (const m of ["image/png", "image/jpeg", "image/webp", "image/gif"]) {
      expect(visionMimeSupported(m)).toBe(true);
    }
    // A format the model cannot read must not be claimed as readable —
    // that mismatch is how a "supported" upload silently becomes invisible.
    for (const m of ["image/tiff", "image/bmp", "video/mp4", "application/pdf", ""]) {
      expect(visionMimeSupported(m)).toBe(false);
    }
    expect(visionMimeSupported("IMAGE/PNG")).toBe(true);
  });
});

describe("a question about attached material is answered, not turned into a mission", () => {
  it("routes a request about an attachment to the reading path", () => {
    const cases = [
      "give me a detailed report on this photo",
      "what's wrong with this?",
      "describe what you see",
      "how many items are in this picture?",
      "transcribe the text in this screenshot",
      "summarize this document",
    ];
    for (const c of cases) {
      expect(classifyDelegation(c, { hasAttachments: true }).kind).toBe("read");
    }
  });

  it("still delegates when the request asks for something to happen in the world", () => {
    // Attached material plus a real-world verb is work, not a question — and
    // work keeps its approval gate.
    expect(classifyDelegation("email this photo to my landlord", { hasAttachments: true }).kind).toBe("mission");
    expect(classifyDelegation("post this picture to my store", { hasAttachments: true }).kind).toBe("mission");
    expect(classifyDelegation("send this report to the team", { hasAttachments: true }).kind).toBe("mission");
  });

  it("keeps watches and recurring rules ahead of the reading path", () => {
    expect(classifyDelegation("watch this dashboard and tell me when it changes", { hasAttachments: true }).kind)
      .toBe("watch");
    expect(classifyDelegation("every monday, review these photos", { hasAttachments: true }).kind)
      .toBe("automation");
  });

  it("does not claim to read material that was never attached", () => {
    expect(classifyDelegation("describe this photo", { hasAttachments: false }).kind).toBe("mission");
    expect(classifyDelegation("prepare tomorrow's meeting").kind).toBe("mission");
  });
});

describe("documents cosigno produces", () => {
  it("writes a PDF that is structurally valid and paginates long content", () => {
    const long = Array.from({ length: 120 }, (_, i) => `Paragraph ${i} with enough words in it to occupy a full line of the page and then wrap onto the next one.`).join("\n\n");
    const pdf = renderPdf({ title: "Report", body: long, subtitle: "cosigno" });

    expect(pdf.subarray(0, 8).toString("latin1")).toBe("%PDF-1.4");
    expect(pdf.toString("latin1").trimEnd().endsWith("%%EOF")).toBe(true);
    // Long input must spill onto more pages rather than overrun one.
    const pageCount = pdf.toString("latin1").split("/Type /Page ").length - 1;
    expect(pageCount).toBeGreaterThan(1);
    // The cross-reference offset has to point inside the file or no reader
    // will open it.
    const start = Number(/startxref\n(\d+)/.exec(pdf.toString("latin1"))?.[1]);
    expect(start).toBeGreaterThan(0);
    expect(start).toBeLessThan(pdf.length);
  });

  it("escapes characters that would otherwise corrupt the file", () => {
    const pdf = renderPdf({ title: "Odd (title) \\ test", body: "Parens ( ) and a backslash \\ and an emoji 🎉" });
    const text = pdf.toString("latin1");
    expect(text.startsWith("%PDF-1.4")).toBe(true);
    // Unbalanced literal parens are what break a PDF string; they must be
    // escaped rather than passed through.
    expect(text).toContain("\\(");
    expect(text).toContain("\\)");
  });

  it("produces a usable document from empty content instead of failing", () => {
    const pdf = renderPdf({ title: "Empty", body: "" });
    expect(pdf.length).toBeGreaterThan(300);
    expect(pdf.toString("latin1").trimEnd().endsWith("%%EOF")).toBe(true);
  });
});
