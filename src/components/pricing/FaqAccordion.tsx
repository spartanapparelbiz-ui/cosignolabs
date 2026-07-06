"use client";

import { useEffect, useRef, useState } from "react";
import { ChevronDown } from "lucide-react";
import { track } from "@/lib/analytics";

export interface FaqItem {
  id: string;
  q: string;
  a: string;
}

/**
 * Deep-linkable FAQ accordion. Each item has a stable id, so
 * /pricing#what-counts-as-an-action opens and scrolls to that answer on load.
 * Panels animate open with the grid-rows 0fr→1fr technique (smooth auto
 * height, transform/opacity-free but GPU-cheap); collapses to instant under
 * prefers-reduced-motion via the global rule.
 */
export function FaqAccordion({ items }: { items: FaqItem[] }) {
  const [open, setOpen] = useState<Set<string>>(new Set());
  const firstHash = useRef(true);

  useEffect(() => {
    if (!firstHash.current) return;
    firstHash.current = false;
    const hash = window.location.hash.slice(1);
    if (hash && items.some((i) => i.id === hash)) {
      setOpen(new Set([hash]));
      // let the panel expand, then bring it into view
      requestAnimationFrame(() =>
        document.getElementById(hash)?.scrollIntoView({ block: "center" })
      );
    }
  }, [items]);

  function toggle(id: string) {
    setOpen((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else {
        next.add(id);
        track("faq_open", { id });
        // reflect the open item in the URL so it's shareable
        history.replaceState(null, "", `#${id}`);
      }
      return next;
    });
  }

  return (
    <div className="mt-8 flex flex-col gap-3">
      {items.map((item) => {
        const isOpen = open.has(item.id);
        return (
          <div
            key={item.id}
            id={item.id}
            className="scroll-mt-24 rounded-card bg-white/70 shadow-soft"
          >
            <button
              onClick={() => toggle(item.id)}
              aria-expanded={isOpen}
              aria-controls={`${item.id}-panel`}
              className="flex min-h-[44px] w-full items-center justify-between gap-3 px-5 py-4 text-left"
            >
              <span className="font-extrabold lowercase">{item.q}</span>
              <ChevronDown
                size={18}
                strokeWidth={2.5}
                aria-hidden="true"
                className={`shrink-0 text-ink-soft transition-transform duration-base ease-brand-out ${
                  isOpen ? "rotate-180" : ""
                }`}
              />
            </button>
            <div
              id={`${item.id}-panel`}
              role="region"
              className={`grid transition-[grid-template-rows] duration-base ease-brand-out ${
                isOpen ? "grid-rows-[1fr]" : "grid-rows-[0fr]"
              }`}
            >
              <div className="overflow-hidden">
                <p className="px-5 pb-5 text-sm leading-relaxed text-ink-soft">
                  {item.a}
                </p>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
