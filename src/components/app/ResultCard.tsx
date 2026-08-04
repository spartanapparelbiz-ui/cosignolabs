"use client";

import { useState } from "react";
import {
  ArrowRight,
  Ban,
  Check,
  ChevronDown,
  CircleDollarSign,
  ExternalLink,
  Loader2,
  Mail,
  PenLine,
  ShieldQuestion,
  Trash2,
  X,
} from "lucide-react";
import type { ChangeKind, ResultStatus, ResultView } from "@/lib/results/describe";

/**
 * One AI action, readable at a glance — the bank-transaction test: what
 * happened, what changed, where, is it finished, can I undo it.
 *
 * Two rules shape the layout:
 *
 * · Status is never carried by colour alone. Every state has an icon and a
 *   word, because roughly one in twelve men cannot separate the green and red
 *   this card would otherwise depend on, and "did my payment go through" is
 *   the worst possible question to answer with hue.
 * · The card renders only what the description actually contains. A missing
 *   location or comparison collapses to nothing rather than a placeholder —
 *   an em dash where a value belongs still reads as a value.
 */

const STATUS_STYLE: Record<ResultStatus, { label: string; cls: string; Icon: typeof Check }> = {
  completed: { label: "Completed", cls: "bg-signal/15 text-ink ring-1 ring-inset ring-signal/40", Icon: Check },
  running: { label: "Running", cls: "bg-cream-deep text-ink-soft", Icon: Loader2 },
  needs_approval: { label: "Needs approval", cls: "bg-signal text-ink", Icon: ShieldQuestion },
  queued: { label: "Queued", cls: "bg-cream-deep text-ink-soft", Icon: Loader2 },
  declined: { label: "Declined", cls: "bg-ink text-cream", Icon: Ban },
  failed: { label: "Failed", cls: "bg-ink text-cream", Icon: X },
};

const KIND_ICON: Record<ChangeKind, typeof Check> = {
  created: Check,
  updated: PenLine,
  deleted: Trash2,
  sent: Mail,
  refunded: CircleDollarSign,
  blocked: Ban,
};

const KIND_WORD: Record<ChangeKind, string> = {
  created: "Created",
  updated: "Updated",
  deleted: "Deleted",
  sent: "Sent",
  refunded: "Refunded",
  blocked: "Blocked",
};

function when(iso?: string): string | null {
  if (!iso) return null;
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return null;
  const secs = Math.max(0, Math.round((Date.now() - t) / 1000));
  if (secs < 60) return `${secs} second${secs === 1 ? "" : "s"} ago`;
  const mins = Math.round(secs / 60);
  if (mins < 60) return `${mins} minute${mins === 1 ? "" : "s"} ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? "" : "s"} ago`;
  return new Date(t).toLocaleDateString();
}

export function ResultCard({ result, details }: { result: ResultView; details?: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const s = STATUS_STYLE[result.status];
  const ago = when(result.finishedAt);

  return (
    <article className="rounded-card border border-line bg-surface p-4 shadow-soft">
      {/* ---------- what happened ---------- */}
      <header className="flex items-start gap-3">
        <span
          className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-pill ${s.cls}`}
          aria-hidden="true"
        >
          <s.Icon size={13} className={result.status === "running" ? "animate-spin" : ""} />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-extrabold leading-snug">{result.headline}</p>
          <p className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] text-ink-soft">
            {/* The word is the status. The colour only reinforces it. */}
            <span className="font-bold">{s.label}</span>
            {ago && <span>· {ago}</span>}
            {result.approvedBy && <span>· approved by {result.approvedBy}</span>}
          </p>
        </div>
      </header>

      {/* ---------- where it happened ---------- */}
      {(result.app || result.objectName) && (
        <div className="mt-3 flex flex-wrap items-center gap-x-2 gap-y-1 rounded-btn bg-cream-deep/50 px-2.5 py-1.5 text-[11px]">
          {result.app && <span className="font-bold">{result.app}</span>}
          {result.objectType && (
            <>
              <ArrowRight size={10} className="text-ink-soft" aria-hidden="true" />
              <span className="text-ink-soft">{result.objectType}</span>
            </>
          )}
          {result.objectName && (
            <>
              <ArrowRight size={10} className="text-ink-soft" aria-hidden="true" />
              <span className="truncate font-mono">{result.objectName}</span>
            </>
          )}
        </div>
      )}

      {/* ---------- what changed ---------- */}
      {result.changes.length > 0 && (
        <ul className="mt-3 flex flex-col gap-1.5">
          {result.changes.map((c, i) => {
            const Icon = KIND_ICON[c.kind];
            return (
              <li key={i} className="flex items-start gap-2 text-xs">
                <Icon size={13} className="mt-0.5 shrink-0 text-signal" aria-hidden="true" />
                <div className="min-w-0 flex-1">
                  <span className="font-bold">{KIND_WORD[c.kind]}</span>{" "}
                  <span className="text-ink-soft">{c.label}</span>
                  {/* A comparison appears only when both sides were recorded. */}
                  {c.before !== undefined && c.after !== undefined && (
                    <span className="mt-1 flex items-center gap-2">
                      <span className="rounded-btn bg-cream-deep px-2 py-0.5 font-mono text-[11px] text-ink-soft line-through">
                        {c.before}
                      </span>
                      <ArrowRight size={11} className="text-ink-soft" aria-hidden="true" />
                      <span className="rounded-btn bg-signal/15 px-2 py-0.5 font-mono text-[11px] font-bold">
                        {c.after}
                      </span>
                    </span>
                  )}
                </div>
                {c.href && (
                  <a
                    href={c.href}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex shrink-0 items-center gap-1 rounded-btn px-2 py-0.5 text-[11px] font-bold underline underline-offset-2 hover:bg-cream-deep"
                  >
                    View <ExternalLink size={10} aria-hidden="true" />
                  </a>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {/* Say plainly when nothing was done, so a failed card can't be skimmed
          as a successful one. */}
      {result.nothingHappened && (
        <p className="mt-3 rounded-btn bg-cream-deep/60 px-2.5 py-1.5 text-[11px] font-semibold">
          Nothing was changed outside cosigno.
        </p>
      )}

      {/* ---------- can I undo it? ---------- */}
      {result.howToUndo && (
        <p className="mt-2 text-[11px] text-ink-soft">{result.howToUndo}</p>
      )}

      {/* ---------- details, hidden by default ---------- */}
      {details && (
        <div className="mt-3 border-t border-line/60 pt-2">
          <button
            onClick={() => setOpen((v) => !v)}
            aria-expanded={open}
            className="inline-flex items-center gap-1 rounded-btn px-1 py-0.5 text-[11px] font-bold text-ink-soft hover:text-ink"
          >
            <ChevronDown
              size={12}
              className={`transition-transform ${open ? "rotate-180" : ""}`}
              aria-hidden="true"
            />
            Advanced details
          </button>
          {open && <div className="mt-2">{details}</div>}
        </div>
      )}
    </article>
  );
}
