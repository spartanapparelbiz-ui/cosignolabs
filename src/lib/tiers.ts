import { signRequired } from "./sign";
import {
  ActionCategory,
  CATEGORIES,
  TemporaryAuthorityRecord,
  Tier,
  TierSettingRecord,
} from "./types";

/**
 * Resolve the tier the SERVER assigns to an action. This is the only tier
 * that matters: the client cannot escalate or de-escalate, and the agent
 * cannot self-assign a tier. Rules:
 *  - Pinned (tier-3) categories always resolve to 3.
 *  - User settings may move an unpinned category between tiers 1 and 2 only.
 *  - A live temporary-authority grant may lower an eligible tier-2 category
 *    to 1 until it expires or is revoked — never a pinned or SIGN category.
 *  - Anything unknown falls back to tier 2 (approval required).
 */
export function resolveTier(
  category: ActionCategory,
  settings: TierSettingRecord[],
  grants: TemporaryAuthorityRecord[] = [],
  now: Date = new Date()
): Tier {
  const meta = CATEGORIES[category];
  if (!meta) return 2;
  if (meta.pinned) return 3;
  const custom = settings.find((s) => s.category === category);
  const base =
    custom && (custom.tier === 1 || custom.tier === 2) ? custom.tier : meta.defaultTier;
  if (base === 2 && activeGrantFor(category, grants, now)) return 1;
  return base;
}

/** The live (unexpired, unrevoked) grant for a category, if any. */
export function activeGrantFor(
  category: ActionCategory,
  grants: TemporaryAuthorityRecord[],
  now: Date = new Date()
): TemporaryAuthorityRecord | null {
  return (
    grants.find(
      (g) =>
        g.category === category &&
        g.revoked_at === null &&
        Date.parse(g.expires_at) > now.getTime() &&
        temporaryAuthorityAllowed(category)
    ) ?? null
  );
}

/**
 * Which categories may receive temporary authority: unpinned, tier-2-movable,
 * and never SIGN categories — the deliberate boundary can't be rented out.
 */
export function temporaryAuthorityAllowed(category: ActionCategory): boolean {
  return isAllowedTierAssignment(category, 1) && !signRequired(category, 2);
}

/** Validate a user-requested tier assignment for settings. */
export function isAllowedTierAssignment(
  category: ActionCategory,
  tier: Tier
): boolean {
  const meta = CATEGORIES[category];
  if (!meta || meta.pinned) return false;
  return tier === 1 || tier === 2;
}
