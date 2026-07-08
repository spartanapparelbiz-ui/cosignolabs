"use client";

import { useEffect, useRef, useState } from "react";

/**
 * The living-logo coordinator. Every cosigno mark that wants the idle "breath"
 * (see BRAND.md → "Living logo") registers here, but at most ONE mark breathes
 * per viewport at a time — the one highest on screen — so a page never shows a
 * chorus of pulsing logos. The discipline is baked in:
 *   - transform/opacity only (the animation lives in Tailwind: logo-breath)
 *   - nothing breathes under prefers-reduced-motion (we never activate)
 *   - nothing breathes before first paint (registration defers to idle time)
 * The whole module is a small shared Set plus one shared IntersectionObserver,
 * so it stays comfortably inside the living-logo JS budget.
 */

type Entry = {
  el: Element;
  visible: boolean;
  setActive: (active: boolean) => void;
};

const registry = new Set<Entry>();
let observer: IntersectionObserver | null = null;

/**
 * The single-breather rule, as a pure function (exported for tests): among the
 * marks, the visible one highest in the viewport (smallest `top`) wins; ties go
 * to the earlier entry; if none are visible, nobody breathes (-1).
 */
export function pickBreatherIndex(
  marks: ReadonlyArray<{ visible: boolean; top: number }>
): number {
  let winner = -1;
  let winnerTop = Infinity;
  for (let i = 0; i < marks.length; i++) {
    const m = marks[i];
    if (m.visible && m.top < winnerTop) {
      winnerTop = m.top;
      winner = i;
    }
  }
  return winner;
}

function recompute() {
  const entries = Array.from(registry);
  const idx = pickBreatherIndex(
    entries.map((e) => ({
      visible: e.visible,
      top: e.el.getBoundingClientRect().top,
    }))
  );
  entries.forEach((entry, i) => entry.setActive(i === idx));
}

function ensureObserver(): IntersectionObserver {
  if (!observer) {
    observer = new IntersectionObserver((records) => {
      for (const record of records) {
        for (const entry of registry) {
          if (entry.el === record.target) {
            entry.visible = record.isIntersecting;
            break;
          }
        }
      }
      recompute();
    });
  }
  return observer;
}

type IdleWindow = Window & {
  requestIdleCallback?: (cb: () => void) => number;
  cancelIdleCallback?: (id: number) => void;
};

/** Defer work past first paint (idle time), with a setTimeout fallback. */
function deferToIdle(fn: () => void): () => void {
  const w = window as IdleWindow;
  if (typeof w.requestIdleCallback === "function") {
    const id = w.requestIdleCallback(fn);
    return () => w.cancelIdleCallback?.(id);
  }
  const id = window.setTimeout(fn, 200);
  return () => window.clearTimeout(id);
}

/**
 * Attach a mark to the coordinator. Returns a `ref` to place on the mark's
 * wrapper and an `active` flag — apply the breath animation only when `active`.
 */
export function useBreathing<T extends Element = HTMLElement>() {
  const ref = useRef<T>(null);
  const [active, setActive] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el || typeof window === "undefined") return;
    // Reduced motion: the mark still renders, it just never breathes.
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;

    const entry: Entry = { el, visible: false, setActive };
    const cancelIdle = deferToIdle(() => {
      registry.add(entry);
      ensureObserver().observe(el);
    });

    return () => {
      cancelIdle();
      registry.delete(entry);
      observer?.unobserve(el);
      recompute();
    };
  }, []);

  return { ref, active };
}
