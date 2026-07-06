"use client";

import type { ReactNode } from "react";
import { useReveal } from "@/lib/useReveal";

/**
 * Lazy-mount boundary for interactive islands. Renders a fixed-height
 * placeholder until the section approaches the viewport, then mounts its
 * children — so the (dynamically imported) widget's chunk only downloads on
 * approach and never touches LCP. The reserved height prevents layout shift;
 * useReveal's safety fallback guarantees content is never trapped hidden.
 */
export function Island({
  children,
  minHeight,
  className = "",
}: {
  children: ReactNode;
  minHeight: number;
  className?: string;
}) {
  // rootMargin loads a little before the section scrolls into view.
  const { ref, shown } = useReveal<HTMLDivElement>("300px 0px 300px 0px");
  return (
    <div
      ref={ref}
      className={className}
      style={shown ? undefined : { minHeight }}
    >
      {shown ? children : null}
    </div>
  );
}
