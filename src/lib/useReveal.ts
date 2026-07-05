"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Play-once-on-scroll-into-view. Returns a ref to attach and a boolean that
 * flips true the first time the element enters the viewport, then never
 * re-triggers. Under prefers-reduced-motion it starts revealed so nothing
 * is hidden behind an animation that won't play.
 */
export function useReveal<T extends HTMLElement = HTMLDivElement>(
  rootMargin = "0px 0px -10% 0px"
) {
  const ref = useRef<T | null>(null);
  const [shown, setShown] = useState(false);

  useEffect(() => {
    if (
      typeof window !== "undefined" &&
      window.matchMedia?.("(prefers-reduced-motion: reduce)").matches
    ) {
      setShown(true);
      return;
    }
    const el = ref.current;
    if (!el || shown) return;
    if (typeof IntersectionObserver === "undefined") {
      setShown(true);
      return;
    }
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setShown(true);
          io.disconnect();
        }
      },
      { rootMargin, threshold: 0.15 }
    );
    io.observe(el);
    // Safety net: content must never stay hidden. If the observer hasn't
    // fired (flaky environments, non-scrolling full-page capture), reveal
    // anyway so nothing renders as a blank void.
    const fallback = setTimeout(() => setShown(true), 1500);
    return () => {
      io.disconnect();
      clearTimeout(fallback);
    };
  }, [shown, rootMargin]);

  return { ref, shown };
}
