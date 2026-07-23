"use client";

import { useEffect, useState } from "react";
import { CheckCircle2, XCircle, ShieldX, ChevronDown } from "lucide-react";

/**
 * Proof Receipts — the immutable record of every attempted external action.
 * Read-only. Green ONLY for verified/executed completion; red ONLY for
 * failures and gate rejections. Every receipt carries its correlation id,
 * plan hash, authorization method, and undo availability — the operational
 * proof, never a token or a raw payload.
 */

interface Receipt {
  id: string;
  correlation_id: string;
  action_id: string | null;
  plan_hash: string;
  approved_by: string;
  authorization_method: string;
  category: string;
  integration: string;
  operation: string;
  status: "executed" | "failed" | "rejected";
  result_summary: string | null;
  verification: Record<string, unknown> | null;
  failure_reason: string | null;
  undo_available: boolean;
  undo_hint: string | null;
  external_ref: string | null;
  executed_at: string;
}

function fmt(iso: string): string {
  return new Date(iso).toLocaleString([], {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function StatusBadge({ status, verified }: { status: Receipt["status"]; verified: boolean }) {
  if (status === "executed") {
    return (
      <span className="inline-flex items-center gap-1 rounded-pill bg-verified/12 px-2.5 py-0.5 text-[11px] font-bold text-verified">
        <CheckCircle2 size={13} aria-hidden />
        {verified ? "Verified" : "Executed"}
      </span>
    );
  }
  if (status === "rejected") {
    return (
      <span className="inline-flex items-center gap-1 rounded-pill bg-danger/12 px-2.5 py-0.5 text-[11px] font-bold text-danger">
        <ShieldX size={13} aria-hidden /> Blocked at gate
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 rounded-pill bg-danger/12 px-2.5 py-0.5 text-[11px] font-bold text-danger">
      <XCircle size={13} aria-hidden /> Failed
    </span>
  );
}

export function ReceiptsView() {
  const [receipts, setReceipts] = useState<Receipt[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/receipts")
      .then((r) => r.json())
      .then((d) => {
        if (d.receipts) setReceipts(d.receipts);
        else throw new Error(d.message || "couldn't load receipts.");
      })
      .catch((e) => setError(e instanceof Error ? e.message : "couldn't load receipts."));
  }, []);

  if (error) return <p className="text-sm font-semibold text-danger">{error}</p>;
  if (!receipts) return <p className="text-sm font-semibold text-ink-soft">loading receipts…</p>;

  if (receipts.length === 0) {
    return (
      <div className="rounded-card border border-line bg-surface p-8 text-center">
        <p className="font-display text-lg font-bold lowercase">no receipts yet</p>
        <p className="mt-1 text-sm font-semibold text-ink-soft">
          every action cosigno attempts — executed, failed, or blocked — writes an
          immutable receipt here, with its exact operation, authorization, and result.
        </p>
      </div>
    );
  }

  return (
    <ul className="flex flex-col gap-2.5">
      {receipts.map((r) => {
        const verified = Boolean(r.verification && (r.verification as { simulated?: boolean }).simulated === false);
        const isOpen = open === r.id;
        return (
          <li key={r.id} className="rounded-card border border-line bg-surface shadow-well">
            <button
              onClick={() => setOpen(isOpen ? null : r.id)}
              className="flex w-full items-center justify-between gap-3 p-4 text-left"
              aria-expanded={isOpen}
            >
              <div className="min-w-0">
                <p className="truncate font-bold text-ink">{r.operation}</p>
                <p className="mt-0.5 text-[11px] font-semibold text-ink-soft">
                  {fmt(r.executed_at)} · via {r.integration}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <StatusBadge status={r.status} verified={verified} />
                <ChevronDown
                  size={16}
                  className={`text-ink-soft transition-transform ${isOpen ? "rotate-180" : ""}`}
                  aria-hidden
                />
              </div>
            </button>

            {isOpen && (
              <dl className="grid gap-x-6 gap-y-2 border-t border-line px-4 py-3 text-sm sm:grid-cols-2">
                <Field label="Authorization">{r.authorization_method}</Field>
                <Field label="Approved by">{r.approved_by}</Field>
                <Field label="Category">{r.category}</Field>
                <Field label="Result">{r.result_summary ?? "—"}</Field>
                {r.failure_reason && <Field label="Failure reason">{r.failure_reason}</Field>}
                {r.external_ref && <Field label="External reference">{r.external_ref}</Field>}
                <Field label="Reversible">
                  {r.undo_available ? "Yes" : "No"}
                  {r.undo_hint ? ` — ${r.undo_hint}` : ""}
                </Field>
                <Field label="Correlation ID">
                  <code className="font-mono text-[11px]">{r.correlation_id}</code>
                </Field>
                <Field label="Plan hash">
                  <code className="font-mono text-[11px]">{r.plan_hash.slice(0, 16)}…</code>
                </Field>
              </dl>
            )}
          </li>
        );
      })}
    </ul>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="text-[11px] font-bold uppercase tracking-wider text-ink-soft">{label}</dt>
      <dd className="font-medium text-ink">{children}</dd>
    </div>
  );
}
