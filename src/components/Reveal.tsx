"use client";

import { useEffect, useState } from "react";
import { useReveal } from "@/lib/useReveal";

/**
 * Entrance motion for landing sections — ADDITIVE, never gating. The
 * legibility rule: content begins fully readable (server render and no-JS
 * both show it at full opacity) and never remains faded because the user
 * hasn't scrolled, hovered, or waited.
 *
 * How: the pre-reveal (hidden) state is applied ONLY after hydration, and
 * ONLY to elements still below the viewport at that moment — everything
 * already on screen stays visible and simply doesn't animate. Elements
 * below the fold rise in when they enter view; if the observer never fires,
 * the safety fallback in useReveal shows them anyway.
 */
export function Reveal({
  children,
  className = "",
  delay = 0,
  as: Tag = "div",
}: {
  children: React.ReactNode;
  className?: string;
  delay?: number;
  as?: "div" | "section" | "li";
}) {
  const { ref, shown } = useReveal<HTMLDivElement>();
  // Armed only after mount, and only for elements that were still below the
  // viewport then — so first paint is always fully legible.
  const [armed, setArmed] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el || shown) return;
    const rect = el.getBoundingClientRect();
    const below = rect.top > window.innerHeight * 0.9;
    if (below) setArmed(true);
    // If it's already on screen, never hide it — useReveal will mark it shown.
  }, [ref, shown]);

  const hidden = armed && !shown;
  return (
    <Tag
      // @ts-expect-error ref is valid for the small union of tags used here
      ref={ref}
      className={`${className} transition-[opacity,transform] duration-slow ease-brand-out ${
        hidden ? "opacity-0 translate-y-3" : "opacity-100 translate-y-0"
      }`}
      style={{ transitionDelay: hidden ? "0ms" : `${delay}ms` }}
    >
      {children}
    </Tag>
  );
}
