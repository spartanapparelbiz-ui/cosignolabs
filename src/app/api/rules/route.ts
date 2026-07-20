import { NextRequest, NextResponse } from "next/server";
import { errorResponse, requireUser } from "@/lib/api";
import { enforceLimit } from "@/lib/ratelimit";
import {
  parseStrict,
  permissionRulePreviewSchema,
  permissionRuleSchema,
  readJsonBody,
} from "@/lib/schemas";
import { getStore } from "@/lib/store";
import { describeRule, parsePermissionRule } from "@/lib/rules";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Custom permission rules — a user's plain-language policy over what cosigno
 * may do across their tools, parsed deterministically into a visible structured
 * constraint. Rules only ever TIGHTEN (raise the approval level or forbid an
 * action); they can never lower a boundary, so this endpoint is safe on
 * arbitrary text. The agent never writes here.
 */
export async function GET() {
  try {
    const userId = await requireUser();
    const rules = await getStore().listPermissionRules(userId);
    return NextResponse.json({ rules });
  } catch (err) {
    return errorResponse(err);
  }
}

export async function POST(req: NextRequest) {
  try {
    const userId = await requireUser();
    await enforceLimit("transitionMinute", userId);
    const raw = await readJsonBody(req);

    // `?preview` (or a preview body) parses without saving, so the UI can show
    // the structured interpretation before the user commits.
    const url = new URL(req.url);
    if (url.searchParams.get("preview") === "1") {
      const body = parseStrict(permissionRulePreviewSchema, raw, "rule_preview");
      const parsed = parsePermissionRule(body.text);
      return NextResponse.json({ parsed, description: describeRule(parsed) });
    }

    const body = parseStrict(permissionRuleSchema, raw, "rule");
    const parsed = parsePermissionRule(body.text);
    const rule = await getStore().createPermissionRule(userId, {
      text: body.text,
      ...parsed,
    });
    await getStore().logAudit(userId, "rule_created", {
      target: parsed.target,
      verb: parsed.verb,
      requirement: parsed.requirement,
    });
    return NextResponse.json({ rule, description: describeRule(parsed) });
  } catch (err) {
    return errorResponse(err);
  }
}
