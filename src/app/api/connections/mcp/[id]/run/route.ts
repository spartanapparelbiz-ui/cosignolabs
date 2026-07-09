import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { errorResponse, requireUser } from "@/lib/api";
import { enforceLimit } from "@/lib/ratelimit";
import { parseStrict, readJsonBody } from "@/lib/schemas";
import { runMcpTool } from "@/lib/integrations/runtime/connections";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const schema = z
  .object({
    tool: z.string().trim().min(1).max(64),
    args: z.record(z.string(), z.unknown()).optional(),
  })
  .strict();

/**
 * USER-initiated tool run (the "test call" from the Connections screen). It
 * still goes through runMcpTool, which re-checks that the tool is enabled AND
 * consented before calling the server. Output is returned as untrusted data.
 * (Agent-initiated calls flow through the approval engine instead — see the
 * connection_call executor handler.)
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const userId = await requireUser();
    await enforceLimit("commandMinute", userId);
    const { id } = await params;
    const body = parseStrict(schema, await readJsonBody(req), "mcp_run");
    const result = await runMcpTool(userId, id, body.tool, body.args ?? {});
    return NextResponse.json({ result });
  } catch (err) {
    return errorResponse(err);
  }
}
