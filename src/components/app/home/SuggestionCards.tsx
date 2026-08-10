"use client";

import { ArrowUpRight } from "lucide-react";
import type { Suggestion } from "@/lib/home/model";
import { staggerDelay, STAGGER_MS } from "@/lib/motion";

/**
 * Starting points, as cards rather than chips.
 *
 * A chip is a word you have to decode; a card can say what would actually
 * happen, which is the difference between "inbox" and "reads what's unread,
 * drafts the replies, asks before sending". The second one is a decision
 * someone can make.
 *
 * Clicking fills the ask box — it never starts anything. A suggestion is an
 * idea, not an instruction, and a card that silently delegates work on one
 * click teaches people not to touch the cards.
 */
export function SuggestionCards({ suggestions }: { suggestions: Suggestion[] }) {
  if (suggestions.length === 0) return null;

  function compose(text: string) {
    window.dispatchEvent(new CustomEvent("cosigno:compose", { detail: { text } }));
  }

  return (
    <div className="grid gap-2.5 sm:grid-cols-2">
      {suggestions.map((s, i) => (
        <button
          key={s.prompt}
          onClick={() => compose(s.prompt)}
          style={staggerDelay(i, STAGGER_MS.tiles)}
          className="group relative flex animate-tile-in items-start gap-3 overflow-hidden rounded-card bg-surface/70 p-3.5 text-left shadow-e1 ring-1 ring-inset ring-line/60 transition-[transform,box-shadow] duration-fast ease-brand-out hover:-translate-y-0.5 hover:shadow-e3 hover:ring-signal/40 active:translate-y-0 active:scale-[0.99] motion-reduce:hover:translate-y-0"
        >
          <span
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-btn bg-cream-deep text-base transition-transform duration-base ease-spring group-hover:scale-110 motion-reduce:group-hover:scale-100"
            aria-hidden="true"
          >
            {s.glyph}
          </span>
          <span className="min-w-0 flex-1">
            <span className="flex items-center gap-1.5">
              <span className="min-w-0 truncate text-sm font-extrabold">{s.title}</span>
              <ArrowUpRight
                size={13}
                strokeWidth={2.6}
                className="shrink-0 text-ink-soft opacity-0 transition-[opacity,transform] duration-fast group-hover:translate-x-0.5 group-hover:opacity-100"
                aria-hidden="true"
              />
            </span>
            <span className="mt-0.5 block text-pretty text-[11px] font-semibold leading-snug text-ink-soft">
              {s.detail}
            </span>
          </span>
        </button>
      ))}
    </div>
  );
}
