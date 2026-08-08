"use client";

import { useEffect, useState } from "react";
import { OctagonX, Play } from "lucide-react";
import { broadcastHold, useHoldScope } from "@/lib/client/hold";

/**
 * Global emergency stop — reachable from every page in the workspace.
 *
 * Design decisions that matter for a control like this:
 *
 * · ONE press to arm, ONE to confirm. No typed confirmation: in an actual
 *   incident, friction costs seconds you don't have. But not a bare single
 *   click either, because an accidental full stop is its own incident.
 * · The confirm window auto-disarms after 4s, so a stray click never leaves a
 *   live "stop everything" button sitting under the cursor.
 * · It reports what it DID (grants revoked, elapsed ms) rather than a generic
 *   toast — after hitting a kill switch you need to know it actually landed.
 * · While stopped it stays visible and becomes the resume control, so the
 *   held state is never something you have to go hunting for.
 * · The held state is READ through the shared client cache, not fetched here.
 *   A control that reads "Stop" while everything is frozen tells the operator
 *   work is flowing when it isn't — the one lie this button must never tell —
 *   and two independent requests for the same fact can always disagree.
 */

type Scope = "none" | "external" | "all";

export function EmergencyStop() {
  const scope = useHoldScope() as Scope;
  const [armed, setArmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [receipt, setReceipt] = useState<string | null>(null);

  // Auto-disarm: never leave a live stop button armed under the cursor.
  useEffect(() => {
    if (!armed) return;
    const t = setTimeout(() => setArmed(false), 4000);
    return () => clearTimeout(t);
  }, [armed]);

  async function stop() {
    setBusy(true);
    try {
      const r = await fetch("/api/emergency-stop", { method: "POST" });
      const d = await r.json();
      if (!r.ok) throw new Error(d.message || "stop failed");
      broadcastHold("all");
      setReceipt(
        `Stopped in ${d.took_ms}ms · ${d.revoked_grants} temporary grant${d.revoked_grants === 1 ? "" : "s"} revoked · state preserved`
      );
    } catch {
      setReceipt("Couldn't reach the server — nothing was changed. Try again.");
    } finally {
      setBusy(false);
      setArmed(false);
    }
  }

  async function resume() {
    setBusy(true);
    try {
      const r = await fetch("/api/emergency-stop", { method: "DELETE" });
      if (r.ok) {
        broadcastHold("none");
        setReceipt(null);
      }
    } finally {
      setBusy(false);
    }
  }

  const stopped = scope === "all";

  return (
    <div className="flex flex-col items-end gap-1">
      {stopped ? (
        <button
          onClick={resume}
          disabled={busy}
          className="inline-flex min-h-[36px] items-center gap-1.5 rounded-btn bg-ink px-3 py-1.5 text-xs font-extrabold text-cream shadow-soft transition-transform active:scale-95 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <Play size={13} aria-hidden="true" />
          {busy ? "Resuming…" : "Resume cosigno"}
        </button>
      ) : armed ? (
        <button
          onClick={stop}
          disabled={busy}
          autoFocus
          aria-label="confirm: stop all AI activity"
          className="inline-flex min-h-[36px] animate-chip-pulse items-center gap-1.5 rounded-btn bg-signal px-3 py-1.5 text-xs font-extrabold text-ink shadow-lift transition-transform active:scale-95 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <OctagonX size={13} aria-hidden="true" />
          {busy ? "Stopping…" : "Confirm — stop everything"}
        </button>
      ) : (
        <button
          onClick={() => setArmed(true)}
          aria-label="emergency stop"
          title="Pause every AI action immediately"
          className="inline-flex min-h-[36px] items-center gap-1.5 rounded-btn border border-line bg-surface px-3 py-1.5 text-xs font-bold text-ink transition-colors duration-fast hover:border-signal hover:text-signal focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-signal"
        >
          <OctagonX size={13} aria-hidden="true" />
          Stop
        </button>
      )}

      {receipt && (
        <p role="status" className="max-w-[260px] text-right text-[10px] leading-snug text-ink-soft">
          {receipt}
        </p>
      )}
    </div>
  );
}
