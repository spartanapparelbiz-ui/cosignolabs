"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import type { ActionEventRecord, ActionRecord } from "@/lib/types";
import { operatorOf, resultPreview } from "@/lib/actionPresentation";
import { CosignoMark } from "@/components/brand/Logo";

/**
 * A Cosigno Receipt — the permanent record of one completed action: what
 * was proposed, who authorized it and how (signed / approved / auto), when
 * it executed, and what happened. Everything shown comes from the stored
 * action + its audit events; the record hash is the server-computed
 * tamper-evident seal written at approval time.
 */

interface Authorization {
  method: "auto" | "approved" | "signed";
  signed_name: string | null;
  authorized_at: string;
  record_hash: string;
  signature_image?: string;
}

function authorizationOf(events: ActionEventRecord[]): Authorization | null {
  const approved = events.find((e) => e.type === "approved");
  const detail = approved?.detail as { authorization?: Authorization } | undefined;
  return detail?.authorization ?? null;
}

const METHOD_LABEL: Record<Authorization["method"], string> = {
  auto: "Auto (pre-authorized, tier 1)",
  approved: "Approved",
  signed: "Signed",
};

function fmtTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString([], {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function ReceiptModal({ actionId, onClose }: { actionId: string; onClose(): void }) {
  const [action, setAction] = useState<ActionRecord | null>(null);
  const [events, setEvents] = useState<ActionEventRecord[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/actions/${actionId}`)
      .then((r) => r.json())
      .then((d) => {
        if (cancelled) return;
        if (!d.action) throw new Error(d.message || "couldn't load the receipt.");
        setAction(d.action);
        setEvents(d.events ?? []);
      })
      .catch((e) => !cancelled && setError(e instanceof Error ? e.message : "couldn't load the receipt."));
    return () => {
      cancelled = true;
    };
  }, [actionId]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const auth = authorizationOf(events);
  const result = action ? resultPreview(action.result) : null;

  const rows: { label: string; value: React.ReactNode }[] = action
    ? [
        {
          label: "Authorized by",
          value: auth?.signed_name ?? (auth?.method === "auto" ? "cosigno (your standing rule)" : "you"),
        },
        { label: "Authorization", value: auth ? METHOD_LABEL[auth.method] : "—" },
        { label: "Authorized at", value: fmtTime(auth?.authorized_at) },
        { label: "Executed", value: fmtTime(action.resolved_at) },
        { label: "Operator", value: `${operatorOf(action.category)} · tier ${action.tier}` },
        {
          label: "Status",
          value:
            action.status === "executed" ? (
              <span className="font-extrabold text-signal">Completed</span>
            ) : (
              action.status
            ),
        },
        ...(result?.summary ? [{ label: "Result", value: result.summary }] : []),
      ]
    : [];

  // Portal to <body> so ancestor transforms can't trap the fixed overlay.
  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-ink/45 p-4 backdrop-blur-[2px]"
      role="dialog"
      aria-modal="true"
      aria-label="action receipt"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="w-full max-w-md animate-spring-in rounded-card bg-surface p-6 shadow-depth-lift">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-2">
            <CosignoMark size={18} />
            <p className="text-[11px] font-extrabold uppercase tracking-widest text-ink-soft">
              Cosigno receipt
            </p>
          </div>
          <button
            onClick={onClose}
            className="rounded-btn p-1 text-ink-soft hover:bg-cream-deep hover:text-ink"
            aria-label="close receipt"
          >
            <X size={16} />
          </button>
        </div>

        {error && (
          <p className="mt-4 rounded-btn bg-cream-deep px-3 py-2 text-xs font-semibold" role="alert">
            {error}
          </p>
        )}

        {!action && !error && (
          <div className="mt-4 h-40 animate-pulse rounded-btn bg-cream-deep" aria-hidden="true" />
        )}

        {action && (
          <>
            <h2 className="mt-3 text-base font-extrabold leading-snug">{action.summary}</h2>
            {auth?.signature_image && (
              <div className="relative mt-3 rounded-btn bg-cream px-6 pb-2 pt-3 shadow-well">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={auth.signature_image} alt="authorizing signature" className="mx-auto h-14 object-contain" />
                <div className="mx-2 border-b border-ink/30" aria-hidden="true" />
              </div>
            )}
            <dl className="mt-4 flex flex-col">
              {rows.map((r) => (
                <div
                  key={r.label}
                  className="flex items-baseline justify-between gap-4 border-b border-line/50 py-2 last:border-0"
                >
                  <dt className="shrink-0 text-xs font-extrabold uppercase tracking-wide text-ink-soft">
                    {r.label}
                  </dt>
                  <dd className="text-right text-sm font-semibold">{r.value}</dd>
                </div>
              ))}
            </dl>
            {auth?.record_hash && (
              <p className="mt-3 break-all font-mono text-[10px] leading-relaxed text-ink-soft">
                record {auth.record_hash.slice(0, 32)}… — tamper-evident hash of exactly what you
                authorized, sealed at approval.
              </p>
            )}
          </>
        )}
      </div>
    </div>,
    document.body
  );
}
