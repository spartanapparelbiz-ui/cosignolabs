import { ActionCategory, CATEGORIES, Tier, TierSettingRecord } from "./types";

/**
 * Resolve the tier the SERVER assigns to an action. This is the only tier
 * that matters: the client cannot escalate or de-escalate, and the agent
 * cannot self-assign a tier. Rules:
 *  - Pinned (tier-3) categories always resolve to 3.
 *  - User settings may move an unpinned category between tiers 1 and 2 only.
 *  - Anything unknown falls back to tier 2 (approval required).
 */
export function resolveTier(
  category: ActionCategory,
  settings: TierSettingRecord[]
): Tier {
  const meta = CATEGORIES[category];
  if (!meta) return 2;
  if (meta.pinned) return 3;
  const custom = settings.find((s) => s.category === category);
  if (custom && (custom.tier === 1 || custom.tier === 2)) return custom.tier;
  return meta.defaultTier;
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
