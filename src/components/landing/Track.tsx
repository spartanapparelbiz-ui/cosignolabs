"use client";

import Link from "next/link";
import { useEffect } from "react";
import { track } from "@/lib/analytics";

/**
 * Client tracking helpers for the funnel events that live on the (server)
 * landing page. Kept tiny and self-contained so the page stays a server
 * component everywhere else.
 */

/** A pricing link that fires `pricing_clicked` (§9). */
export function PricingLink({
  href = "/pricing",
  className,
  children,
}: {
  href?: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <Link href={href} prefetch className={className} onClick={() => track("pricing_clicked")}>
      {children}
    </Link>
  );
}

/**
 * Fires `apply_viewed` once, when the application section scrolls into view.
 * Renders nothing. Observes the element with the given id (#beta).
 */
export function ApplyViewTracker({ targetId = "beta" }: { targetId?: string }) {
  useEffect(() => {
    const el = document.getElementById(targetId);
    if (!el || typeof IntersectionObserver === "undefined") return;
    let fired = false;
    const io = new IntersectionObserver(
      (entries) => {
        if (fired) return;
        if (entries.some((e) => e.isIntersecting)) {
          fired = true;
          track("apply_viewed");
          io.disconnect();
        }
      },
      { threshold: 0.3 }
    );
    io.observe(el);
    return () => io.disconnect();
  }, [targetId]);
  return null;
}
