import { NextRequest, NextResponse } from "next/server";
import { ApiError, errorResponse, requireUser } from "@/lib/api";
import { getStore } from "@/lib/store";
import { isAllowedTierAssignment, resolveTier } from "@/lib/tiers";
import { ActionCategory, CATEGORIES, CATEGORY_LIST, Tier } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const userId = await requireUser();
    const settings = await getStore().getTierSettings(userId);
    const categories = CATEGORY_LIST.map((meta) => ({
      ...meta,
      tier: resolveTier(meta.category, settings),
    }));
    return NextResponse.json({ categories });
  } catch (err) {
    return errorResponse(err);
  }
}

/**
 * Move an unpinned category between tiers 1 and 2. Tier-3 categories are
 * pinned and rejected server-side no matter what the client sends.
 */
export async function PUT(req: NextRequest) {
  try {
    const userId = await requireUser();
    const body = await req.json().catch(() => ({}));
    const category = body.category as ActionCategory;
    const tier = Number(body.tier) as Tier;

    if (!category || !(category in CATEGORIES)) {
      throw new ApiError(400, "bad_category", "Unknown action category.");
    }
    if (!isAllowedTierAssignment(category, tier)) {
      throw new ApiError(
        403,
        "tier_locked",
        CATEGORIES[category].pinned
          ? `"${CATEGORIES[category].label}" is pinned to tier 3 and cannot be moved.`
          : "Categories can only be assigned tier 1 or tier 2."
      );
    }

    await getStore().setTierSetting(userId, category, tier);
    return NextResponse.json({ ok: true, category, tier });
  } catch (err) {
    return errorResponse(err);
  }
}
