import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { errorResponse } from "@/lib/api";
import { parseStrict, readJsonBody } from "@/lib/schemas";
import { enforceLimit } from "@/lib/ratelimit";
import { verifyToken } from "@/lib/authz/token";
import { markExecuted, orgForKey, tokenState } from "@/lib/authz/store";

/**
 * POST /api/v1/tokens/verify — the enforcement point.
 *
 * Called by the tool boundary (SDK wrapper, MCP gateway, or API proxy) at the
 * moment of execution. The token is checked against the EXACT payload about to
 * run and is burned on success, so it cannot be replayed and cannot be
 * re-pointed at a larger or different action than the one authorized.
 *
 * A failure here means: do not execute.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const schema = z
  .object({
    token: z.string().min(8).max(4000),
    /** The action about to execute — must match what was authorized. */
    action: z.string().max(120).optional(),
    actor: z.string().max(200).optional(),
    /** The exact payload about to execute — re-hashed and compared. */
    payload: z.record(z.string(), z.unknown()).optional(),
  })
  .strict();

function bearer(req: NextRequest): string | null {
  const m = /^Bearer\s+(.+)$/i.exec((req.headers.get("authorization") ?? "").trim());
  return m ? m[1].trim() : null;
}

export async function POST(req: NextRequest) {
  try {
    const key = bearer(req);
    const org = key ? orgForKey(key) : null;
    if (!org) {
      return NextResponse.json(
        { error: "unauthorized", message: "provide a valid API key as a Bearer token." },
        { status: 401 }
      );
    }
    await enforceLimit("transitionMinute", `authz:${org}`);

    const body = parseStrict(schema, await readJsonBody(req), "verify");

    const res = verifyToken(
      body.token,
      { action: body.action, actor: body.actor, payload: body.payload },
      tokenState
    );

    if (!res.valid) {
      // 200 with valid:false — this is a decision, not a transport error. The
      // caller MUST branch on `valid`, and a hard failure would be ambiguous.
      return NextResponse.json({ valid: false, reason: res.reason, execute: false }, { status: 200 });
    }

    // Cross-org tokens never verify, even with a valid key.
    if (res.claims.org !== org) {
      return NextResponse.json({ valid: false, reason: "wrong_org", execute: false }, { status: 200 });
    }

    markExecuted(res.claims.decision_id);

    return NextResponse.json({
      valid: true,
      execute: true,
      decision_id: res.claims.decision_id,
      actor: res.claims.actor,
      action: res.claims.action,
      resource: res.claims.resource,
      authority: res.claims.authority,
    });
  } catch (err) {
    return errorResponse(err);
  }
}
