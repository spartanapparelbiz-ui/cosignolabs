import { NextRequest, NextResponse } from "next/server";
import { ApiError, errorResponse, requireUser } from "@/lib/api";
import { enforceLimit } from "@/lib/ratelimit";
import { parseStrict, readJsonBody, trustSettingSchema } from "@/lib/schemas";
import { getStore } from "@/lib/store";
import { isAllowedTierAssignment, resolveTier } from "@/lib/tiers";
import {
  CAPABILITIES,
  optionsFor,
  settingFor,
  tierForSetting,
  type TrustSetting,
} from "@/lib/trust/capabilities";
import {
  categoryTarget,
  forbiddenCategories,
  forbiddenText,
} from "@/lib/trust/forbidden";
import type { ActionCategory, Tier } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * The Trust Center's single endpoint.
 *
 * It reads and writes the same two stores the rest of the engine enforces —
 * tier settings and permission rules — rather than a third one of its own.
 * There is no "trust" table, because a setting that lived somewhere the engine
 * doesn't read would be a promise the product can't keep.
 */

async function currentSettings(userId: string) {
  const store = getStore();
  const [tierRows, rules] = await Promise.all([
    store.getTierSettings(userId),
    store.listPermissionRules(userId).catch(() => []),
  ]);
  const forbidden = forbiddenCategories(rules);
  const tiers: Record<string, Tier> = {};
  for (const cap of CAPABILITIES) {
    for (const c of cap.categories) tiers[c] = resolveTier(c, tierRows);
  }
  return {
    capabilities: CAPABILITIES.map((cap) => ({
      id: cap.id,
      icon: cap.icon,
      title: cap.title,
      detail: cap.detail,
      pinned: cap.pinned,
      // Only the answers this row can actually be set to. The client renders
      // exactly these, so a control it shows is always one the server accepts.
      options: optionsFor(cap),
      setting: settingFor(cap, tiers, forbidden),
    })),
  };
}

export async function GET() {
  try {
    const userId = await requireUser();
    return NextResponse.json(await currentSettings(userId));
  } catch (err) {
    return errorResponse(err);
  }
}

export async function PUT(req: NextRequest) {
  try {
    const userId = await requireUser();
    await enforceLimit("transitionMinute", userId);
    const body = parseStrict(trustSettingSchema, await readJsonBody(req), "trust_setting");

    const cap = CAPABILITIES.find((c) => c.id === body.capability);
    if (!cap) throw new ApiError(404, "unknown_capability", "that isn't a capability.");
    const setting = body.setting as TrustSetting;

    // A capability cosigno has no way to perform is not a setting at all.
    if (cap.locked) {
      throw new ApiError(
        403,
        "not_a_setting",
        `cosigno has no way to ${cap.title.toLowerCase()} at all. that isn't something you can turn on.`
      );
    }

    // A pinned capability cannot be made automatic. The UI doesn't offer it;
    // this is the check that holds when something other than the UI asks.
    if (setting === "always" && cap.pinned) {
      throw new ApiError(
        403,
        "tier_locked",
        `${cap.title.toLowerCase()} always needs you. cosigno can't be set to do it automatically.`
      );
    }

    const store = getStore();
    const rules = await store.listPermissionRules(userId).catch(() => []);

    if (setting === "never") {
      // Forbid every category behind the capability. Already-forbidden ones are
      // skipped so repeating the request doesn't pile up duplicate rules.
      const already = forbiddenCategories(rules);
      for (const category of cap.categories) {
        if (already.has(category)) continue;
        await store.createPermissionRule(userId, {
          text: forbiddenText(category),
          target: categoryTarget(category),
          verb: "any",
          condition: { kind: "none" },
          requirement: "never",
          confidence: "high",
        });
      }
      await store.logAudit(userId, "trust_changed", { capability: cap.id, setting });
      return NextResponse.json({ ok: true, ...(await currentSettings(userId)) });
    }

    // Leaving "never" — drop the blocks first, so a failure part-way through
    // leaves the capability MORE restricted than intended rather than less.
    for (const rule of rules) {
      if (
        rule.requirement === "never" &&
        cap.categories.some((c) => rule.target === categoryTarget(c))
      ) {
        await store.deletePermissionRule(userId, rule.id);
      }
    }

    const tier = tierForSetting(cap, setting);
    if (tier !== null) {
      for (const category of cap.categories as ActionCategory[]) {
        // Pinned categories keep their pinned tier; the server would reject the
        // write anyway, and skipping it keeps the audit trail honest.
        if (!isAllowedTierAssignment(category, tier)) continue;
        await store.setTierSetting(userId, category, tier);
      }
    }
    await store.logAudit(userId, "trust_changed", { capability: cap.id, setting });
    return NextResponse.json({ ok: true, ...(await currentSettings(userId)) });
  } catch (err) {
    return errorResponse(err);
  }
}
