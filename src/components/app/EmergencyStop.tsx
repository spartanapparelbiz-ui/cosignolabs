"use client";

import { useCallback, useEffect, useState } from "react";
import { OctagonX, Play } from "lucide-react";
import { btn } from "@/components/ui/styles";

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
 */

type Scope = "none" | "external" | "all";

export function EmergencyStop() {
  const [scope, setScope] = useState<Scope>("none");
  const [armed, setArmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [receipt, setReceipt] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const r = await fetch("/api/hold", { cache: "no-store" });
      if (r.ok) setScope(((await r.json()).hold?.scope as Scope) ?? "none");
    } catch {
      /* leave as-is; the banner is the authoritative surface */
    }
  }, []);

  useEffect(() => {
    load();
    const onChanged = (e: Event) => {
      const d = (e as CustomEvent<{ scope?: Scope }>).detail;
      if (d?.scope) setScope(d.scope);
    };
    // A hold set anywhere else — the control page, another tab, a second
    // device — must reach this button. Mounting once is not enough: a control
    // that reads "Stop" while everything is frozen tells the operator work is
    // flowing when it isn't, which is the one lie this button must never tell.
    // Re-checking on focus/visibility covers every one of those paths without
    // polling a request every few seconds forever.
    const recheck = () => {
      if (document.visibilityState === "visible") load();
    };
    window.addEventListener("cosigno:hold-changed", onChanged);
    window.addEventListener("focus", recheck);
    document.addEventListener("visibilitychange", recheck);
    return () => {
      window.removeEventListener("cosigno:hold-changed", onChanged);
      window.removeEventListener("focus", recheck);
      document.removeEventListener("visibilitychange", recheck);
    };
  }, [load]);

  // Auto-disarm: never leave a live stop button armed under the cursor.
  useEffect(() => {
    if (!armed) return;
    const t = setTimeout(() => setArmed(false), 4000);
    return () => clearTimeout(t);
  }, [armed]);

  function broadcast(next: Scope) {
    setScope(next);
    window.dispatchEvent(new CustomEvent("cosigno:hold-changed", { detail: { scope: next } }));
  }

  async function stop() {
    setBusy(true);
    try {
      const r = await fetch("/api/emergency-stop", { method: "POST" });
      const d = await r.json();
      if (!r.ok) throw new Error(d.message || "stop failed");
      broadcast("all");
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
        broadcast("none");
        setReceipt(null);
      }
    } finally {
      setBusy(false);
    }
  }

  const stopped = scope === "all";

  /* At rest this is a ghost control: a kill switch that shouts while nothing
     is wrong trains people to stop seeing it. It grows teeth only once armed,
     and stays loud for as long as the workspace is actually held. */
  return (
    <div className="relative flex items-center">
      {stopped ? (
        <button
          onClick={resume}
          disabled={busy}
          className={btn("primary", "sm")}
        >
          <Play size={13} strokeWidth={2} aria-hidden="true" />
          {busy ? "Resuming…" : "Resume"}
        </button>
      ) : armed ? (
        <button
          onClick={stop}
          disabled={busy}
          autoFocus
          aria-label="confirm: stop all AI activity"
          className={btn("sign", "sm", "animate-chip-pulse")}
        >
          <OctagonX size={13} strokeWidth={2} aria-hidden="true" />
          {busy ? "Stopping…" : "Confirm — stop everything"}
        </button>
      ) : (
        <button
          onClick={() => setArmed(true)}
          aria-label="emergency stop"
          title="Pause every AI action immediately"
          className={btn("ghost", "sm")}
        >
          <OctagonX size={14} strokeWidth={1.9} aria-hidden="true" />
          <span className="hidden sm:inline">Stop</span>
        </button>
      )}

      {receipt && (
        <p
          role="status"
          className="t-caption absolute right-0 top-full mt-1.5 w-[17rem] animate-fade-through text-right"
        >
          {receipt}
        </p>
      )}
    </div>
  );
}
