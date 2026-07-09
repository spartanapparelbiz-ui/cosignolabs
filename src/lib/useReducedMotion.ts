"use client";

import { useEffect, useState } from "react";

/**
 * Tracks the visitor's prefers-reduced-motion setting. Starts `false` so SSR
 * and the first client paint agree (no hydration mismatch), then flips
 * synchronously after mount if reduced motion is requested — and stays live if
 * the OS setting changes mid-session. Consumers use this to render the fully
 * lit end-state instead of the progressive fill/breath.
 */
export function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return;
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReduced(mq.matches);
    const onChange = (e: MediaQueryListEvent) => setReduced(e.matches);
    mq.addEventListener?.("change", onChange);
    return () => mq.removeEventListener?.("change", onChange);
  }, []);

  return reduced;
}
