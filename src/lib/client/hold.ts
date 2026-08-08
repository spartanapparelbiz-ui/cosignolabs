"use client";

import { useEffect } from "react";
import type { HoldScope } from "@/lib/types";
import { invalidate, setResource, useResource } from "./resource";

/**
 * Whether cosigno is currently held, as ONE fact shared by every control that
 * shows it.
 *
 * The banner and the stop button both render on every page and each used to
 * ask `/api/hold` on mount — two requests, on every navigation, for the same
 * answer, with a real chance of disagreeing with each other for a moment. A
 * stop button that reads "Stop" while everything is frozen tells the operator
 * work is flowing when it isn't, which is the one lie this control must never
 * tell. Sharing the read makes that disagreement impossible.
 */

const KEY = "/api/hold";
const EVENT = "cosigno:hold-changed";

interface HoldResponse {
  hold?: { scope?: HoldScope };
}

export function useHoldScope(): HoldScope {
  const { data } = useResource<HoldResponse>(KEY, { refreshMs: 30_000 });

  // A hold set anywhere else — the control page, another tab, a second device
  // — must reach every control. The event covers the same-tab case instantly;
  // the poll and the visibility refresh in useResource cover the rest.
  useEffect(() => {
    const onChanged = () => invalidate(KEY);
    window.addEventListener(EVENT, onChanged);
    return () => window.removeEventListener(EVENT, onChanged);
  }, []);

  return data?.hold?.scope ?? "none";
}

/**
 * Record a hold change locally and tell the rest of the app. The optimistic
 * seed means the UI reflects the decision on the same frame as the click,
 * rather than after a round trip that has already succeeded.
 */
export function broadcastHold(scope: HoldScope): void {
  setResource(KEY, { hold: { scope } });
  window.dispatchEvent(new CustomEvent(EVENT, { detail: { scope } }));
}
