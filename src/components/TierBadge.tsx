import { Lock } from "lucide-react";
import type { Tier } from "@/lib/types";

// The three authorization levels, presented as cosigno speaks about them:
// AUTO runs pre-authorized low-risk work, APPROVE is one click, SIGN is the
// deliberate signature interaction (all tier-3, plus outward-facing tier-2).
const TIER_STYLES: Record<Tier, { label: string; className: string }> = {
  1: {
    label: "auto",
    className: "bg-cream-deep text-ink-soft",
  },
  2: {
    label: "approve",
    className: "bg-ink/5 text-ink ring-1 ring-inset ring-ink/20",
  },
  3: {
    label: "sign",
    className: "bg-ink text-cream",
  },
};

export function TierBadge({ tier }: { tier: Tier }) {
  const t = TIER_STYLES[tier] ?? TIER_STYLES[2];
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-pill px-2.5 py-0.5 text-[11px] font-bold lowercase tracking-wide ${t.className}`}
    >
      {tier === 3 && <Lock size={10} strokeWidth={2.5} aria-hidden="true" />}
      {t.label}
    </span>
  );
}
