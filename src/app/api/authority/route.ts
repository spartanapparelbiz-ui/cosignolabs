import { NextRequest, NextResponse } from "next/server";
import { ApiError, errorResponse, requireUser } from "@/lib/api";
import { enforceLimit } from "@/lib/ratelimit";
import { parseStrict, readJsonBody, temporaryAuthoritySchema, idParamSchema } from "@/lib/schemas";
import { getStore } from "@/lib/store";
import { temporaryAuthorityAllowed } from "@/lib/tiers";
import { CATEGORIES, type ActionCategory } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Temporary authority — scoped, expiring permission grants. Always
 * explicit, visible, revocable, and audited. Only unpinned tier-2
 * categories that never require SIGN are eligible; the resolver re-checks
 * this at proposal time, so even a stored ineligible row could never
 * lower a boundary.
 */
export async function GET() {
  try {
    const userId = await requireUser();
    const now = Date.now();
    const grants = (await getStore().listTemporaryAuthority(userId)).filter(
      (g) => g.revoked_at === null && Date.parse(g.expires_at) > now
    );
    return NextResponse.json({ grants });
  } catch (err) {
    return errorResponse(err);
  }
}

export async function POST(req: NextRequest) {
  try {
    const userId = await requireUser();
    await enforceLimit("transitionMinute", userId);
    const body = parseStrict(temporaryAuthoritySchema, await readJsonBody(req), "authority");
    // The schema's enum is built from CATEGORIES' keys, so this cast is safe.
    const category = body.category as ActionCategory;
    if (!temporaryAuthorityAllowed(category)) {
      throw new ApiError(
        403,
        "not_eligible",
        `"${CATEGORIES[category].label.toLowerCase()}" can't receive temporary authority — signed and locked actions always keep their boundary.`
      );
    }
    const expiresAt = new Date(Date.now() + body.minutes * 60_000).toISOString();
    const grant = await getStore().grantTemporaryAuthority(
      userId,
      category,
      expiresAt,
      body.note ?? null
    );
    await getStore().logAudit(userId, "tier_changed", {
      temporary: true,
      category,
      minutes: body.minutes,
      expires_at: expiresAt,
    });
    return NextResponse.json({ grant });
  } catch (err) {
    return errorResponse(err);
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const userId = await requireUser();
    await enforceLimit("transitionMinute", userId);
    const id = parseStrict(
      idParamSchema,
      new URL(req.url).searchParams.get("id"),
      "grant_id"
    );
    const grant = await getStore().revokeTemporaryAuthority(userId, id);
    if (!grant) throw new ApiError(404, "not_found", "that grant doesn't exist.");
    await getStore().logAudit(userId, "tier_changed", {
      temporary: true,
      revoked: true,
      category: grant.category,
    });
    return NextResponse.json({ grant });
  } catch (err) {
    return errorResponse(err);
  }
}
