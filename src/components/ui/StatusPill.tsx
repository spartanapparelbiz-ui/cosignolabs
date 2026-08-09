"use client";

import {
  AlertTriangle,
  Check,
  Clock,
  Loader2,
  OctagonX,
  PenLine,
  XCircle,
  type LucideIcon,
} from "lucide-react";
import { STATUS_TONE, type Status } from "@/lib/status";
import { useChangeFlash } from "@/components/motion/StateChange";

/**
 * A status, rendered the same way everywhere.
 *
 * Two rules, both of which the old ad-hoc pills broke somewhere:
 *
 * 1. NEVER COLOUR ALONE. Orange-means-you and grey-means-working is invisible
 *    to a meaningful share of people, and completely invisible in a
 *    screenshot pasted into a chat. Every status carries a glyph and a word.
 * 2. THE CHANGE IS THE MESSAGE. Working → Needs approval is the moment the
 *    product stops and waits for a human. It animates once, when it happens,
 *    and is announced to screen readers. It does not pulse forever afterwards
 *    — permanent motion is wallpaper.
 */

const ICON: Record<Status, LucideIcon> = {
  Working: Loader2,
  Waiting: Clock,
  "Needs approval": PenLine,
  Finished: Check,
  Failed: XCircle,
  Stopped: OctagonX,
  "Needs attention": AlertTriangle,
};

export function StatusPill({
  status,
  size = "md",
  className = "",
}: {
  status: Status;
  size?: "sm" | "md";
  className?: string;
}) {
  const Icon = ICON[status];
  const changed = useChangeFlash(status);
  const dims = size === "sm" ? "px-2 py-0.5 text-[10px] gap-1" : "px-3 py-1 text-xs gap-1.5";

  return (
    <span
      className={`inline-flex items-center rounded-pill font-bold ${dims} ${STATUS_TONE[status]} ${
        changed ? "animate-status-swap" : ""
      } ${className}`}
    >
      <Icon
        size={size === "sm" ? 10 : 12}
        strokeWidth={2.8}
        aria-hidden="true"
        className={status === "Working" ? "animate-spin" : ""}
      />
      {status}
      {/* Spoken only when it actually changes, so a page of pills doesn't
          read out its entire state on arrival. */}
      {changed && (
        <span className="sr-only" role="status" aria-live="polite">
          status changed to {status}
        </span>
      )}
    </span>
  );
}
