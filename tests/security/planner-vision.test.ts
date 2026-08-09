import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * What the planner actually PUTS ON THE WIRE.
 *
 * The original defect was invisible from the outside: everything looked
 * wired up, the model answered confidently, and the answer was about a photo
 * it had never been sent. The only way to keep that from coming back is to
 * assert the request body itself — that an image block is really there, and
 * that a call which asked for prose is not silently forced into a tool.
 *
 * The SDK is stubbed, so nothing here reaches a network or spends money.
 */

const created: Record<string, unknown>[] = [];

vi.mock("@anthropic-ai/sdk", () => {
  class FakeProvider {
    messages = {
      create: async (params: Record<string, unknown>) => {
        created.push(params);
        return {
          content: [{ type: "text", text: "A navy crewneck sweatshirt on a wooden table." }],
          usage: { input_tokens: 1200, output_tokens: 40 },
        };
      },
    };
    constructor(public opts: unknown) {}
  }
  return { default: FakeProvider };
});

const PIXEL =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";

beforeEach(async () => {
  created.length = 0;
  process.env.PLANNER_API_KEY = "test-key";
  process.env.PLANNER_MODEL_DEFAULT = "test-model";
  const { resetPlannerCacheForTests } = await import("../../src/lib/agent/provider");
  resetPlannerCacheForTests();
});

describe("images reach the model", () => {
  it("sends a real image block, before the instruction about it", async () => {
    const { callPlanner } = await import("../../src/lib/agent/provider");
    await callPlanner({
      model: "test-model",
      maxTokens: 1024,
      system: "you read things",
      userContent: "give me a detailed report on this photo",
      images: [{ mime: "image/png", data: PIXEL, label: "IMG_4021.png" }],
    });

    expect(created).toHaveLength(1);
    const content = (created[0].messages as { content: unknown[] }[])[0].content as Record<string, unknown>[];

    const image = content.find((b) => b.type === "image");
    expect(image).toBeDefined();
    const source = image!.source as Record<string, string>;
    expect(source.media_type).toBe("image/png");
    // The ACTUAL bytes — not a filename, not a description of the picture.
    expect(source.data).toBe(PIXEL);

    // Image first, instruction last: the question is read with the picture
    // already in view.
    expect(content.findIndex((b) => b.type === "image")).toBeLessThan(
      content.findIndex((b) => b.type === "text" && String(b.text).includes("detailed report"))
    );
  });

  it("answers in prose when no structured output was asked for", async () => {
    const { callPlanner } = await import("../../src/lib/agent/provider");
    const result = await callPlanner({
      model: "test-model",
      maxTokens: 1024,
      system: "you read things",
      userContent: "what is this?",
      images: [{ mime: "image/png", data: PIXEL, label: "x.png" }],
    });

    // No forced tool — this is what makes answering a question possible at all.
    expect(created[0].tool_choice).toBeUndefined();
    expect(created[0].tools).toBeUndefined();
    expect(result.text).toContain("navy crewneck");
  });

  it("still forces the tool when structured output IS the point", async () => {
    const { callPlanner } = await import("../../src/lib/agent/provider");
    await callPlanner({
      model: "test-model",
      maxTokens: 1024,
      system: "you plan things",
      userContent: "archive my newsletters",
      tool: { name: "propose_actions", description: "d", input_schema: { type: "object" } },
    });
    expect(created[0].tool_choice).toEqual({ type: "tool", name: "propose_actions" });
  });

  it("tells the model when an attachment could not be sent, instead of dropping it silently", async () => {
    const { callPlanner, MAX_VISION_BYTES } = await import("../../src/lib/agent/provider");
    // Over the size ceiling, and an unreadable format: both must be reported.
    const oversized = "A".repeat(Math.ceil(MAX_VISION_BYTES * 1.4));
    await callPlanner({
      model: "test-model",
      maxTokens: 1024,
      system: "s",
      userContent: "describe these",
      images: [
        { mime: "image/png", data: oversized, label: "huge.png" },
        { mime: "image/tiff", data: PIXEL, label: "scan.tiff" },
      ],
    });

    const content = (created[0].messages as { content: unknown[] }[])[0].content as Record<string, unknown>[];
    expect(content.filter((b) => b.type === "image")).toHaveLength(0);
    const text = String(content.find((b) => b.type === "text")!.text);
    // The model is told plainly that it cannot see them — the alternative is
    // a confident description of an image that was never delivered.
    expect(text).toMatch(/2 attached images could not be opened/i);
    expect(text).toMatch(/NOT visible to you/i);
  });
});

describe("the identical-work cache cannot cross photos", () => {
  it("treats the same question about two different images as two questions", async () => {
    const { callPlanner } = await import("../../src/lib/agent/provider");
    const other =
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADElEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";

    const call = (data: string) => ({
      model: "test-model",
      maxTokens: 1024,
      system: "s",
      userContent: "what is in this photo?",
      images: [{ mime: "image/png", data, label: "photo.png" }],
    });

    await callPlanner(call(PIXEL));
    await callPlanner(call(other));
    // Two different pictures must produce two real calls. Keying the cache on
    // text alone would serve the second person an answer about the first
    // person's photo.
    expect(created).toHaveLength(2);

    // The same photo and the same words, though, is genuinely the same work.
    await callPlanner(call(PIXEL));
    expect(created).toHaveLength(2);
  });
});
