"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { CosignoMark } from "@/components/brand/Logo";
import type { CosignoState } from "@/lib/state";
import { CommandOverlay } from "./CommandOverlay";

/**
 * Cosigno Presence — the mark, always within reach. It quietly reflects the
 * real state of delegated work:
 *
 *   mark            cosigno is available
 *   mark ···        cosigno is actively working
 *   mark  2         two decisions need you
 *
 * Clicking it (or ⌘K / ctrl+K) activates cosigno: the user says what they
 * want and the interface becomes the answer. Backed by /api/state — never
 * invented activity, never a decorative pulse.
 */

async function fetchState(): Promise<CosignoState | null> {
  try {
    const res = await fetch("/api/state", { headers: { "Content-Type": "application/json" } });
    if (!res.ok) return null;
    return (await res.json()).state ?? null;
  } catch {
    return null;
  }
}

export function Presence() {
  const [state, setState] = useState<CosignoState | null>(null);
  const [open, setOpen] = useState(false);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  const refresh = useCallback(() => {
    fetchState().then((s) => s && setState(s));
  }, []);

  useEffect(() => {
    refresh();
    timer.current = setInterval(refresh, 25_000);
    const onVisible = () => document.visibilityState === "visible" && refresh();
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      if (timer.current) clearInterval(timer.current);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [refresh]);

  // ⌘K / ctrl+K opens cosigno from anywhere in the app.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((v) => !v);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const working = (state?.moving ?? 0) > 0;
  const needYou = state?.need_you ?? 0;

  const label =
    needYou > 0
      ? `cosigno — ${needYou} decision${needYou === 1 ? "" : "s"} need you`
      : working
        ? "cosigno — actively working"
        : "cosigno — available";

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        aria-label={label}
        title={label}
        className="relative inline-flex items-center gap-1 rounded-pill px-2 py-1 transition-colors hover:bg-cream-deep focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-signal"
      >
        <CosignoMark size={20} />
        {needYou > 0 ? (
          <span className="flex h-4 min-w-4 items-center justify-center rounded-pill bg-signal px-1 text-[10px] font-black text-ink">
            {needYou > 9 ? "9+" : needYou}
          </span>
        ) : working ? (
          <span className="flex items-center gap-[3px] pr-0.5" aria-hidden="true">
            {[0, 1, 2].map((i) => (
              <span
                key={i}
                className="h-[3px] w-[3px] animate-orb-pulse rounded-full bg-ink-soft"
                style={{ animationDelay: `${i * 220}ms` }}
              />
            ))}
          </span>
        ) : null}
      </button>
      {open && <CommandOverlay state={state} onClose={() => setOpen(false)} />}
    </>
  );
}
