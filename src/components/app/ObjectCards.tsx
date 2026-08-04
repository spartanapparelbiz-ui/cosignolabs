"use client";

import type { ObjectCard, ObjectView } from "@/lib/objectView";

/**
 * Change cards — the visual language for "what changed".
 *
 * One card per real object, with its before → after laid out so the eye reads
 * the change without decoding anything:
 *
 *     Product · Hydro Bottle
 *     Price     $22.00 → $26.00
 *     Status    draft  → published
 *
 * When the model has nothing describable to show, the caller's own sentence is
 * rendered instead. There is deliberately no payload fallback here: a JSON
 * dump is not a change card, and showing one would defeat the entire point of
 * this component existing.
 */

export function ObjectCards({ view, fallback }: { view: ObjectView; fallback?: string }) {
  if (view.empty || view.cards.length === 0) {
    return fallback ? <p className="text-xs text-ink-soft">{fallback}</p> : null;
  }

  return (
    <div className="flex flex-col gap-2">
      {view.cards.map((card, i) => (
        <Card key={`${card.type}-${card.name}-${i}`} card={card} />
      ))}
      {view.more > 0 && (
        <p className="text-[11px] text-ink-soft">
          …and {view.more} more {view.cards[0]?.type.toLowerCase() ?? "object"}
          {view.more === 1 ? "" : "s"}
        </p>
      )}
    </div>
  );
}

function Card({ card }: { card: ObjectCard }) {
  return (
    <div className="rounded-btn border border-line/70 bg-cream/50 px-3 py-2">
      <p className="flex flex-wrap items-baseline gap-x-2">
        <span className="text-[10px] font-black uppercase tracking-wider text-ink-soft">{card.type}</span>
        {card.name && <span className="text-sm font-bold">{card.name}</span>}
        <span className="text-xs text-ink-soft">{card.summary}</span>
      </p>

      {card.changes.length > 0 && (
        <dl className="mt-1.5 flex flex-col gap-1">
          {card.changes.map((c) => (
            <div key={c.label} className="flex flex-wrap items-baseline gap-x-2 text-xs">
              <dt className="min-w-[84px] text-ink-soft">{c.label}</dt>
              <dd className="flex flex-wrap items-baseline gap-x-1.5">
                {c.before !== null && (
                  <>
                    <span className="text-ink-soft line-through decoration-ink/40">{c.before}</span>
                    <span className="text-ink-soft" aria-hidden="true">
                      →
                    </span>
                  </>
                )}
                <span className="font-bold">{c.after}</span>
              </dd>
            </div>
          ))}
        </dl>
      )}
    </div>
  );
}
