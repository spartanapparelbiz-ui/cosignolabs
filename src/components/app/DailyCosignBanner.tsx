"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Sun } from "lucide-react";

/**
 * Daily CoSign — a compact, honest review of what's waiting today: prepared
 * cards, missions needing an answer, warnings, and recommended missions. It
 * links each bucket to where the user acts on it INDIVIDUALLY. There is no
 * "approve everything" shortcut — that would defeat the whole product.
 */

interface Daily {
  greeting: string;
  prepared: { items: unknown[] };
  attention: { items: unknown[] };
  warnings: { items: unknown[] };
  recommended: { items: unknown[] };
  needs_decision: number;
}

export function DailyCosignBanner() {
  const [daily, setDaily] = useState<Daily | null>(null);

  useEffect(() => {
    fetch("/api/daily")
      .then((r) => r.json())
      .then((d) => d.daily && setDaily(d.daily))
      .catch(() => null);
  }, []);

  if (!daily) return null;
  const { prepared, attention, warnings, recommended } = daily;
  const nothing =
    prepared.items.length === 0 &&
    attention.items.length === 0 &&
    warnings.items.length === 0 &&
    recommended.items.length === 0;
  if (nothing) return null;

  const chips: { label: string; count: number; href: string; danger?: boolean }[] = [
    { label: "prepared for you", count: prepared.items.length, href: "/app/approvals" },
    { label: "need an answer", count: attention.items.length, href: "/app/missions" },
    { label: "warnings", count: warnings.items.length, href: "/app/needs-me", danger: true },
    { label: "recommended", count: recommended.items.length, href: "/app/needs-me" },
  ].filter((c) => c.count > 0);

  return (
    <section className="mt-4 rounded-card border border-line bg-surface p-5 shadow-well">
      <div className="flex items-center gap-2">
        <Sun size={18} className="text-signal" aria-hidden />
        <h2 className="font-display text-lg font-bold lowercase">daily cosign</h2>
      </div>
      <p className="mt-0.5 text-sm font-semibold text-ink-soft">{daily.greeting}</p>
      <div className="mt-3 flex flex-wrap gap-2">
        {chips.map((c) => (
          <Link
            key={c.label}
            href={c.href}
            className={`inline-flex items-center gap-1.5 rounded-pill border px-3 py-1 text-xs font-bold transition-colors ${
              c.danger
                ? "border-danger/40 text-danger hover:bg-danger hover:text-cream"
                : "border-ink text-ink hover:bg-ink hover:text-cream"
            }`}
          >
            {c.label}
            <span className="rounded-full bg-cream-deep px-1.5 text-[10px] text-ink-soft">{c.count}</span>
          </Link>
        ))}
      </div>
      <p className="mt-3 text-[11px] font-semibold text-ink-soft">
        approve each one individually — cosigno never offers a single &ldquo;approve everything&rdquo; button.
      </p>
    </section>
  );
}
