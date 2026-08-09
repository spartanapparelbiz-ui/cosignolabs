import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { ApiError, errorResponse, requireUser } from "@/lib/api";
import { enforceLimit } from "@/lib/ratelimit";
import { parseStrict, readJsonBody } from "@/lib/schemas";
import { parseOpenApiText } from "@/lib/integrations/openapi";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// The whole request body is capped at 100 kB (readJsonBody); keep the spec
// field under that with room for the JSON envelope so the honest limit is the
// one the user actually hits.
const schema = z.object({ spec: z.string().min(1).max(90_000) }).strict();

/**
 * Parse a pasted OpenAPI/Swagger document into detected actions with
 * SERVER-recommended risk tiers. Read-only: this stores nothing, fetches
 * nothing, holds no secret, and executes nothing — it only reads the document
 * so the user can review the detected actions before creating a custom API
 * tool through the existing (SSRF-checked, encrypted) /api/connections/custom
 * path. The user must supply the credential and confirm there.
 */
export async function POST(req: NextRequest) {
  try {
    const userId = await requireUser();
    await enforceLimit("transitionMinute", userId);
    const body = parseStrict(schema, await readJsonBody(req), "openapi_import");
    const detected = parseOpenApiText(body.spec);
    if (detected.actions.length === 0) {
      throw new ApiError(
        400,
        "no_actions",
        detected.notes[0] ?? "No operations were detected in that spec."
      );
    }
    return NextResponse.json({ detected });
  } catch (err) {
    return errorResponse(err);
  }
}
