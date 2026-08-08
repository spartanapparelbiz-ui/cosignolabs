"use client";

import { useEffect, useState } from "react";

/**
 * Whether a navigation is currently in flight, anywhere in the workspace.
 *
 * Next only swaps in a route's loading state once it has that route's shell in
 * hand. On a fast connection that is instant and nothing is ever seen — but on
 * a slow one the click lands on a page that just sits there, which is the exact
 * moment an app stops feeling responsive. Individual links know their own
 * pending state (`useLinkStatus`); this collects those into one fact the chrome
 * can react to, so the acknowledgement is immediate and the loading state takes
 * over when it's ready.
 *
 * A plain module-level Set: one entry per pending link, so overlapping clicks
 * can't leave the indicator stuck on.
 */

const pending = new Set<string>();
const subscribers = new Set<(busy: boolean) => void>();

function publish() {
  const busy = pending.size > 0;
  subscribers.forEach((fn) => fn(busy));
}

export function setNavPending(id: string, busy: boolean): void {
  const had = pending.has(id);
  if (busy === had) return;
  if (busy) pending.add(id);
  else pending.delete(id);
  publish();
}

/** True while any link in the chrome is waiting for its route. */
export function useNavPending(): boolean {
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    subscribers.add(setBusy);
    setBusy(pending.size > 0);
    return () => {
      subscribers.delete(setBusy);
    };
  }, []);
  return busy;
}
