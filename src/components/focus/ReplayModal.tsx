"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { CosignoMark } from "@/components/brand/Logo";
import type { ReplayLine } from "@/lib/state";

/**
 * Delegation Replay — the operational history of one delegation as a quiet
 * timeline: accepted → prepared → boundary reached → signed → executed.
 * Concise operational evidence from the audit record; never hidden
 * chain-of-thought.
 */

const KIND_DOT: Record<string, string> = {
  delegated: "bg-ink",
  handoff: "bg-signal",
  authorized: "bg-ink",
  executed: "bg-signal",
  held: "bg-signal",
};

function fmtTime(iso: string): string {
  return new Date(iso).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

export function ReplayModal({ sessionId, onClose }: { sessionId: string; onClose(): void }) {
  const [goal, setGoal] = useState<string | null>(null);
  const [lines, setLines] = useState<ReplayLine[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/replay?session_id=${encodeURIComponent(sessionId)}`)
      .then((r) => r.json())
      .then((d) => {
        if (cancelled) return;
        if (!d.lines) throw new Error(d.message || "couldn't load the replay.");
        setGoal(d.goal ?? null);
        setLines(d.lines);
      })
      .catch((e) => !cancelled && setError(e instanceof Error ? e.message : "couldn't load the replay."));
    return () => {
      cancelled = true;
    };
  }, [sessionId]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-ink/45 p-4 backdrop-blur-[2px]"
      role="dialog"
      aria-modal="true"
      aria-label="delegation replay"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="flex max-h-[80vh] w-full max-w-md animate-spring-in flex-col rounded-card bg-surface p-6 shadow-raise">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-2">
            <CosignoMark size={18} />
            <p className="text-[0.75rem] font-semibold uppercase tracking-[0.1em] text-ink-soft">
              Delegation replay
            </p>
          </div>
          <button
            onClick={onClose}
            className="rounded-btn p-1 text-ink-soft hover:bg-cream-deep hover:text-ink"
            aria-label="close replay"
          >
            <X size={16} />
          </button>
        </div>

        {goal && <h2 className="mt-2 text-base font-semibold leading-snug">{goal}</h2>}

        {error && (
          <p className="mt-4 rounded-btn bg-cream-deep px-3 py-2 text-xs font-semibold" role="alert">
            {error}
          </p>
        )}
        {!lines && !error && (
          <div className="mt-4 h-40 animate-pulse rounded-btn bg-cream-deep" aria-hidden="true" />
        )}

        {lines && (
          <ol className="mt-4 flex flex-col gap-0 overflow-y-auto">
            {lines.map((l, i) => (
              <li key={`${l.at}_${i}`} className="relative flex gap-3 pb-4 last:pb-0">
                {/* the timeline spine */}
                {i < lines.length - 1 && (
                  <span className="absolute left-[3px] top-3 h-full w-px bg-line" aria-hidden="true" />
                )}
                <span
                  className={`relative mt-1.5 h-[7px] w-[7px] shrink-0 rounded-pill ${KIND_DOT[l.kind] ?? "bg-ink/30"}`}
                  aria-hidden="true"
                />
                <div className="min-w-0 flex-1">
                  <p className="t-eyebrow">
                    {fmtTime(l.at)}
                  </p>
                  <p className="text-sm font-semibold leading-snug">{l.text}</p>
                </div>
              </li>
            ))}
          </ol>
        )}
      </div>
    </div>,
    document.body
  );
}
