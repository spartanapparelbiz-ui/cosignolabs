"use client";

import { useEffect, useRef, useState } from "react";

/**
 * STATE MOTION — the only kind of movement in cosigno that carries
 * information rather than polish.
 *
 * A mission going Working → Needs approval is the single most important event
 * on the screen: it means the work stopped and it is now waiting on a person.
 * If that transition renders as a silent text swap, someone scanning the page
 * misses it, and cosigno sits there waiting for hours. So the transition
 * itself animates, once, at the moment it happens — and then stops. This is
 * deliberately not an idle pulse: something that moves forever is wallpaper,
 * and wallpaper is exactly what gets ignored.
 *
 * Nothing here is decorative, so it survives prefers-reduced-motion as a fade
 * rather than disappearing (globals.css shortens the duration to instant,
 * leaving the end state — which is the correct end state either way).
 */

/**
 * True for a beat after `value` changes — never on first render, because an
 * arriving page has not "changed" anything and flashing every row on load
 * teaches people to ignore the flash.
 */
export function useChangeFlash<T>(value: T, ms = 900): boolean {
  const [flash, setFlash] = useState(false);
  const previous = useRef<T | null>(null);
  const mounted = useRef(false);

  useEffect(() => {
    if (!mounted.current) {
      mounted.current = true;
      previous.current = value;
      return;
    }
    if (previous.current === value) return;
    previous.current = value;
    setFlash(true);
    const t = window.setTimeout(() => setFlash(false), ms);
    return () => window.clearTimeout(t);
  }, [value, ms]);

  return flash;
}

/**
 * The previous value of something, so a component can describe a transition
 * ("was Working, now Needs approval") rather than just its current state.
 */
export function usePrevious<T>(value: T): T | undefined {
  const ref = useRef<T | undefined>(undefined);
  useEffect(() => {
    ref.current = value;
  }, [value]);
  return ref.current;
}

/**
 * Announces a change to screen readers without moving focus.
 *
 * Sighted users get the flash above; everyone else gets this. Two separate
 * channels for the same fact is the whole point — a state change that is only
 * ever a colour or a wiggle is invisible to a screen reader, and a product
 * whose core loop is "cosigno needs you now" cannot afford that.
 *
 * `polite` by default: an approval appearing is important, not an emergency,
 * and interrupting someone mid-sentence is how live regions get turned off.
 */
export function LiveAnnounce({
  message,
  assertive = false,
}: {
  message: string | null;
  assertive?: boolean;
}) {
  return (
    <span className="sr-only" role="status" aria-live={assertive ? "assertive" : "polite"}>
      {message ?? ""}
    </span>
  );
}
