import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { ApiError, errorResponse, requireUser } from "@/lib/api";
import { enforceLimit } from "@/lib/ratelimit";
import { parseStrict, readJsonBody } from "@/lib/schemas";
import { getStore } from "@/lib/store";
import {
  categoryIsSensitive,
  CATEGORY_RISK,
  TOOL_CATEGORIES,
  type ToolCategory,
} from "@/lib/integrations/mcp/classify";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const schema = z
  .object({
    name: z.string().trim().min(1).max(64),
    category: z.enum(TOOL_CATEGORIES as [ToolCategory, ...ToolCategory[]]),
  })
  .strict();

/**
 * ASK ONCE, REMEMBER — the human half of auto-classification.
 *
 * When the classifier isn't confident about what a tool does, the UI asks. This
 * records the answer: the category becomes the user's (`classified_by: "user"`)
 * and re-discovery will not overwrite it.
 *
 * Two guarantees make this safe to expose:
 *
 *  1. Re-categorising RE-ARMS consent. Sensitivity is derived from the new
 *     category, and any prior consent is cleared whenever the new category is
 *     sensitive — so a tool moved from "read" to "delete" cannot keep an
 *     acknowledgement the user gave when they believed it only read.
 *
 *  2. The tier is never chosen here. The user names what the tool DOES; the
 *     server decides what that requires (CATEGORY_RISK → tier). Letting a
 *     client pick a tier would be letting it pick its own approval level,
 *     which is precisely what the rest of this system exists to prevent.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const userId = await requireUser();
    await enforceLimit("transitionMinute", userId);
    const { id } = await params;
    const body = parseStrict(schema, await readJsonBody(req), "mcp_classify");

    const store = getStore();
    const tool = await store.getMcpTool(userId, id, body.name);
    if (!tool) throw new ApiError(404, "not_found", "that tool isn't on this server.");

    const sensitive = categoryIsSensitive(body.category, false);
    const changed = tool.category !== body.category;

    await store.setMcpTool(userId, id, body.name, {
      category: body.category,
      classified_by: "user",
      // A human's answer isn't a confidence score — the field belongs to the
      // classifier, and leaving a stale 0.2 next to a decided category would
      // read as "we're still unsure" about something that is now settled.
      confidence: null,
      sensitive,
      // Consent was given against the OLD understanding of this tool. If the
      // meaning changed and the new meaning is sensitive, ask again.
      ...(changed && sensitive ? { consented_at: null, enabled: false } : {}),
    });

    await store.logAudit(userId, "connector_action", {
      connection_id: id,
      tool: body.name,
      classified: body.category,
      by: "user",
    });

    const tools = await store.listMcpTools(userId, id);
    return NextResponse.json({
      tools,
      category: body.category,
      risk: CATEGORY_RISK[body.category],
      reconsentRequired: changed && sensitive,
    });
  } catch (err) {
    return errorResponse(err);
  }
}
