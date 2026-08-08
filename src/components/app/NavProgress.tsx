"use client";

import { useEffect, useId, useState } from "react";
import { useLinkStatus } from "next/link";
import { setNavPending, useNavPending } from "@/lib/navProgress";

/**
 * The click acknowledgement.
 *
 * Two pieces that work together: `LinkPending` sits inside a nav link and
 * reports that link's pending state; `NavProgress` draws one hairline across
 * the top of the workspace while anything is pending. Neither is a spinner —
 * the line is a single sweep that fills, completes, and leaves, so a fast
 * navigation shows a flicker of progress and a slow one shows honest movement
 * until the route's own loading state takes over.
 */

/** Report this link's pending state to the chrome. Must render inside a Link. */
export function LinkPending() {
  const { pending } = useLinkStatus();
  const id = useId();

  useEffect(() => {
    setNavPending(id, pending);
    // Clearing on unmount matters: a link that disappears mid-navigation (a
    // nav that re-renders) would otherwise pin the indicator on forever.
    return () => setNavPending(id, false);
  }, [id, pending]);

  return null;
}

/** How long the completed bar stays on screen before it fades out. */
const SETTLE_MS = 260;

export function NavProgress() {
  const busy = useNavPending();
  const [state, setState] = useState<"idle" | "running" | "done">("idle");

  useEffect(() => {
    if (busy) {
      setState("running");
      return;
    }
    // Only run the completion beat if there was something to complete.
    let timer: ReturnType<typeof setTimeout> | undefined;
    setState((s) => {
      if (s !== "running") return s;
      timer = setTimeout(() => setState("idle"), SETTLE_MS);
      return "done";
    });
    return () => clearTimeout(timer);
  }, [busy]);

  if (state === "idle") return null;

  return (
    <div
      aria-hidden="true"
      className="pointer-events-none fixed inset-x-0 top-0 z-50 h-[2px] overflow-hidden"
    >
      <div
        className={`h-full origin-left bg-signal ${
          state === "running" ? "animate-nav-progress" : "animate-nav-complete"
        }`}
      />
    </div>
  );
}
