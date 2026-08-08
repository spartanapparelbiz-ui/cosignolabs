"use client";

import { memo, useState } from "react";
import { actionStatus } from "@/lib/status";
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
} from "@/lib/actionPresentation";
import { afterApprovalLine, approveLabel, beforeApprovalLine } from "@/lib/clarity";
import { signRequired } from "@/lib/sign";
import dynamic from "next/dynamic";
import { TierBadge } from "./TierBadge";
import { badge, btn, card, field, type BadgeTone } from "@/components/ui/styles";

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

/**
 * What an action touches, stated as plain facts on one quiet line. Only the
 * grade that means "this cannot be undone" is allowed to carry a color, and
 * even then it is the word that changes, not a filled block behind it.
 */
const CHIP_TONE: Record<string, BadgeTone> = {
  neutral: "neutral",
  safe: "neutral",
  external: "neutral",
  permanent: "danger",
};

const INJECTION_TOOLTIP =
  "external content tried to direct this action, so approval is locked. re-issue the command yourself if you want this done.";

/**
 * The drawn-in brand check shown on executed cards — the product's one quiet
 * celebration. The circle pops, the tick draws itself, and it is over in under
 * half a second. No confetti: the moment an action executes is a moment of
 * responsibility, not a party.
 */
export function SignedCheck({ label = "Signed & executed" }: { label?: string }) {
  return (
    <div className="flex items-center gap-2 text-signal">
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" className="animate-check-pop" aria-hidden="true">
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
      {label && <span className="text-[0.8125rem] font-semibold">{label}</span>}
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
        className={`${card(true)} group flex w-full animate-card-in items-center gap-3 px-4 py-3 text-left`}
        aria-label={`${actionStatus(action.status)}: ${action.summary} — expand details`}
      >
        {action.status === "executed" ? (
          <SignedCheck label="" />
        ) : action.status === "vetoed" ? (
          <span className="h-[15px] w-[15px] shrink-0 rounded-pill ring-1 ring-inset ring-ink/30" aria-hidden="true" />
        ) : (
          <span className="h-[15px] w-[15px] shrink-0 rounded-pill bg-ink/20" aria-hidden="true" />
        )}
        <span className="min-w-0 flex-1">
          <span
            className={`block truncate text-[0.9375rem] ${
              action.status === "vetoed" ? "text-ink-soft line-through decoration-ink/30" : ""
            } ${action.status === "failed" ? "text-ink-soft" : ""}`}
          >
            {action.summary}
          </span>
          {action.status === "executed" && result?.summary && (
            <span className="t-caption block truncate">{result.summary}</span>
          )}
        </span>
        <span className="t-caption shrink-0 text-right tabular-nums">
          {action.resolved_at ? timeOf(action.resolved_at) : actionStatus(action.status)}
        </span>
        <ChevronDown
          size={14}
          strokeWidth={2}
          className="shrink-0 text-ink-soft transition-transform duration-base ease-brand-out group-hover:translate-y-0.5"
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
      className={`${card()} relative animate-card-in overflow-hidden p-5 focus:outline-none focus-visible:shadow-[0_0_0_2px_rgb(var(--c-signal))] ${
        action.status === "vetoed" ? "opacity-60" : ""
      }`}
    >
      {/* An action that cannot be taken back wears a single hairline down its
          edge. One mark, no hazard stripes — the words already say it. */}
      {action.tier === 3 && (
        <span className="pointer-events-none absolute inset-y-0 left-0 w-[3px] bg-signal" aria-hidden="true" />
      )}

      <header className="flex gap-3">
        <span className="mt-1 shrink-0 text-ink-soft" aria-hidden="true">
          <Glyph size={16} strokeWidth={1.9} />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-start gap-3">
            <p className="t-title min-w-0 flex-1">{action.summary}</p>
            <span className="t-caption shrink-0 tabular-nums">
              {timeOf(action.resolved_at ?? action.created_at)}
            </span>
            {resolved && (
              <button
                onClick={() => setExpanded(false)}
                className="t-caption shrink-0 hover:text-ink"
              >
                Collapse
              </button>
            )}
          </div>
          <p className={`mt-1.5 t-body ${risk.grade === "permanent" ? "text-ink" : "text-ink-soft"}`}>
            {effect}
          </p>

          {/* What kind of authorization this needs, and what it touches — one
              quiet line, not a wall of pills. The operator name used to sit
              here too; it named an internal component, so it's gone. */}
          <div className="mt-3 flex flex-wrap items-center gap-1.5">
            <TierBadge tier={action.tier} />
            {chips.map((chip) => (
              <span key={chip.label} className={badge(CHIP_TONE[chip.grade] ?? "neutral")}>
                {chip.label}
              </span>
            ))}
            {resolved && <span className={badge("neutral")}>{actionStatus(action.status)}</span>}
          </div>
        </div>
      </header>

      {/* the two truths every approval needs: what has already happened,
          and what will happen the moment it's approved. */}
      {pending && !flagged && (
        <p className="t-caption mt-3 pl-7">
          {beforeApprovalLine(action.category)} {afterApprovalLine(action.category)}
        </p>
      )}

      {flagged && (
        <div className="mt-4 flex items-start gap-2 border-l-2 border-signal pl-3">
          <ShieldAlert size={14} strokeWidth={2} className="mt-0.5 shrink-0 text-signal" aria-hidden="true" />
          <p className="t-body">
            External content tried to direct this action, so it&apos;s held for your review.
          </p>
        </div>
      )}

      {action.tier_note && <p className="t-caption mt-3 pl-7">{action.tier_note}</p>}

      {/* exact payload / diff — collapsed by default */}
      <div className="mt-4 pl-7">
        <button
          onClick={() => setDetailsOpen((v) => !v)}
          className="t-caption inline-flex items-center gap-1.5 transition-colors duration-fast hover:text-ink"
          aria-expanded={detailsOpen}
        >
          <ChevronDown
            size={13}
            strokeWidth={2}
            className={`transition-transform duration-base ease-brand-out ${detailsOpen ? "rotate-180" : ""}`}
            aria-hidden="true"
          />
          {detailsOpen ? "Hide details" : "Details"}
        </button>
        <Collapse open={detailsOpen && mode !== "edit"}>
          {diff ? (
            <div className="mt-3 overflow-hidden rounded-btn bg-cream-deep/50">
              <p className="t-eyebrow px-3 pt-2.5">Before → after</p>
              <table className="w-full font-mono text-[0.75rem] leading-relaxed">
                <tbody>
                  {diff.map((row) => (
                    <tr key={row.field} className="border-t border-line/40 first:border-0">
                      <td className="px-3 py-2 align-top text-ink-soft">{row.field}</td>
                      <td className="px-2 py-2 align-top text-ink-soft line-through decoration-ink/30">
                        {row.before}
                      </td>
                      <td className="px-1 py-2 align-top text-ink-soft" aria-hidden="true">→</td>
                      <td className="px-3 py-2 align-top text-ink">{row.after}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <pre className="surface-scroll mt-3 max-h-48 overflow-auto rounded-btn bg-cream-deep/50 px-3 py-2.5 font-mono text-[0.75rem] leading-relaxed text-ink">
              {JSON.stringify(action.payload, null, 2)}
            </pre>
          )}
        </Collapse>
        {mode === "edit" && (
          <div className="mt-3">
            <textarea
              value={payloadText}
              onChange={(e) => setPayloadText(e.target.value)}
              rows={8}
              className="surface-scroll w-full rounded-btn bg-cream-deep/50 p-3 font-mono text-[0.75rem] leading-relaxed shadow-hairline focus-visible:outline-none focus-visible:shadow-[0_0_0_1px_rgb(var(--c-signal)),0_0_0_4px_rgb(var(--c-signal)/0.16)]"
              aria-label="edit action payload (JSON)"
            />
            <div className="mt-2.5 flex gap-1.5">
              <button onClick={handleSaveEdit} disabled={busy} className={btn("primary", "sm")}>
                Save changes
              </button>
              <button
                onClick={() => {
                  setMode("view");
                  setPayloadText(JSON.stringify(action.payload, null, 2));
                }}
                className={btn("ghost", "sm")}
              >
                Cancel
              </button>
            </div>
          </div>
        )}
      </div>

      {/* what happened */}
      {resolved && action.status !== "vetoed" && result && (
        <div className="mt-4 pl-7">
          <p className="t-body">
            {result.simulated && <span className={`${badge("neutral")} mr-2`}>sandbox</span>}
            {result.summary}
          </p>
          {result.items.length > 0 && (
            <>
              <button
                onClick={() => setResultOpen((v) => !v)}
                className="t-caption mt-1.5 transition-colors duration-fast hover:text-ink"
                aria-expanded={resultOpen}
              >
                {resultOpen ? "Hide results" : `View results (${result.items.length + result.more})`}
              </button>
              <Collapse open={resultOpen}>
                <ul className="mt-2 flex flex-col gap-1 font-mono text-[0.75rem]">
                  {result.items.map((item, i) => (
                    <li key={i} className="truncate rounded bg-cream-deep/50 px-2.5 py-1.5">
                      {item}
                    </li>
                  ))}
                  {result.more > 0 && <li className="t-caption px-2.5">…and {result.more} more</li>}
                </ul>
              </Collapse>
            </>
          )}
        </div>
      )}

      {action.status === "failed" && (
        <div className="mt-4 flex flex-wrap items-center gap-3 pl-7">
          <p className="t-body">This didn&apos;t complete. Nothing was left half-done.</p>
          {onRetry && (
            <button onClick={() => onRetry(action)} className={btn("secondary", "sm")}>
              <RotateCcw size={12} strokeWidth={2} aria-hidden="true" />
              Propose again
            </button>
          )}
        </div>
      )}

      {action.status === "vetoed" && action.veto_reason && (
        <p className="t-caption mt-4 pl-7">Vetoed — {action.veto_reason}</p>
      )}

      {error && (
        <p className="t-body mt-4 border-l-2 border-danger pl-3 text-danger" role="alert">
          {error}
        </p>
      )}

      {inFlight && (
        <p className="t-caption mt-4 flex items-center gap-2 pl-7">
          <span className="h-[5px] w-[5px] animate-orb-pulse rounded-pill bg-signal" aria-hidden="true" />
          Working
        </p>
      )}

      {pending && mode !== "edit" && (
        <footer className="mt-5 flex flex-wrap items-center gap-1.5 pl-7">
          <span title={flagged ? INJECTION_TOOLTIP : undefined}>
            <button
              onClick={handleApprove}
              disabled={busy || flagged}
              aria-disabled={flagged || undefined}
              title={flagged ? INJECTION_TOOLTIP : undefined}
              className={btn("sign", "md")}
            >
              {busy ? (
                <>
                  <span
                    className="h-3.5 w-3.5 animate-orb-think rounded-pill border-2 border-ink/25 border-t-ink"
                    aria-hidden="true"
                  />
                  {/* The button's own busy state, not a status. It says what
                      this click is doing, in the same register as the label it
                      replaced. */}
                  Approving…
                </>
              ) : needsSign ? (
                <>
                  <PenLine size={14} strokeWidth={2} aria-hidden="true" />
                  Sign
                </>
              ) : (
                <>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                    <path
                      d="M4.5 12.5 10 18 20 6.5"
                      stroke="currentColor"
                      strokeWidth="3"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                  {approveLabel(action.category)}
                </>
              )}
            </button>
          </span>
          <button onClick={() => setMode("edit")} disabled={busy} className={btn("ghost", "md")}>
            <Pencil size={13} strokeWidth={1.9} aria-hidden="true" />
            Edit
          </button>
          {mode !== "veto" ? (
            <button onClick={() => setMode("veto")} disabled={busy} className={btn("ghost", "md")}>
              Veto
            </button>
          ) : (
            <span className="flex w-full animate-fade-through items-center gap-1.5 sm:w-auto">
              <input
                value={vetoReason}
                onChange={(e) => setVetoReason(e.target.value)}
                placeholder="Why? (logged)"
                className={field("sm").replace("w-full", "w-44")}
                aria-label="veto reason"
              />
              <button
                onClick={() =>
                  run(() => onVeto(action.id, vetoReason)).then(
                    (err) => !err && setMode("view")
                  )
                }
                disabled={busy}
                className={btn("danger", "sm")}
              >
                Confirm veto
              </button>
            </span>
          )}
        </footer>
      )}

      {pending && showKeyHints && mode === "view" && !flagged && (
        <p className="t-caption mt-3 pl-7">
          <kbd className="rounded bg-ink/[0.06] px-1.5 py-px font-mono">a</kbd> approve ·{" "}
          <kbd className="rounded bg-ink/[0.06] px-1.5 py-px font-mono">v</kbd> veto
        </p>
      )}

      {action.status === "executed" && (
        <div className="mt-4 flex items-center justify-between gap-3 pl-7">
          <SignedCheck />
          <button
            onClick={() => setReceiptOpen(true)}
            className="t-caption transition-colors duration-fast hover:text-ink"
          >
            Receipt
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
