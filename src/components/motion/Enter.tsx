"use client";

import { staggerDelay } from "@/lib/motion";

/**
 * ENTRANCE MOTION — the one shape anything is allowed to arrive with.
 *
 * Before this existed, every list in the app invented its own entrance: some
 * rose, some scaled, some staggered at 50ms and some at 80ms. The result read
 * as several products stitched together.
 *
 * `index` sequences a group so it arrives as one movement rather than a burst,
 * and is capped so a long list never makes the last row appear after the
 * reader has finished the first. Collapses to instant under
 * prefers-reduced-motion, which globals.css enforces product-wide.
 */
export function CardEnter({
  index = 0,
  className = "",
  children,
  as: Tag = "div",
  ...rest
}: {
  index?: number;
  className?: string;
  children: React.ReactNode;
  as?: "div" | "li" | "section" | "article";
} & React.HTMLAttributes<HTMLElement>) {
  return (
    <Tag
      {...rest}
      style={{ ...staggerDelay(Math.min(index, 8)), ...rest.style }}
      className={`animate-card-in ${className}`}
    >
      {children}
    </Tag>
  );
}
