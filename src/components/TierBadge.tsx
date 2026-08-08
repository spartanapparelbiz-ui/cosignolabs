import type { Tier } from "@/lib/types";
import { badge, dot, type BadgeTone } from "@/components/ui/styles";

// The three authorization levels, presented as cosigno speaks about them:
// AUTO runs pre-authorized low-risk work, APPROVE is one click, SIGN is the
// deliberate signature interaction (all tier-3, plus outward-facing tier-2).
//
// The badge states which one applies. It does not fill with color to do it:
// a card that needs a signature is already the loudest thing on the page, and
// a solid orange block beside it just competes with the button that matters.
const TIER: Record<Tier, { label: string; tone: BadgeTone }> = {
  1: { label: "auto", tone: "neutral" },
  2: { label: "approve", tone: "neutral" },
  3: { label: "sign", tone: "signal" },
};

export function TierBadge({ tier }: { tier: Tier }) {
  const t = TIER[tier] ?? TIER[2];
  return (
    <span className={badge(t.tone)}>
      <span className={dot(t.tone)} aria-hidden="true" />
      {t.label}
    </span>
  );
}
