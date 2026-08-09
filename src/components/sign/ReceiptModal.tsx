"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { ChevronDown, X } from "lucide-react";
import type { ActionEventRecord, ActionRecord } from "@/lib/types";
import { operatorOf, resultPreview } from "@/lib/actionPresentation";
import { signRequired } from "@/lib/sign";
import { CosignoMark } from "@/components/brand/Logo";

/**
 * A Cosigno Trust Receipt — the permanent record of one completed action:
 * what happened, WHY (which delegation), what permission was used, who
 * authorized it and how, when it executed, and whether the outcome was
 * verified. Plus an expandable TRACE: the full chain of responsibility from
 * the audit record. Everything comes from stored data; the record hash is
 * the server-computed tamper-evident seal written at approval time.
 */

/** The permission that gated this action — plain language, from category/tier. */
function permissionUsed(action: Pick<ActionRecord, "category" | "tier">): string {
  const op = operatorOf(action.category);
  if (action.tier === 3) return `${op} — locked, signature required`;
  if (signRequired(action.category, 2)) return `${op} — external, signature required`;
  if (action.tier === 2) return `${op} — approval required`;
  return `${op} — auto (read-only / reversible)`;
}

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

/**
 * OUTCOME VERIFICATION — an action being executed is not the same as the
 * outcome being achieved. This reads only what the result record actually
 * claims: verified when the integration confirmed the expected result,
 * otherwise an honest "executed, not independently verified". Never faked.
 */
function outcomeOf(
  status: ActionRecord["status"],
  result: Record<string, unknown> | null
): string {
  if (status === "failed") return "Failed — the intended result did not occur.";
  if (status !== "executed") return "Waiting — execution hasn't completed.";
  const verified =
    result &&
    ["verified", "delivered", "confirmed"].some((k) => {
      const v = result[k];
      return v === true || (typeof v === "string" && /^(true|yes|delivered|confirmed)$/i.test(v));
    });
  return verified
    ? "Verified — the expected result was confirmed."
    : "Executed — the outcome has not been independently verified.";
}

function fmtTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString([], {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

/**
 * TRACE — a transparent chain of responsibility built ONLY from the action's
 * own audit events and result: prepared → authorized → executed → verified.
 * No hidden reasoning, just the operational record.
 */
function traceLines(
  action: ActionRecord,
  events: ActionEventRecord[],
  auth: Authorization | null
): { time: string; text: string }[] {
  const lines: { time: string; text: string }[] = [];
  const proposed = events.find((e) => e.type === "proposed");
  if (proposed) lines.push({ time: fmtTime(proposed.created_at), text: `Cosigno prepared: ${action.summary}` });
  const flagged = events.find((e) => e.type === "flagged");
  if (flagged) lines.push({ time: fmtTime(flagged.created_at), text: "Held: external content tried to direct the agent" });
  if (auth) {
    const verb = auth.method === "signed" ? "Signed" : auth.method === "auto" ? "Auto-authorized (tier 1)" : "Approved";
    lines.push({
      time: fmtTime(auth.authorized_at),
      text: `${verb}${auth.signed_name ? ` by ${auth.signed_name}` : ""} — permission: ${permissionUsed(action)}`,
    });
  }
  if (action.status === "executed") {
    lines.push({ time: fmtTime(action.resolved_at), text: "Cosigno executed the action" });
    lines.push({ time: fmtTime(action.resolved_at), text: outcomeOf(action.status, action.result) });
  } else if (action.status === "failed") {
    lines.push({ time: fmtTime(action.resolved_at), text: "Execution failed — nothing was left half-done" });
  }
  return lines;
}

export function ReceiptModal({ actionId, onClose }: { actionId: string; onClose(): void }) {
  const [action, setAction] = useState<ActionRecord | null>(null);
  const [events, setEvents] = useState<ActionEventRecord[]>([]);
  const [why, setWhy] = useState<string | null>(null);
  const [traceOpen, setTraceOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/actions/${actionId}`)
      .then((r) => r.json())
      .then((d) => {
        if (cancelled) return;
        if (!d.action) throw new Error(d.message || "Couldn't load the receipt.");
        setAction(d.action);
        setEvents(d.events ?? []);
        // Best-effort "why": the delegation this action belonged to.
        if (d.action.session_id) {
          fetch(`/api/sessions/${d.action.session_id}`)
            .then((r) => r.json())
            .then((s) => !cancelled && s.session?.title && setWhy(s.session.title))
            .catch(() => null);
        }
      })
      .catch((e) => !cancelled && setError(e instanceof Error ? e.message : "Couldn't load the receipt."));
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
        { label: "Prepared by", value: "Cosigno" },
        ...(why ? [{ label: "Why", value: why }] : []),
        {
          label: "Authorized by",
          value: auth?.signed_name ?? (auth?.method === "auto" ? "cosigno (your standing rule)" : "you"),
        },
        { label: "Authorization", value: auth ? METHOD_LABEL[auth.method] : "—" },
        { label: "Permission used", value: permissionUsed(action) },
        { label: "Authorized at", value: fmtTime(auth?.authorized_at) },
        { label: "Executed", value: fmtTime(action.resolved_at) },
        {
          label: "Status",
          value:
            action.status === "executed" ? (
              <span className="font-semibold text-signal-ink">Completed</span>
            ) : (
              action.status
            ),
        },
        ...(result?.summary ? [{ label: "Result", value: result.summary }] : []),
        { label: "Outcome", value: outcomeOf(action.status, action.result) },
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
      <div className="w-full max-w-md animate-spring-in rounded-card bg-surface p-6 shadow-raise">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-2">
            <CosignoMark size={18} />
            <p className="text-[0.75rem] font-semibold uppercase tracking-[0.1em] text-ink-soft">
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
            <h2 className="mt-3 text-base font-semibold leading-snug">{action.summary}</h2>
            {auth?.method === "signed" && (
              /* The Cosigno Seal — the user and cosigno co-sign important
                 work: cosigno prepared and executed, the user authorized. */
              <div className="relative mt-3 rounded-btn border border-ink/20 bg-cream px-6 pb-3 pt-3 shadow-well">
                <p className="text-center text-[0.75rem] font-semibold uppercase tracking-[0.22em] text-ink-soft">
                  Signed by {auth.signed_name ?? "you"}
                </p>
                {auth.signature_image && (
                  /* eslint-disable-next-line @next/next/no-img-element */
                  <img src={auth.signature_image} alt="authorizing signature" className="mx-auto h-14 object-contain" />
                )}
                <div className="mx-2 border-b border-ink/30" aria-hidden="true" />
                <p className="mt-1.5 flex items-center justify-center gap-1.5 text-[0.75rem] font-semibold uppercase tracking-[0.18em] text-ink-soft">
                  <CosignoMark size={11} /> Authorized through Cosigno · {fmtTime(auth.authorized_at)}
                </p>
              </div>
            )}
            <dl className="mt-4 flex flex-col">
              {rows.map((r) => (
                <div
                  key={r.label}
                  className="flex items-baseline justify-between gap-4 border-b border-line/50 py-2 last:border-0"
                >
                  <dt className="shrink-0 text-xs font-semibold uppercase tracking-wide text-ink-soft">
                    {r.label}
                  </dt>
                  <dd className="text-right text-sm font-semibold">{r.value}</dd>
                </div>
              ))}
            </dl>

            {/* TRACE — the chain of responsibility, from the audit record. */}
            <button
              onClick={() => setTraceOpen((v) => !v)}
              aria-expanded={traceOpen}
              className="mt-3 inline-flex items-center gap-1 text-xs font-semibold text-ink-soft underline underline-offset-2 hover:text-ink"
            >
              <ChevronDown size={12} className={`transition-transform ${traceOpen ? "rotate-180" : ""}`} />
              {traceOpen ? "hide trace" : "trace"}
            </button>
            {traceOpen && (
              <ol className="mt-2 flex flex-col gap-2 rounded-btn bg-cream-deep px-3 py-2.5">
                {traceLines(action, events, auth).map((t, i) => (
                  <li key={i} className="flex gap-2.5">
                    <span className="mt-1 h-[6px] w-[6px] shrink-0 rounded-pill bg-ink/40" aria-hidden="true" />
                    <div className="min-w-0 flex-1">
                      <p className="t-eyebrow">{t.time}</p>
                      <p className="text-xs font-semibold leading-snug">{t.text}</p>
                    </div>
                  </li>
                ))}
              </ol>
            )}

            {auth?.record_hash && (
              <p className="mt-3 break-all font-mono text-[0.75rem] leading-relaxed text-ink-soft">
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
