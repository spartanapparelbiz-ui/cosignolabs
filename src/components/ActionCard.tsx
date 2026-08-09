"use client";

import { memo, useState } from "react";
import { actionStatus } from "@/lib/status";
import { StatusPill } from "@/components/ui/StatusPill";
import {
  AlignLeft,
  Banknote,
  ChevronDown,
  Database,
  Megaphone,
  Pencil,
  PenLine,
  Plug,
  RotateCcw,
  Search,
  Send,
  ShieldAlert,
  Trash2,
  Wallet,
  Zap,
  type LucideIcon,
} from "lucide-react";
import type { ActionCategory, ActionRecord, SignatureRecord } from "@/lib/types";
import { CREAM } from "@/lib/brand";
import {
  effectLine,
  extractDiff,
  impactChips,
  resultPreview,
  reversibilityChip,
  operatorOf,
} from "@/lib/actionPresentation";
import { afterApprovalLine, approveLabel, beforeApprovalLine } from "@/lib/clarity";
import { signRequired } from "@/lib/sign";
import dynamic from "next/dynamic";
import { TierBadge } from "./TierBadge";

// Both are open-on-click overlays (the sign dialog drags in the whole
// signature-pad canvas machinery) — split out of the workspace/approvals
// route chunks and fetched the first time a user actually opens one.
const SignDialog = dynamic(() =>
  import("./sign/SignDialog").then((m) => m.SignDialog)
);
const ReceiptModal = dynamic(() =>
  import("./sign/ReceiptModal").then((m) => m.ReceiptModal)
);

export interface ApproveOpts {
  confirmation?: string;
  /** Present when the user authorized via the SIGN interaction. */
  signature?: { name: string; image?: string };
}

interface Props {
  action: ActionRecord;
  /** Stack position — used to stagger the entrance animation. */
  index?: number;
  /** Show the a/v keyboard-shortcut footer (account preference). */
  showKeyHints?: boolean;
  /** The user's saved signature, if any (enables Hold to Sign). */
  savedSignature?: SignatureRecord | null;
  /** Default name for a fresh signature ("Signed by …"). */
  signerName?: string;
  /** Persist a newly drawn signature for next time (best effort). */
  onSaveSignature?: (name: string, image: string) => Promise<void>;
  onApprove: (id: string, opts: ApproveOpts) => Promise<string | null>;
  onVeto: (id: string, reason: string) => Promise<string | null>;
  onEdit: (id: string, payload: Record<string, unknown>) => Promise<string | null>;
  /** Failed cards offer "propose again" — re-issues the action as a command. */
  onRetry?: (action: ActionRecord) => void;
}

/** Category glyphs — every card answers "what kind of thing is this" at a glance. */
const CATEGORY_GLYPH: Record<ActionCategory, LucideIcon> = {
  search: Search,
  summarize: AlignLeft,
  draft: PenLine,
  send_email: Send,
  post_content: Megaphone,
  update_record: Database,
  spend: Wallet,
  webhook: Zap,
  delete: Trash2,
  refund: RotateCcw,
  payment: Banknote,
  connection_call: Plug,
};

const CHIP_STYLE: Record<string, string> = {
  neutral: "bg-cream-deep text-ink-soft",
  safe: "bg-cream-deep text-ink-soft ring-1 ring-inset ring-ink/10",
  external: "text-ink ring-1 ring-inset ring-ink/30",
  permanent: "bg-ink text-cream",
};

const INJECTION_TOOLTIP =
  "external content tried to direct this action, so approval is locked. re-issue the command yourself if you want this done.";

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
      {label && (
        <span className="text-xs font-extrabold lowercase tracking-wide">{label}</span>
      )}
    </div>
  );
}

/** Smooth expand/collapse via grid-rows — never a height jump. */
function Collapse({ open, children }: { open: boolean; children: React.ReactNode }) {
  return (
    <div
      className={`grid transition-[grid-template-rows] duration-base ease-brand-out ${
        open ? "[grid-template-rows:1fr]" : "[grid-template-rows:0fr]"
      }`}
    >
      <div className="min-h-0 overflow-hidden">{children}</div>
    </div>
  );
}

function timeOf(iso: string | null): string {
  if (!iso) return "";
  return new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function ActionCardInner({
  action,
  index = 0,
  showKeyHints = false,
  savedSignature = null,
  signerName = "",
  onSaveSignature,
  onApprove,
  onVeto,
  onEdit,
  onRetry,
}: Props) {
  const enterDelay = { animationDelay: `${Math.min(index, 6) * 60}ms` };
  const [mode, setMode] = useState<"view" | "edit" | "veto">("view");
  const [payloadText, setPayloadText] = useState(() =>
    JSON.stringify(action.payload, null, 2)
  );
  const [vetoReason, setVetoReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [resultOpen, setResultOpen] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [signOpen, setSignOpen] = useState(false);
  const [receiptOpen, setReceiptOpen] = useState(false);

  const pending = action.status === "proposed";
  const inFlight = action.status === "approved" || action.status === "executing";
  const resolved = ["executed", "failed", "vetoed"].includes(action.status);
  const flagged = action.injection_flag;

  const Glyph = CATEGORY_GLYPH[action.category] ?? PenLine;
  const effect = effectLine(action);
  const chips = impactChips(action);
  const diff = extractDiff(action.payload);
  const result = resultPreview(action.result);
  const risk = reversibilityChip(action.category, action.tier);

  async function run(fn: () => Promise<string | null>) {
    setBusy(true);
    setError(null);
    const err = await fn();
    if (err) setError(err);
    setBusy(false);
    return err;
  }

  // SIGN actions (tier 3, and outward-facing tier 2 like external email or
  // spend) authorize through the signature surface; the rest are one click.
  const needsSign = signRequired(action.category, action.tier);

  async function handleApprove() {
    if (flagged) return; // held for review — server refuses too
    if (needsSign) {
      setSignOpen(true);
      return;
    }
    const err = await run(() => onApprove(action.id, {}));
    if (!err) setMode("view");
  }

  /** The SignDialog's authorize hook — same engine door, signature attached. */
  async function authorizeSigned(signature: { name: string; image?: string }) {
    // Tier 3 keeps its server confirmation contract; the deliberate human
    // step is now the drawn signature, which supplies it.
    return onApprove(action.id, {
      confirmation: action.tier === 3 ? action.category : undefined,
      signature,
    });
  }

  // a = approve, v = veto — only when the card itself holds focus (never when
  // the visitor is typing in the payload editor / veto reason / confirm field).
  function onCardKeyDown(e: React.KeyboardEvent<HTMLElement>) {
    if (e.target !== e.currentTarget || !pending || busy) return;
    if (e.key === "a" || e.key === "A") {
      e.preventDefault();
      handleApprove();
    } else if (e.key === "v" || e.key === "V") {
      e.preventDefault();
      setMode("veto");
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
  // muted strike for vetoed. The result summary stays readable on the row.
  if (resolved && !expanded) {
    return (
      <button
        onClick={() => setExpanded(true)}
        className={`group flex w-full items-center gap-3 rounded-card bg-surface/50 px-4 py-2.5 text-left shadow-soft transition-shadow hover:shadow-lift animate-card-in ${
          action.status === "executed" ? "animate-ring-flash" : ""
        }`}
      >
        {/* No aria-label here on purpose.
            One used to restate the row as "{status}: {summary} — expand
            details", which reads fine and quietly REPLACED everything the row
            actually shows: the result line and the time were no longer part of
            the button's name, and someone using voice control could not
            activate it by saying the words in front of them (WCAG 2.5.3).
            The row already says all of that in visible text; the only thing
            missing was the status, which is carried by a glyph — so that is
            what gets added, and the name is now the visible row plus the one
            fact a sighted reader gets from a shape. */}
        <span className="sr-only">{actionStatus(action.status)}:</span>
        {action.status === "executed" ? (
          <SignedCheck label="" />
        ) : action.status === "vetoed" ? (
          <span className="h-4 w-4 shrink-0 rounded-pill ring-1 ring-inset ring-ink/40" aria-hidden="true" />
        ) : (
          <span className="h-4 w-4 shrink-0 rounded-pill bg-ink" aria-hidden="true" />
        )}
        <span className="min-w-0 flex-1">
          <span
            className={`block truncate text-sm font-semibold ${
              action.status === "vetoed" ? "text-ink-soft line-through decoration-ink/40" : ""
            } ${action.status === "failed" ? "text-ink-soft" : ""}`}
          >
            {action.summary}
          </span>
          {action.status === "executed" && result?.summary && (
            <span className="block truncate text-[11px] text-ink-soft">
              {result.summary}
            </span>
          )}
        </span>
        <span className="shrink-0 text-right text-[11px] text-ink-soft">
          {actionStatus(action.status)}
          {action.resolved_at && (
            <span className="block">{timeOf(action.resolved_at)}</span>
          )}
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
      tabIndex={pending ? 0 : undefined}
      onKeyDown={pending ? onCardKeyDown : undefined}
      className={`relative animate-card-in overflow-hidden rounded-card bg-surface/70 p-4 transition-shadow focus:outline-none focus-visible:ring-2 focus-visible:ring-signal ${
        pending ? "shadow-depth-lift" : "shadow-depth"
      } ${action.status === "vetoed" ? "opacity-70 grayscale" : ""}`}
    >
      {/* Tier-3 (locked) cards wear a faint diagonal hazard band down the edge. */}
      {action.tier === 3 && (
        <span
          className="tier3-texture pointer-events-none absolute inset-y-0 left-0 w-8"
          aria-hidden="true"
        />
      )}

      <header className="flex gap-3">
        <span
          className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-btn bg-cream-deep text-ink"
          aria-hidden="true"
        >
          <Glyph size={16} strokeWidth={2.4} />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <TierBadge tier={action.tier} />
            {/* Who prepared this. "communication operator" was the engine's
                word for it; a person reads the same fact as a specialist
                cosigno brought in, which is also what actually happened. */}
            <span className="rounded-pill bg-ink/5 px-2.5 py-0.5 text-[11px] font-bold lowercase tracking-wide text-ink-soft ring-1 ring-inset ring-ink/15">
              {operatorOf(action.category)} specialist
            </span>
            <StatusPill status={actionStatus(action.status)} size="sm" />
            <span className="ml-auto text-[11px] text-ink-soft">
              {timeOf(action.resolved_at ?? action.created_at)}
            </span>
            {resolved && (
              <button
                onClick={() => setExpanded(false)}
                className="rounded-btn px-1.5 py-0.5 text-[11px] font-bold lowercase text-ink-soft hover:bg-cream-deep"
              >
                collapse
              </button>
            )}
          </div>
          <p className="mt-2 text-[15px] font-semibold leading-snug">{action.summary}</p>
          <p
            className={`mt-1 text-xs ${
              risk.grade === "permanent"
                ? "font-bold text-ink"
                : "font-semibold text-ink-soft"
            }`}
          >
            {effect}
          </p>
        </div>
      </header>

      {/* what it touches */}
      <div className="mt-2.5 flex flex-wrap gap-1.5 pl-12">
        {chips.map((chip) => (
          <span
            key={chip.label}
            className={`rounded-pill px-2 py-0.5 text-[10px] font-bold lowercase tracking-wide ${CHIP_STYLE[chip.grade]}`}
          >
            {chip.label}
          </span>
        ))}
      </div>

      {/* the two truths every approval needs: what has already happened,
          and what will happen the moment it's approved. */}
      {pending && !flagged && (
        <p className="mt-2 pl-12 text-[11px] font-semibold text-ink-soft">
          {beforeApprovalLine(action.category)} {afterApprovalLine(action.category)}
        </p>
      )}

      {flagged && (
        <div className="mt-3 flex items-start gap-1.5 rounded-btn bg-signal/10 px-2.5 py-2 text-[11px] font-bold lowercase leading-snug text-signal ring-1 ring-inset ring-signal/30">
          <ShieldAlert size={13} strokeWidth={2.5} className="mt-px shrink-0" aria-hidden="true" />
          external content tried to direct the agent — held for your review.
        </div>
      )}

      {action.tier_note && (
        <p className="mt-2 rounded-btn bg-cream-deep px-3 py-2 text-xs text-ink-soft">
          {action.tier_note}
        </p>
      )}

      {/* exact payload / diff — collapsed by default */}
      <div className="mt-2.5">
        <button
          onClick={() => setDetailsOpen((v) => !v)}
          className="inline-flex items-center gap-1 text-xs font-bold lowercase text-ink-soft underline underline-offset-2"
          aria-expanded={detailsOpen}
        >
          <ChevronDown
            size={12}
            className={`transition-transform duration-base ${detailsOpen ? "rotate-180" : ""}`}
            aria-hidden="true"
          />
          {detailsOpen ? "hide details" : "view details"}
        </button>
        <Collapse open={detailsOpen && mode !== "edit"}>
          {diff ? (
            <div className="mt-2 overflow-hidden rounded-btn bg-cream-deep shadow-well">
              <p className="px-3 pt-2 text-[10px] font-bold lowercase tracking-widest text-ink-soft">
                before → after
              </p>
              <table className="w-full font-mono text-[11px] leading-relaxed">
                <tbody>
                  {diff.map((row) => (
                    <tr key={row.field} className="border-t border-line/50 first:border-0">
                      <td className="px-3 py-1.5 align-top font-bold text-ink-soft">{row.field}</td>
                      <td className="px-2 py-1.5 align-top text-ink-soft line-through decoration-ink/40">
                        {row.before}
                      </td>
                      <td className="px-1 py-1.5 align-top text-ink-soft" aria-hidden="true">→</td>
                      <td className="px-3 py-1.5 align-top font-bold text-ink">{row.after}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <pre className="mt-2 max-h-48 overflow-auto rounded-btn bg-cream-deep px-3 py-2.5 font-mono text-[11px] leading-relaxed text-ink shadow-well">
              {JSON.stringify(action.payload, null, 2)}
            </pre>
          )}
        </Collapse>
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
                className="rounded-btn bg-ink px-4 py-1.5 text-xs font-bold text-cream disabled:bg-cream-deep disabled:text-ink-soft disabled:shadow-none disabled:cursor-not-allowed"
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

      {/* what happened */}
      {resolved && action.status !== "vetoed" && result && (
        <div
          className={`mt-3 rounded-btn px-3 py-2 text-xs ${
            action.status === "failed"
              ? "ring-1 ring-inset ring-ink/40 text-ink"
              : "bg-cream-deep text-ink-soft"
          }`}
        >
          <p className="font-semibold">
            {result.simulated && (
              <span className="mr-1.5 rounded-pill bg-ink/10 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-ink-soft">
                sandbox · simulated
              </span>
            )}
            {result.summary}
          </p>
          {result.items.length > 0 && (
            <>
              <button
                onClick={() => setResultOpen((v) => !v)}
                className="mt-1 text-[11px] font-bold lowercase underline underline-offset-2"
                aria-expanded={resultOpen}
              >
                {resultOpen ? "hide results" : `view results (${result.items.length + result.more})`}
              </button>
              <Collapse open={resultOpen}>
                <ul className="mt-1.5 flex flex-col gap-1 font-mono text-[11px]">
                  {result.items.map((item, i) => (
                    <li key={i} className="truncate rounded bg-cream px-2 py-1">
                      {item}
                    </li>
                  ))}
                  {result.more > 0 && (
                    <li className="px-2 text-ink-soft">…and {result.more} more</li>
                  )}
                </ul>
              </Collapse>
            </>
          )}
        </div>
      )}

      {action.status === "failed" && (
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <p className="text-xs font-semibold text-ink-soft">
            this didn&apos;t complete — nothing was left half-done.
          </p>
          {onRetry && (
            <button
              onClick={() => onRetry(action)}
              className="inline-flex items-center gap-1 rounded-btn px-2.5 py-1 text-xs font-bold ring-1 ring-inset ring-ink transition-colors hover:bg-cream-deep"
            >
              <RotateCcw size={11} strokeWidth={2.5} aria-hidden="true" />
              propose again
            </button>
          )}
        </div>
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
        <p className="mt-3 flex items-center gap-2 text-xs font-bold text-ink-soft">
          <span className="h-2 w-2 animate-orb-pulse rounded-pill bg-signal" aria-hidden="true" />
          Working
        </p>
      )}

      {pending && mode !== "edit" && (
        <footer className="mt-4 flex flex-wrap items-center gap-2">
          <span title={flagged ? INJECTION_TOOLTIP : undefined}>
            <button
              onClick={handleApprove}
              disabled={busy || flagged}
              aria-disabled={flagged || undefined}
              title={flagged ? INJECTION_TOOLTIP : undefined}
              className="inline-flex items-center gap-1.5 rounded-btn bg-signal px-5 py-2 text-sm font-extrabold text-ink shadow-soft transition-transform hover:scale-[1.02] active:scale-95 disabled:scale-100 disabled:bg-cream-deep disabled:text-ink-soft disabled:shadow-none disabled:cursor-not-allowed"
            >
              {busy ? (
                <>
                  <span
                    className="h-3.5 w-3.5 animate-orb-think rounded-pill border-2 border-ink/30 border-t-ink"
                    aria-hidden="true"
                  />
                  {/* The button's own busy state, not a status. It says what
                      this click is doing, in the same register as the label it
                      replaced. */}
                  Approving…
                </>
              ) : needsSign ? (
                <>
                  <PenLine size={14} strokeWidth={2.6} aria-hidden="true" />
                  Sign →
                </>
              ) : (
                <>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                    <path
                      d="M4.5 12.5 10 18 20 6.5"
                      stroke="currentColor"
                      strokeWidth="3.4"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                  {approveLabel(action.category)}
                </>
              )}
            </button>
          </span>
          <button
            onClick={() => setMode("edit")}
            disabled={busy}
            className="inline-flex items-center gap-1.5 rounded-btn px-4 py-2 text-sm font-bold text-ink-soft transition-colors hover:bg-cream-deep disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Pencil size={13} strokeWidth={2.5} aria-hidden="true" />
            edit
          </button>
          {mode !== "veto" ? (
            <button
              onClick={() => setMode("veto")}
              disabled={busy}
              className="rounded-btn px-4 py-2 text-sm font-bold ring-1 ring-inset ring-ink transition-colors hover:bg-cream-deep disabled:opacity-50 disabled:cursor-not-allowed"
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
                className="rounded-btn bg-ink px-4 py-1.5 text-xs font-bold text-cream disabled:bg-cream-deep disabled:text-ink-soft disabled:shadow-none disabled:cursor-not-allowed"
              >
                confirm veto
              </button>
            </span>
          )}
        </footer>
      )}

      {pending && showKeyHints && mode === "view" && !flagged && (
        <p className="mt-2 text-[10px] font-bold lowercase tracking-wide text-ink-soft/70">
          focus a card, then press{" "}
          <kbd className="rounded bg-cream-deep px-1 font-mono">a</kbd> to approve ·{" "}
          <kbd className="rounded bg-cream-deep px-1 font-mono">v</kbd> to veto
        </p>
      )}

      {action.status === "executed" && (
        <div className="mt-3 flex items-center justify-between gap-3">
          <SignedCheck />
          <button
            onClick={() => setReceiptOpen(true)}
            className="rounded-btn px-3 py-1 text-xs font-bold lowercase text-ink-soft underline underline-offset-2 hover:text-ink"
          >
            view receipt
          </button>
        </div>
      )}

      {signOpen && (
        <SignDialog
          action={action}
          saved={savedSignature}
          defaultName={signerName}
          onAuthorize={authorizeSigned}
          onSaveSignature={async (n, img) => onSaveSignature?.(n, img)}
          onClose={() => setSignOpen(false)}
        />
      )}
      {receiptOpen && <ReceiptModal actionId={action.id} onClose={() => setReceiptOpen(false)} />}
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
    prev.showKeyHints === next.showKeyHints &&
    prev.savedSignature === next.savedSignature &&
    prev.signerName === next.signerName &&
    prev.onSaveSignature === next.onSaveSignature &&
    prev.onApprove === next.onApprove &&
    prev.onVeto === next.onVeto &&
    prev.onEdit === next.onEdit &&
    prev.onRetry === next.onRetry
);
