import type { Tier } from "@/lib/types";

const TIER_STYLES: Record<Tier, { label: string; className: string }> = {
  1: {
    label: "Tier 1 · Auto",
    className: "border-line bg-cream-deep text-ink-soft",
  },
  2: {
    label: "Tier 2 · Approve",
    className: "border-ink bg-cream text-ink",
  },
  3: {
    label: "Tier 3 · Locked",
    className: "border-ink bg-ink text-cream",
  },
};

export function TierBadge({ tier }: { tier: Tier }) {
  const t = TIER_STYLES[tier] ?? TIER_STYLES[2];
  return (
    <span
      className={`inline-flex items-center rounded-pill border px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-wide ${t.className}`}
    >
      {tier === 3 && (
        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" className="mr-1">
          <rect x="5" y="10" width="14" height="10" rx="2" fill="currentColor" />
          <path d="M8 10V7a4 4 0 1 1 8 0v3" stroke="currentColor" strokeWidth="2.4" />
        </svg>
      )}
      {t.label}
    </span>
  );
}
