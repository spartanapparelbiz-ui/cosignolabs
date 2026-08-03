import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { errorResponse, requireUser } from "@/lib/api";
import { parseStrict, readJsonBody } from "@/lib/schemas";
import { listDecisions } from "@/lib/authz/store";
import { parseRule, simulate, type DraftRule } from "@/lib/authz/simulate";

/**
 * POST /api/v1/simulate — replay a draft policy against real history.
 *
 * Session-authenticated: this reads an organization's decision ledger, so it
 * is an operator tool, not an agent endpoint.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const schema = z
  .object({
    text: z.string().min(3).max(400).optional(),
    rule: z
      .object({
        action: z.string().max(120).optional(),
        actor: z.string().max(200).optional(),
        min_amount_cents: z.number().int().min(0).max(1_000_000_000).optional(),
        min_blast_level: z.enum(["minimal", "low", "moderate", "high", "severe"]).optional(),
        requirement: z.enum(["auto", "approve", "sign", "deny"]),
      })
      .strict()
      .optional(),
  })
  .strict();

export async function POST(req: NextRequest) {
  try {
    const userId = await requireUser();
    const body = parseStrict(schema, await readJsonBody(req), "simulate");

    let rule: DraftRule;
    let confidence: "high" | "low" = "high";
    if (body.rule) {
      rule = body.rule as DraftRule;
    } else if (body.text) {
      const parsed = parseRule(body.text);
      rule = parsed.rule;
      confidence = parsed.confidence;
    } else {
      return NextResponse.json(
        { error: "invalid_input", message: "provide either `text` or `rule`." },
        { status: 400 }
      );
    }

    const history = listDecisions(`org_${userId}`, 500).concat(listDecisions("org_demo", 500));
    const result = simulate(rule, history);

    return NextResponse.json(
      { ...result, confidence, history_size: history.length },
      { headers: { "cache-control": "no-store" } }
    );
  } catch (err) {
    return errorResponse(err);
  }
}
