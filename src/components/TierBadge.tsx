import { Lock } from "lucide-react";
import type { Tier } from "@/lib/types";

const TIER_STYLES: Record<Tier, { label: string; className: string }> = {
  1: {
    label: "tier 1 · auto",
    className: "bg-cream-deep text-ink-soft",
  },
  2: {
    label: "tier 2 · approve",
    className: "bg-ink/5 text-ink ring-1 ring-inset ring-ink/20",
  },
  3: {
    label: "tier 3 · locked",
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
