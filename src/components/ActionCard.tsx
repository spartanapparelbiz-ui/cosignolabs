"use client";

import { memo, useState } from "react";
import { ChevronDown, Pencil, ShieldAlert } from "lucide-react";
import type { ActionRecord } from "@/lib/types";
import { CREAM } from "@/lib/brand";
import { TierBadge } from "./TierBadge";

interface Props {
  action: ActionRecord;
  /** Stack position — used to stagger the entrance animation. */
  index?: number;
  onApprove: (
    id: string,
    opts: { confirmation?: string }
  ) => Promise<string | null>;
  onVeto: (id: string, reason: string) => Promise<string | null>;
  onEdit: (id: string, payload: Record<string, unknown>) => Promise<string | null>;
}

const STATUS_LABEL: Record<ActionRecord["status"], string> = {
  proposed: "awaiting your sign-off",
  approved: "approved",
  executing: "executing…",
  executed: "executed",
  failed: "failed",
  vetoed: "vetoed",
};

/** The drawn-in brand check shown on executed cards. */
export function SignedCheck({ label = "signed & executed" }: { label?: string }) {
  return (
    <div className="flex items-center gap-1.5 text-signal">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" className="animate-check-pop" aria-hidden="true">
        <circle cx="12" cy="12" r="11" fill="currentColor" />
        <path
          d="M6.5 12.5 10.5 16.5 17.5 8.5"
          stroke={CREAM}
          strokeWidth="2.8"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeDasharray="24"
          className="animate-check-draw"
        />
      </svg>
      <span className="text-xs font-extrabold lowercase tracking-wide">{label}</span>
    </div>
  );
}

function ActionCardInner({ action, index = 0, onApprove, onVeto, onEdit }: Props) {
  const enterDelay = { animationDelay: `${Math.min(index, 6) * 60}ms` };
  const [mode, setMode] = useState<"view" | "edit" | "veto" | "confirm">("view");
  const [payloadText, setPayloadText] = useState(() =>
    JSON.stringify(action.payload, null, 2)
  );
  const [vetoReason, setVetoReason] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [payloadOpen, setPayloadOpen] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [shake, setShake] = useState(false);

  const pending = action.status === "proposed";
  const inFlight = action.status === "approved" || action.status === "executing";
  const resolved = ["executed", "failed", "vetoed"].includes(action.status);

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
    else if (/match/i.test(err)) {
      // wrong typed confirmation → shake the field
      setShake(true);
      setTimeout(() => setShake(false), 260);
    }
  }

  async function handleSaveEdit() {
    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(payloadText);
    } catch {
      setError("the payload needs to be valid JSON.");
      return;
    }
    const err = await run(() => onEdit(action.id, parsed));
    if (!err) setMode("view");
  }

  // Resolved cards collapse to a compact row: orange check for executed,
  // muted strike for vetoed. Click to expand the full record.
  if (resolved && !expanded) {
    return (
      <button
        onClick={() => setExpanded(true)}
        className={`group flex w-full items-center gap-3 rounded-card bg-white/50 px-4 py-2.5 text-left shadow-soft transition-shadow hover:shadow-lift animate-spring-in ${
          action.status === "executed" ? "animate-ring-flash" : ""
        }`}
        aria-label={`${STATUS_LABEL[action.status]}: ${action.summary} — expand details`}
      >
        {action.status === "executed" ? (
          <SignedCheck label="" />
        ) : action.status === "vetoed" ? (
          <span className="h-4 w-4 shrink-0 rounded-full ring-1 ring-inset ring-ink/40" aria-hidden="true" />
        ) : (
          <span className="h-4 w-4 shrink-0 rounded-full bg-ink" aria-hidden="true" />
        )}
        <span
          className={`min-w-0 flex-1 truncate text-sm font-semibold ${
            action.status === "vetoed" ? "text-ink-soft line-through decoration-ink/40" : ""
          } ${action.status === "failed" ? "text-ink-soft" : ""}`}
        >
          {action.summary}
        </span>
        <span className="text-[11px] lowercase text-ink-soft">
          {STATUS_LABEL[action.status]}
        </span>
        <ChevronDown
          size={14}
          className="shrink-0 text-ink-soft transition-transform group-hover:translate-y-0.5"
          aria-hidden="true"
        />
      </button>
    );
  }

  return (
    <article
      style={enterDelay}
      className={`animate-spring-in rounded-card bg-white/70 p-4 transition-shadow ${
        pending ? "shadow-lift" : "shadow-soft"
      } ${action.status === "vetoed" ? "opacity-70 grayscale" : ""}`}
    >
      <header className="flex flex-wrap items-center gap-2">
        <TierBadge tier={action.tier} />
        <span
          className={`rounded-pill px-2.5 py-0.5 text-[11px] font-bold lowercase tracking-wide ${
            action.status === "executed"
              ? "bg-signal text-cream"
              : action.status === "vetoed" || action.status === "failed"
                ? "ring-1 ring-inset ring-ink/40 text-ink"
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
        {resolved && (
          <button
            onClick={() => setExpanded(false)}
            className="rounded-btn px-1.5 py-0.5 text-[11px] font-bold lowercase text-ink-soft hover:bg-cream-deep"
          >
            collapse
          </button>
        )}
      </header>

      {action.injection_flag && (
        <div className="mt-2 inline-flex animate-chip-pulse items-center gap-1.5 rounded-pill bg-ink px-2.5 py-1 text-[11px] font-bold lowercase text-cream [animation-iteration-count:2]">
          <ShieldAlert size={12} strokeWidth={2.5} aria-hidden="true" />
          external content attempted to direct the agent — held for your review
        </div>
      )}

      {action.tier_note && (
        <p className="mt-2 rounded-btn bg-cream-deep px-3 py-2 text-xs text-ink-soft">
          {action.tier_note}
        </p>
      )}

      <p className="mt-3 text-[15px] font-semibold leading-snug">{action.summary}</p>

      <div className="mt-3">
        <button
          onClick={() => setPayloadOpen((v) => !v)}
          className="text-xs font-bold lowercase text-ink-soft underline underline-offset-2"
          aria-expanded={payloadOpen}
        >
          {payloadOpen ? "hide payload" : "show exact payload"}
        </button>
        {payloadOpen && mode !== "edit" && (
          <pre className="mt-2 max-h-48 overflow-auto rounded-btn bg-cream-deep px-3 py-2.5 font-mono text-[11px] leading-relaxed text-ink">
            {JSON.stringify(action.payload, null, 2)}
          </pre>
        )}
        {mode === "edit" && (
          <div className="mt-2">
            <textarea
              value={payloadText}
              onChange={(e) => setPayloadText(e.target.value)}
              rows={8}
              className="w-full rounded-btn bg-cream-deep p-2.5 font-mono text-[11px] leading-relaxed"
              aria-label="edit action payload (JSON)"
            />
            <div className="mt-2 flex gap-2">
              <button
                onClick={handleSaveEdit}
                disabled={busy}
                className="rounded-btn bg-ink px-4 py-1.5 text-xs font-bold text-cream disabled:opacity-50"
              >
                save changes
              </button>
              <button
                onClick={() => {
                  setMode("view");
                  setPayloadText(JSON.stringify(action.payload, null, 2));
                }}
                className="rounded-btn px-4 py-1.5 text-xs font-bold text-ink-soft hover:bg-cream-deep"
              >
                cancel
              </button>
            </div>
          </div>
        )}
      </div>

      {action.result && resolved && (
        <p
          className={`mt-3 rounded-btn px-3 py-2 text-xs ${
            action.status === "failed"
              ? "ring-1 ring-inset ring-ink/40 text-ink"
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
        <p className="mt-3 text-xs text-ink-soft">veto reason: {action.veto_reason}</p>
      )}

      {error && (
        <p className="mt-3 rounded-btn bg-cream-deep px-3 py-2 text-xs font-semibold" role="alert">
          {error}
        </p>
      )}

      {inFlight && (
        <p className="mt-3 flex items-center gap-2 text-xs font-bold lowercase text-ink-soft">
          <span className="h-2 w-2 animate-orb-pulse rounded-full bg-signal" aria-hidden="true" />
          executing…
        </p>
      )}

      {pending && mode === "confirm" && (
        <div className="mt-3 origin-top animate-modal-in rounded-btn bg-cream-deep p-3 ring-1 ring-inset ring-ink/15">
          <p className="text-xs font-bold">
            this is a locked action. type its name to approve:{" "}
            <code className="rounded bg-cream px-1.5 py-0.5 font-mono">{action.category}</code>
          </p>
          <input
            value={confirmation}
            onChange={(e) => setConfirmation(e.target.value)}
            placeholder={action.category}
            className={`mt-2 w-full rounded-btn bg-cream px-3 py-2 text-sm ${shake ? "animate-shake-x" : ""}`}
            aria-label="type the action name to confirm"
          />
        </div>
      )}

      {pending && mode !== "edit" && (
        <footer className="mt-4 flex flex-wrap items-center gap-2">
          <button
            onClick={handleApprove}
            disabled={busy || (mode === "confirm" && !confirmation)}
            className="inline-flex items-center gap-1.5 rounded-btn bg-signal px-5 py-2 text-sm font-extrabold text-ink shadow-soft transition-transform hover:scale-[1.02] active:scale-95 disabled:opacity-50"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path
                d="M4.5 12.5 10 18 20 6.5"
                stroke="currentColor"
                strokeWidth="3.4"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
            {mode === "confirm" ? "confirm & approve" : "approve"}
          </button>
          <button
            onClick={() => setMode("edit")}
            disabled={busy}
            className="inline-flex items-center gap-1.5 rounded-btn px-4 py-2 text-sm font-bold text-ink-soft transition-colors hover:bg-cream-deep disabled:opacity-50"
          >
            <Pencil size={13} strokeWidth={2.5} aria-hidden="true" />
            edit
          </button>
          {mode !== "veto" ? (
            <button
              onClick={() => setMode("veto")}
              disabled={busy}
              className="rounded-btn px-4 py-2 text-sm font-bold ring-1 ring-inset ring-ink transition-colors hover:bg-cream-deep disabled:opacity-50"
            >
              veto
            </button>
          ) : (
            <span className="flex w-full items-center gap-2 sm:w-auto">
              <input
                value={vetoReason}
                onChange={(e) => setVetoReason(e.target.value)}
                placeholder="why? (logged)"
                className="w-40 rounded-btn bg-cream-deep px-3 py-1.5 text-xs"
                aria-label="veto reason"
              />
              <button
                onClick={() =>
                  run(() => onVeto(action.id, vetoReason)).then(
                    (err) => !err && setMode("view")
                  )
                }
                disabled={busy}
                className="rounded-btn bg-ink px-4 py-1.5 text-xs font-bold text-cream disabled:opacity-50"
              >
                confirm veto
              </button>
            </span>
          )}
        </footer>
      )}

      {action.status === "executed" && (
        <div className="mt-3">
          <SignedCheck />
        </div>
      )}
    </article>
  );
}

/**
 * Memoized so realtime updates re-render only the card whose record
 * actually changed — the stack stays 60fps however long it gets.
 */
export const ActionCard = memo(
  ActionCardInner,
  (prev, next) =>
    prev.action === next.action &&
    prev.index === next.index &&
    prev.onApprove === next.onApprove &&
    prev.onVeto === next.onVeto &&
    prev.onEdit === next.onEdit
);
