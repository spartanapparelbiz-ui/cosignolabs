import type { Tier } from "@/lib/types";
import { badge, dot, type BadgeTone } from "@/components/ui/styles";

// The three authorization levels, in the words the product uses:
//   auto      pre-authorized low-risk work, already done
//   approve   one press, whenever you get to it
//   type it   irreversible, so it asks you to type the word first
//
// Tier 3 used to be labelled "sign", which stopped being true when signing
// became optional everywhere. What actually separates tier 3 is the typed
// word, so that is what the badge says.
//
// The badge does not fill with color to make its point: an irreversible card
// is already the loudest thing on the page, and a solid orange block beside
// it just competes with the button that matters.
const TIER: Record<Tier, { label: string; tone: BadgeTone }> = {
  1: { label: "auto", tone: "neutral" },
  2: { label: "approve", tone: "neutral" },
  3: { label: "type it", tone: "signal" },
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
