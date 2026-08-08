"use client";

import { useCallback, useState } from "react";
import { createPortal } from "react-dom";
import { LifeBuoy, Sparkles, X } from "lucide-react";
import { useToast } from "@/components/Toast";
import { CosignoMark } from "@/components/brand/Logo";
import type { DelegationBrief } from "@/lib/continue";

/**
 * Contextual continuation actions for one delegation — Brief me, Finish
 * this, Rescue this. They appear only where they make sense (rescue on
 * blocked work, finish on in-progress work) and run on the EXISTING planner
 * pipeline: nothing is faked, and anything consequential still waits at the
 * boundary. Per the design principle, these live in context, not as a page.
 */

async function jsonFetch(url: string, init?: RequestInit) {
  const res = await fetch(url, {
    ...init,
    headers: { "Content-Type": "application/json", ...init?.headers },
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.message || body.error || "something went wrong.");
  return body;
}

const MOMENTUM_LABEL: Record<string, string> = {
  needs_you: "Needs you",
  blocked: "Blocked",
  complete: "Complete",
  moving: "Moving",
  waiting: "Waiting",
};

export function DelegationActions({
  sessionId,
  statusKey,
  onChanged,
}: {
  sessionId: string;
  /** From the row's momentum: moving / needs_you / blocked / complete. */
  statusKey: string;
  onChanged(): void;
}) {
  const toast = useToast();
  const [busy, setBusy] = useState<string | null>(null);
  const [brief, setBrief] = useState<DelegationBrief | null>(null);
  const [briefOpen, setBriefOpen] = useState(false);

  // Rescue where work failed; Finish where cosigno can push the outcome
  // further (in-progress or nothing-pending). At the boundary (needs_you),
  // the decision itself is the action, so only Brief is offered there.
  const showRescue = statusKey === "blocked";
  const showFinish = statusKey === "moving" || statusKey === "complete";

  const openBrief = useCallback(
    async (e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setBriefOpen(true);
      setBrief(null);
      try {
        const d = await jsonFetch(`/api/delegations/${sessionId}/brief`);
        setBrief(d.brief);
      } catch {
        setBriefOpen(false);
        toast("error", "couldn't load the brief.");
      }
    },
    [sessionId, toast]
  );

  const continueWork = useCallback(
    async (mode: "finish" | "rescue", e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setBusy(mode);
      try {
        const d = await jsonFetch(`/api/delegations/${sessionId}/continue`, {
          method: "POST",
          body: JSON.stringify({ mode }),
        });
        // "I have it" when cosigno accepts and moves the work forward;
        // honest fallback when it genuinely couldn't.
        toast(
          d.moved_forward ? "success" : "error",
          d.moved_forward ? `I have it. ${d.message}` : d.message
        );
        onChanged();
      } catch (err) {
        toast("error", err instanceof Error ? err.message : "couldn't continue that.");
      } finally {
        setBusy(null);
      }
    },
    [sessionId, toast, onChanged]
  );

  return (
    <>
      <button
        onClick={openBrief}
        className="rounded-btn px-3 py-1.5 text-xs font-bold lowercase text-ink-soft ring-1 ring-inset ring-ink/25 hover:bg-cream-deep hover:text-ink"
      >
        brief me
      </button>
      {showFinish && (
        <button
          onClick={(e) => continueWork("finish", e)}
          disabled={busy !== null}
          className="inline-flex items-center gap-1 rounded-btn px-3 py-1.5 text-xs font-bold lowercase text-ink-soft ring-1 ring-inset ring-ink/25 hover:bg-cream-deep hover:text-ink disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <Sparkles size={11} /> {busy === "finish" ? "…" : "finish this"}
        </button>
      )}
      {showRescue && (
        <button
          onClick={(e) => continueWork("rescue", e)}
          disabled={busy !== null}
          className="inline-flex items-center gap-1 rounded-btn bg-ink px-3 py-1.5 text-xs font-bold lowercase text-cream disabled:bg-cream-deep disabled:text-ink-soft disabled:shadow-none disabled:cursor-not-allowed"
        >
          <LifeBuoy size={11} /> {busy === "rescue" ? "rescuing…" : "rescue this"}
        </button>
      )}

      {briefOpen &&
        createPortal(
          <div
            className="fixed inset-0 z-50 flex animate-overlay-in items-center justify-center bg-ink/45 p-4 backdrop-blur-md"
            role="dialog"
            aria-modal="true"
            aria-label="delegation brief"
            onMouseDown={(e) => {
              if (e.target === e.currentTarget) setBriefOpen(false);
            }}
          >
            <div className="w-full max-w-md animate-spring-in rounded-card bg-surface p-6 shadow-depth-lift">
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-2">
                  <CosignoMark size={18} />
                  <p className="text-[11px] font-extrabold uppercase tracking-widest text-ink-soft">Brief</p>
                </div>
                <button
                  onClick={() => setBriefOpen(false)}
                  className="rounded-btn p-1 text-ink-soft hover:bg-cream-deep hover:text-ink"
                  aria-label="close brief"
                >
                  <X size={16} />
                </button>
              </div>
              {!brief ? (
                <div className="mt-4 h-28 skeleton rounded-btn" aria-hidden="true" />
              ) : (
                <>
                  <h2 className="mt-3 text-base font-extrabold leading-snug">{brief.goal}</h2>
                  {brief.objective && (
                    <p className="mt-0.5 text-xs font-bold text-ink-soft">
                      Toward: {brief.objective}
                    </p>
                  )}
                  <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-[11px] font-bold text-ink-soft">
                    <span>{MOMENTUM_LABEL[brief.momentum] ?? brief.momentum}</span>
                    <span>{brief.complete} complete</span>
                    {brief.waiting > 0 && <span className="text-signal">{brief.waiting} at the boundary</span>}
                    {brief.failed > 0 && <span>{brief.failed} failed</span>}
                  </div>
                  <p className="mt-3 text-sm">
                    <span className="font-extrabold">Why: </span>
                    <span className="text-ink-soft">{brief.why}</span>
                  </p>
                  <p className="mt-1.5 text-sm">
                    <span className="font-extrabold">Next: </span>
                    <span className="text-ink-soft">{brief.next}</span>
                  </p>
                  {brief.can_move_forward && (
                    <button
                      onClick={(e) => {
                        setBriefOpen(false);
                        continueWork(brief.failed > 0 ? "rescue" : "finish", e);
                      }}
                      className="mt-4 inline-flex items-center gap-1.5 rounded-btn bg-signal px-4 py-2 text-sm font-extrabold text-ink shadow-soft"
                    >
                      {brief.failed > 0 ? (
                        <>
                          <LifeBuoy size={13} /> Rescue this
                        </>
                      ) : (
                        <>
                          <Sparkles size={13} /> Finish this
                        </>
                      )}
                    </button>
                  )}
                </>
              )}
            </div>
          </div>,
          document.body
        )}
    </>
  );
}
