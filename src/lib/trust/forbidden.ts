import { CATEGORY_TARGET_PREFIX } from "../rules";
import { CATEGORIES, type ActionCategory, type PermissionRuleRecord } from "../types";

/**
 * "Never" — the one setting in the Trust Center that isn't a tier.
 *
 * Tiers answer "how much ceremony does this need". Never answers "does this
 * happen at all", and there is no tier that means no. So it is stored as a
 * permission rule whose target names the engine category outright, and
 * enforced at `proposeAction`: the single function every action in the product
 * passes through on its way into existence.
 *
 * Enforcing it there rather than at each caller is the whole point. A check in
 * the three places that propose actions today would be correct today and
 * wrong the first time someone adds a fourth. A forbidden capability must be
 * unreachable, not merely un-offered.
 */

/** The rule target that names a category exactly. */
export function categoryTarget(category: ActionCategory): string {
  return `${CATEGORY_TARGET_PREFIX}${category}`;
}

/** The category a rule names, or null when it isn't a category rule. */
export function targetCategory(target: string): ActionCategory | null {
  if (!target.startsWith(CATEGORY_TARGET_PREFIX)) return null;
  const cat = target.slice(CATEGORY_TARGET_PREFIX.length) as ActionCategory;
  return CATEGORIES[cat] ? cat : null;
}

/**
 * The rule forbidding this category, if one is enabled.
 *
 * Only `requirement === "never"` counts. A category rule at any other level
 * would be a rule the Trust Center never writes, and treating it as a block
 * would forbid something the user didn't ask to forbid.
 */
export function forbiddenRuleFor(
  rules: PermissionRuleRecord[],
  category: ActionCategory
): PermissionRuleRecord | null {
  return (
    rules.find(
      (r) =>
        r.enabled &&
        r.requirement === "never" &&
        targetCategory(r.target) === category
    ) ?? null
  );
}

/** Every category the user has forbidden. */
export function forbiddenCategories(rules: PermissionRuleRecord[]): Set<ActionCategory> {
  const out = new Set<ActionCategory>();
  for (const r of rules) {
    if (!r.enabled || r.requirement !== "never") continue;
    const cat = targetCategory(r.target);
    if (cat) out.add(cat);
  }
  return out;
}

/** The refusal a forbidden category produces — in the user's own terms. */
export function forbiddenMessage(category: ActionCategory): string {
  const label = CATEGORIES[category]?.label.toLowerCase() ?? category;
  return `you've set "${label}" to never. cosigno refused this instead of asking, because never means never. change it in the trust center to allow it.`;
}

/** The rule text stored verbatim, so the rules list reads as a sentence. */
export function forbiddenText(category: ActionCategory): string {
  const label = CATEGORIES[category]?.label.toLowerCase() ?? category;
  return `never ${label}`;
}
