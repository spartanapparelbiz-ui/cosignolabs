import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { errorResponse, requireUser } from "@/lib/api";
import { enforceLimit } from "@/lib/ratelimit";
import { parseStrict, readJsonBody } from "@/lib/schemas";
import { previewConnectorAction } from "@/lib/integrations/runtime/preview";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const schema = z
  .object({
    capability: z.string().trim().min(1).max(80),
    args: z.record(z.string(), z.unknown()).optional(),
  })
  .strict();

/**
 * DRY-RUN a connector capability. Read-only and side-effect-free: it computes
 * the tier + rule decision the real proposal WOULD reach and renders the
 * request, but creates no action card, decrypts no credential, sends nothing,
 * and increments no usage. This is the honesty surface — "show me what you
 * would do" — and it can never become a way to act without the Boundary,
 * because it never calls the propose/execute engine at all.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ key: string }> }
) {
  try {
    const userId = await requireUser();
    await enforceLimit("commandMinute", userId);
    const { key: id } = await params;
    const body = parseStrict(schema, await readJsonBody(req), "preview_connector");
    const preview = await previewConnectorAction(userId, {
      connectionId: id,
      capability: body.capability,
      args: body.args ?? {},
    });
    return NextResponse.json({ preview });
  } catch (err) {
    return errorResponse(err);
  }
}
