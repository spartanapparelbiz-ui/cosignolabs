"use client";

import { useState } from "react";
import type { ActionRecord } from "@/lib/types";
import { TierBadge } from "./TierBadge";

interface Props {
  action: ActionRecord;
  onApprove: (
    id: string,
    opts: { confirmation?: string; payload?: Record<string, unknown> }
  ) => Promise<string | null>;
  onVeto: (id: string, reason: string) => Promise<string | null>;
  onEdit: (id: string, payload: Record<string, unknown>) => Promise<string | null>;
}

const STATUS_LABEL: Record<ActionRecord["status"], string> = {
  proposed: "Awaiting your sign-off",
  approved: "Approved",
  executing: "Executing…",
  executed: "Executed",
  failed: "Failed",
  vetoed: "Vetoed",
};

export function ActionCard({ action, onApprove, onVeto, onEdit }: Props) {
  const [mode, setMode] = useState<"view" | "edit" | "veto" | "confirm">("view");
  const [payloadText, setPayloadText] = useState(() =>
    JSON.stringify(action.payload, null, 2)
  );
  const [vetoReason, setVetoReason] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [payloadOpen, setPayloadOpen] = useState(action.status === "proposed");

  const pending = action.status === "proposed";
  const done = ["executed", "failed", "vetoed"].includes(action.status);

  async function run(fn: () => Promise<string | null>) {
    setBusy(true);
    setError(null);
    const err = await fn();
    if (err) setError(err);
    setBusy(false);
    return err;
  }

  async function handleApprove() {
    if (action.tier === 3 && mode !== "confirm") {
      setMode("confirm");
      return;
    }
    const err = await run(() =>
      onApprove(action.id, {
        confirmation: action.tier === 3 ? confirmation : undefined,
      })
    );
    if (!err) setMode("view");
  }

  async function handleSaveEdit() {
    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(payloadText);
    } catch {
      setError("Payload must be valid JSON.");
      return;
    }
    const err = await run(() => onEdit(action.id, parsed));
    if (!err) setMode("view");
  }

  return (
    <article
      className={`animate-card-in rounded-card border bg-white/60 p-4 shadow-sm transition-colors ${
        pending ? "border-ink" : "border-line opacity-90"
      } ${action.status === "vetoed" ? "opacity-60" : ""}`}
    >
      <header className="flex flex-wrap items-center gap-2">
        <TierBadge tier={action.tier} />
        <span
          className={`rounded-pill px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-wide ${
            action.status === "executed"
              ? "bg-accent text-cream"
              : action.status === "vetoed" || action.status === "failed"
                ? "border border-ink text-ink"
                : "bg-cream-deep text-ink-soft"
          }`}
        >
          {STATUS_LABEL[action.status]}
        </span>
        <span className="ml-auto text-[11px] text-ink-soft">
          {new Date(action.created_at).toLocaleTimeString([], {
            hour: "2-digit",
            minute: "2-digit",
          })}
        </span>
      </header>

      {action.injection_flag && (
        <div className="mt-2 inline-flex items-center gap-1.5 rounded-pill border border-ink bg-cream-deep px-2.5 py-1 text-[11px] font-bold text-ink">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none">
            <path
              d="M12 3 2.5 20h19L12 3Zm0 6v5m0 3v.5"
              stroke="currentColor"
              strokeWidth="2.2"
              strokeLinecap="round"
            />
          </svg>
          External content attempted to direct the agent
        </div>
      )}

      {action.tier_note && (
        <p className="mt-2 rounded-lg bg-cream-deep px-3 py-2 text-xs text-ink-soft">
          {action.tier_note}
        </p>
      )}

      <p className="mt-3 text-[15px] font-semibold leading-snug">{action.summary}</p>

      <div className="mt-3">
        <button
          onClick={() => setPayloadOpen((v) => !v)}
          className="text-xs font-bold text-ink-soft underline underline-offset-2"
        >
          {payloadOpen ? "hide payload" : "show exact payload"}
        </button>
        {payloadOpen && mode !== "edit" && (
          <pre className="mt-2 max-h-48 overflow-auto rounded-lg bg-ink px-3 py-2.5 text-[11px] leading-relaxed text-cream">
            {JSON.stringify(action.payload, null, 2)}
          </pre>
        )}
        {mode === "edit" && (
          <div className="mt-2">
            <textarea
              value={payloadText}
              onChange={(e) => setPayloadText(e.target.value)}
              rows={8}
              className="w-full rounded-lg border border-ink bg-white/80 p-2.5 font-mono text-[11px] leading-relaxed"
              aria-label="Edit action payload (JSON)"
            />
            <div className="mt-2 flex gap-2">
              <button
                onClick={handleSaveEdit}
                disabled={busy}
                className="rounded-pill bg-ink px-4 py-1.5 text-xs font-bold text-cream disabled:opacity-50"
              >
                Save changes
              </button>
              <button
                onClick={() => {
                  setMode("view");
                  setPayloadText(JSON.stringify(action.payload, null, 2));
                }}
                className="rounded-pill border border-ink px-4 py-1.5 text-xs font-bold"
              >
                Cancel
              </button>
            </div>
          </div>
        )}
      </div>

      {action.result && done && (
        <p
          className={`mt-3 rounded-lg px-3 py-2 text-xs ${
            action.status === "failed"
              ? "border border-ink text-ink"
              : "bg-cream-deep text-ink-soft"
          }`}
        >
          {String(
            (action.result as Record<string, unknown>).summary ??
              (action.result as Record<string, unknown>).error ??
              ""
          )}
        </p>
      )}

      {action.status === "vetoed" && action.veto_reason && (
        <p className="mt-3 text-xs text-ink-soft">
          Veto reason: {action.veto_reason}
        </p>
      )}

      {error && (
        <p className="mt-3 rounded-lg border border-ink px-3 py-2 text-xs font-semibold">
          {error}
        </p>
      )}

      {pending && mode === "confirm" && (
        <div className="mt-3 rounded-lg border border-ink p-3">
          <p className="text-xs font-bold">
            Locked action. Type{" "}
            <code className="rounded bg-cream-deep px-1.5 py-0.5">{action.category}</code>{" "}
            to confirm.
          </p>
          <input
            value={confirmation}
            onChange={(e) => setConfirmation(e.target.value)}
            placeholder={action.category}
            className="mt-2 w-full rounded-lg border border-ink bg-white/80 px-3 py-2 text-sm"
            aria-label="Type the action name to confirm"
          />
        </div>
      )}

      {pending && mode !== "edit" && (
        <footer className="mt-4 flex flex-wrap items-center gap-2">
          <button
            onClick={handleApprove}
            disabled={busy || (mode === "confirm" && !confirmation)}
            className="inline-flex items-center gap-1.5 rounded-pill bg-accent px-5 py-2 text-sm font-extrabold text-cream shadow-sm transition-transform hover:scale-[1.02] active:scale-95 disabled:opacity-50"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
              <path
                d="M4.5 12.5 10 18 20 6.5"
                stroke="currentColor"
                strokeWidth="3.4"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
            {mode === "confirm" ? "Confirm & approve" : "Approve"}
          </button>
          <button
            onClick={() => setMode("edit")}
            disabled={busy}
            className="rounded-pill border border-ink px-4 py-2 text-sm font-bold disabled:opacity-50"
          >
            Edit
          </button>
          {mode !== "veto" ? (
            <button
              onClick={() => setMode("veto")}
              disabled={busy}
              className="rounded-pill border border-ink px-4 py-2 text-sm font-bold disabled:opacity-50"
            >
              Veto
            </button>
          ) : (
            <span className="flex w-full items-center gap-2 sm:w-auto">
              <input
                value={vetoReason}
                onChange={(e) => setVetoReason(e.target.value)}
                placeholder="Why? (logged)"
                className="w-40 rounded-pill border border-ink bg-white/80 px-3 py-1.5 text-xs"
                aria-label="Veto reason"
              />
              <button
                onClick={() =>
                  run(() => onVeto(action.id, vetoReason)).then(
                    (err) => !err && setMode("view")
                  )
                }
                disabled={busy}
                className="rounded-pill bg-ink px-4 py-1.5 text-xs font-bold text-cream disabled:opacity-50"
              >
                Confirm veto
              </button>
            </span>
          )}
        </footer>
      )}

      {action.status === "executed" && (
        <div className="mt-3 flex items-center gap-1.5 text-accent">
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            className="animate-check-pop"
          >
            <circle cx="12" cy="12" r="11" fill="currentColor" />
            <path
              d="M6.5 12.5 10.5 16.5 17.5 8.5"
              stroke="#FBF4EA"
              strokeWidth="2.8"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
          <span className="text-xs font-extrabold uppercase tracking-wide">
            Signed &amp; executed
          </span>
        </div>
      )}
    </article>
  );
}
