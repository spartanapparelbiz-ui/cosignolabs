"use client";

import { useState } from "react";
import { PauseCircle } from "lucide-react";
import type { HoldScope } from "@/lib/types";
import { broadcastHold, useHoldScope } from "@/lib/client/hold";

/**
 * A slim, honest banner shown ONLY while Cosigno Hold is active — the
 * authority brake is on, so nothing new crosses the boundary. Prominent when
 * it matters, invisible otherwise. Resume restores exactly the prior
 * behavior (base permissions are never changed).
 *
 * The hold state is read through the shared client cache, so this and the stop
 * button in the header are the same fact rather than two independent requests
 * that can disagree.
 */

const MESSAGE: Record<Exclude<HoldScope, "none">, string> = {
  external: "Cosigno is on hold — external actions are paused at the boundary.",
  all: "Cosigno is on hold — all work is paused, including routine actions.",
};

export function HoldBanner() {
  const scope = useHoldScope();
  const [busy, setBusy] = useState(false);

  if (scope === "none") return null;

  async function resume() {
    setBusy(true);
    try {
      await fetch("/api/hold", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scope: "none" }),
      });
      broadcastHold("none");
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
          className="rounded-pill bg-cream px-3 py-0.5 text-[11px] font-extrabold text-ink transition-transform active:scale-95 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {busy ? "Resuming…" : "Resume cosigno"}
        </button>
      </div>
    </div>
  );
}
