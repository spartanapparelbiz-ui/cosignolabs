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
