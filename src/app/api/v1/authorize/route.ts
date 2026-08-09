import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { errorResponse } from "@/lib/api";
import { parseStrict, readJsonBody } from "@/lib/schemas";
import { enforceLimit } from "@/lib/ratelimit";
import { decide } from "@/lib/authz/decide";
import { hashPayload, issueToken } from "@/lib/authz/token";
import { appendDecision, countPriorClean, orgForKey } from "@/lib/authz/store";

/**
 * POST /api/v1/authorize — the primitive.
 *
 * An agent describes what it is about to do. cosigno evaluates the policy
 * floor, the blast radius, and the actor's earned pattern, writes an immutable
 * decision to the ledger, and returns either a scoped Approval Token or a
 * pending/denied decision with the reasons.
 *
 * Authenticated by API key (agents have no browser session). The key never
 * appears in a response and is compared in constant time.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const schema = z
  .object({
    actor: z.string().min(1).max(200),
    action: z.string().min(1).max(120),
    resource: z.string().min(1).max(400),
    payload: z.record(z.string(), z.unknown()).optional(),
    context: z
      .object({
        amount_cents: z.number().int().min(0).max(1_000_000_000).optional(),
        records_affected: z.number().int().min(0).max(10_000_000).optional(),
        external_recipients: z.number().int().min(0).max(10_000_000).optional(),
        reversible: z.boolean().optional(),
        pii: z.boolean().optional(),
        production: z.boolean().optional(),
        credential_change: z.boolean().optional(),
      })
      .strict()
      .optional(),
    ttl_seconds: z.number().int().min(5).max(900).optional(),
  })
  .strict();

function bearer(req: NextRequest): string | null {
  const h = req.headers.get("authorization") ?? "";
  const m = /^Bearer\s+(.+)$/i.exec(h.trim());
  return m ? m[1].trim() : null;
}

export async function POST(req: NextRequest) {
  try {
    const key = bearer(req);
    const org = key ? orgForKey(key) : null;
    if (!org) {
      return NextResponse.json(
        { error: "unauthorized", message: "Provide a valid API key as a Bearer token." },
        { status: 401 }
      );
    }

    // Rate limit per org, not per IP: an agent fleet shares one budget.
    await enforceLimit("transitionMinute", `authz:${org}`);

    const body = parseStrict(schema, await readJsonBody(req), "authorize");
    const payload = body.payload ?? {};

    const decision = decide({
      actor: body.actor,
      action: body.action,
      resource: body.resource,
      context: body.context,
      priorClean: countPriorClean(org, body.actor, body.action),
    });

    const record = appendDecision({
      org,
      actor: body.actor,
      action: body.action,
      resource: body.resource,
      payload_hash: hashPayload(payload),
      status: decision.status,
      authority: decision.authority,
      tier: decision.tier,
      blast_level: decision.blast.level,
      blast_score: decision.blast.score,
      policy_trace: decision.policy_trace,
      token_jti: null,
      executed_at: null,
    });

    // A token is issued ONLY when the decision cleared automatically. Pending
    // decisions get their token after a human signs — never before.
    let token: string | null = null;
    if (decision.status === "approved") {
      const issued = issueToken({
        org,
        actor: body.actor,
        action: body.action,
        resource: body.resource,
        payload,
        decision_id: record.id,
        authority: "auto",
        ttl_seconds: body.ttl_seconds,
      });
      token = issued.token;
      record.token_jti = issued.claims.jti;
    }

    return NextResponse.json(
      {
        decision_id: record.id,
        status: decision.status,
        authority: decision.authority,
        approved: decision.status === "approved",
        token,
        blast_radius: {
          level: decision.blast.level,
          score: decision.blast.score,
          dimensions: decision.blast.dimensions,
        },
        policy_trace: decision.policy_trace,
        registered_action: decision.registered,
      },
      { status: 200 }
    );
  } catch (err) {
    return errorResponse(err);
  }
}
