"use client";

import { useEffect, useState } from "react";

/**
 * How much motion this visitor should get, decided from the visitor and their
 * device rather than from what the designer hoped for.
 *
 *   "full"     everything, including pointer-driven depth
 *   "reduced"  functional motion only — state changes still animate, nothing
 *              decorative does, nothing tracks the pointer
 *
 * Two independent reasons to drop to "reduced":
 *
 * 1. THE PERSON ASKED. prefers-reduced-motion is a medical setting for some
 *    people, not a taste. It wins over every other signal.
 * 2. THE DEVICE CAN'T. A four-core phone on a saver connection running a
 *    pointer-tracked 3D tilt drops frames, and a janky premium effect is
 *    worse than no effect. Cheap, static signals only — no frame-timing
 *    probe, which would itself cost frames.
 *
 * Starts at "full" so server render and first client paint agree (no
 * hydration mismatch), then settles synchronously after mount. Components
 * must therefore render something correct at "full" and merely quieter at
 * "reduced" — never the other way round.
 */
export type MotionLevel = "full" | "reduced";

interface NavigatorWithHints extends Navigator {
  deviceMemory?: number;
  connection?: { saveData?: boolean; effectiveType?: string };
}

/** True when this device shouldn't be asked to run pointer-driven effects. */
export function deviceIsModest(nav: NavigatorWithHints, coarsePointer: boolean): boolean {
  if (nav.connection?.saveData) return true;
  const slowNet = nav.connection?.effectiveType;
  if (slowNet === "slow-2g" || slowNet === "2g" || slowNet === "3g") return true;
  if (typeof nav.deviceMemory === "number" && nav.deviceMemory > 0 && nav.deviceMemory <= 4) return true;
  if (typeof nav.hardwareConcurrency === "number" && nav.hardwareConcurrency > 0 && nav.hardwareConcurrency <= 4) {
    // Few cores AND a touch device: almost certainly a phone.
    return coarsePointer;
  }
  return false;
}

export function useMotionLevel(): MotionLevel {
  const [level, setLevel] = useState<MotionLevel>("full");

  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)");
    const coarse = window.matchMedia("(pointer: coarse)");

    const resolve = () => {
      const modest = deviceIsModest(navigator as NavigatorWithHints, coarse.matches);
      setLevel(reduce.matches || modest ? "reduced" : "full");
    };

    resolve();
    reduce.addEventListener?.("change", resolve);
    coarse.addEventListener?.("change", resolve);
    return () => {
      reduce.removeEventListener?.("change", resolve);
      coarse.removeEventListener?.("change", resolve);
    };
  }, []);

  return level;
}

/** Convenience: true when rich, pointer-driven motion is welcome here. */
export function useRichMotion(): boolean {
  return useMotionLevel() === "full";
}
