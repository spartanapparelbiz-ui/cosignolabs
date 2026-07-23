"use client";

import { useCallback, useEffect, useState } from "react";
import { PauseCircle } from "lucide-react";
import type { HoldScope } from "@/lib/types";

/**
 * A slim, honest banner shown ONLY while Cosigno Hold is active — the
 * authority brake is on, so nothing new crosses the boundary. Prominent when
 * it matters, invisible otherwise. Resume restores exactly the prior
 * behavior (base permissions are never changed).
 *
 * It listens for `cosigno:hold-changed` (dispatched by the Hold control) so
 * toggling from anywhere updates it instantly, and re-checks on a slow poll.
 */

const MESSAGE: Record<Exclude<HoldScope, "none">, string> = {
  external: "Cosigno is on hold — external actions are paused at the boundary.",
  all: "Cosigno is on hold — all work is paused, including routine actions.",
};

async function fetchScope(): Promise<HoldScope> {
  try {
    const res = await fetch("/api/hold", { headers: { "Content-Type": "application/json" } });
    if (!res.ok) return "none";
    return ((await res.json()).hold?.scope as HoldScope) ?? "none";
  } catch {
    return "none";
  }
}

export function HoldBanner() {
  const [scope, setScope] = useState<HoldScope>("none");
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(() => {
    fetchScope().then(setScope);
  }, []);

  useEffect(() => {
    refresh();
    const onChanged = (e: Event) => {
      const detail = (e as CustomEvent<{ scope?: HoldScope }>).detail;
      if (detail?.scope) setScope(detail.scope);
      else refresh();
    };
    window.addEventListener("cosigno:hold-changed", onChanged);
    // Slow safety poll — skipped while the tab is hidden, refreshed on return.
    const tick = () => {
      if (document.visibilityState !== "hidden") refresh();
    };
    const onVisible = () => {
      if (document.visibilityState === "visible") refresh();
    };
    document.addEventListener("visibilitychange", onVisible);
    const t = setInterval(tick, 30_000);
    return () => {
      window.removeEventListener("cosigno:hold-changed", onChanged);
      document.removeEventListener("visibilitychange", onVisible);
      clearInterval(t);
    };
  }, [refresh]);

  if (scope === "none") return null;

  async function resume() {
    setBusy(true);
    try {
      await fetch("/api/hold", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scope: "none" }),
      });
      setScope("none");
      window.dispatchEvent(new CustomEvent("cosigno:hold-changed", { detail: { scope: "none" } }));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="bg-ink text-cream">
      <div className="mx-auto flex w-full max-w-none flex-wrap items-center justify-center gap-x-3 gap-y-1 px-4 py-2 text-center text-[12px] font-bold">
        <PauseCircle size={15} className="shrink-0" aria-hidden="true" />
        <span>{MESSAGE[scope]}</span>
        <button
          onClick={resume}
          disabled={busy}
          className="rounded-pill bg-cream px-3 py-0.5 text-[11px] font-extrabold text-ink transition-transform active:scale-95 disabled:opacity-60"
        >
          {busy ? "Resuming…" : "Resume cosigno"}
        </button>
      </div>
    </div>
  );
}
