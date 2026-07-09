import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { ApiError, errorResponse, requireUser } from "@/lib/api";
import { enforceLimit } from "@/lib/ratelimit";
import { parseStrict, readJsonBody } from "@/lib/schemas";
import { getStore } from "@/lib/store";
import { requiresConsent } from "@/lib/integrations/mcp/consent";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const schema = z
  .object({
    name: z.string().trim().min(1).max(64),
    enabled: z.boolean().optional(),
    /** Explicit consent acknowledgement — required to enable a sensitive tool. */
    consent: z.boolean().optional(),
  })
  .strict();

/**
 * Enable/disable a single MCP tool and record consent. A tool the classifier
 * marked sensitive cannot be enabled without `consent: true`; consent stamps a
 * timestamp on the row. Disabling always clears the enabled flag. This is the
 * explicit, per-tool opt-in — nothing an MCP server advertises runs until the
 * user turns it on here.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const userId = await requireUser();
    await enforceLimit("transitionMinute", userId);
    const { id } = await params;
    const body = parseStrict(schema, await readJsonBody(req), "mcp_tools");

    const store = getStore();
    const tool = await store.getMcpTool(userId, id, body.name);
    if (!tool) {
      throw new ApiError(404, "not_found", "that tool isn't on this server.");
    }

    if (body.enabled) {
      if (requiresConsent(tool) && !body.consent && !tool.consented_at) {
        throw new ApiError(
          428,
          "consent_required",
          "this tool can read or change data — confirm you want it enabled."
        );
      }
      await store.setMcpTool(userId, id, body.name, {
        enabled: true,
        consented_at: requiresConsent(tool) ? tool.consented_at ?? new Date().toISOString() : tool.consented_at,
      });
    } else {
      await store.setMcpTool(userId, id, body.name, { enabled: false });
    }

    const tools = await store.listMcpTools(userId, id);
    return NextResponse.json({ tools });
  } catch (err) {
    return errorResponse(err);
  }
}
