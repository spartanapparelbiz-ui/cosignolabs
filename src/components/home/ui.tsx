import type { ReactNode } from "react";
import { Check, Lock, PenLine, Zap } from "lucide-react";
import { CosignoMark } from "@/components/brand/Logo";

/**
 * The live product surfaces used across the home page.
 *
 * There are no screenshots on this page. Every card, step, well and receipt
 * below is the real thing built from real tokens — so the marketing page and
 * the product can never drift apart, and nothing here is a picture of a
 * feature that doesn't exist.
 *
 * Palette discipline (BRAND.md): signal orange means approval, success, focus
 * or the mark — nothing else. There is no red and no green. A destructive or
 * refused action wears an ink outline and the hazard texture, never a colour.
 */

/* ------------------------------------------------------------------ chips */

export type Tier = "auto" | "sign" | "locked";

const TIER_COPY: Record<Tier, { label: string; Icon: typeof Zap }> = {
  auto: { label: "runs on its own", Icon: Zap },
  sign: { label: "needs your signature", Icon: PenLine },
  locked: { label: "locked, needs typed confirmation", Icon: Lock },
};

export function TierChip({ tier, className = "" }: { tier: Tier; className?: string }) {
  const { label, Icon } = TIER_COPY[tier];
  const skin =
    tier === "locked"
      ? "tier3-texture ring-1 ring-inset ring-ink/70 text-ink"
      : tier === "sign"
        ? "ring-1 ring-inset ring-ink/25 text-ink"
        : "ring-1 ring-inset ring-line text-ink-soft";
  return (
    <span
      className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-pill px-2.5 py-1 text-[11px] font-bold lowercase ${skin} ${className}`}
    >
      <Icon size={12} strokeWidth={2.6} aria-hidden="true" />
      {label}
    </span>
  );
}

export function Chip({
  children,
  tone = "muted",
  className = "",
}: {
  children: ReactNode;
  tone?: "muted" | "ink" | "signal" | "hazard";
  className?: string;
}) {
  const skin = {
    muted: "ring-1 ring-inset ring-line text-ink-soft",
    ink: "ring-1 ring-inset ring-ink/25 text-ink",
    signal: "bg-signal/12 text-ink ring-1 ring-inset ring-signal/40",
    hazard: "tier3-texture ring-1 ring-inset ring-ink/60 text-ink",
  }[tone];
  return (
    <span
      className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-pill px-2.5 py-1 text-[11px] font-bold lowercase ${skin} ${className}`}
    >
      {children}
    </span>
  );
}

/* ------------------------------------------------------------- primitives */

/** The recessed block that shows an action's exact payload, in mono. */
export function PayloadWell({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`rounded-btn bg-cream-deep/80 px-3 py-2.5 font-mono text-[11px] leading-relaxed text-ink-soft shadow-well ${className}`}
    >
      {children}
    </div>
  );
}

/** The signature check, drawn rather than stamped. `drawn` triggers the stroke. */
export function DrawnCheck({
  size = 18,
  drawn = true,
  className = "",
}: {
  size?: number;
  drawn?: boolean;
  className?: string;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
      className={className}
    >
      <path
        d="M4.5 12.5 10 18 20 6.5"
        stroke="currentColor"
        strokeWidth={3.2}
        strokeLinecap="round"
        strokeLinejoin="round"
        pathLength={1}
        strokeDasharray={1}
        strokeDashoffset={drawn ? 0 : 1}
        style={{ transition: "stroke-dashoffset 360ms cubic-bezier(0.22,1,0.36,1)" }}
      />
    </svg>
  );
}

/** Thin progress rail. Fill is the sanctioned signal use. */
export function ProgressRail({
  value,
  className = "",
}: {
  /** 0 – 1 */
  value: number;
  className?: string;
}) {
  return (
    <div className={`h-1 w-full overflow-hidden rounded-pill bg-cream-deep ${className}`}>
      <div
        className="h-full origin-left rounded-pill bg-signal"
        style={{ transform: `scaleX(${Math.max(0, Math.min(1, value))})`, width: "100%" }}
      />
    </div>
  );
}

/* ----------------------------------------------------------- action cards */

export interface ActionSpec {
  id: string;
  /** what cosigno proposes to do, in plain language */
  title: string;
  /** which app, and the scope it touches */
  meta: string;
  tier: Tier;
  /** the exact payload, shown before anyone signs anything */
  payload: ReactNode;
}

/**
 * The action card — the object the entire product is arranged around. It
 * states the action, names the app, shows the exact payload, and offers the
 * only two answers there are.
 */
export function ActionCard({
  action,
  state = "pending",
  compact = false,
  className = "",
  onApprove,
  onVeto,
  approveLabel = "approve",
  interactive = true,
  footer,
}: {
  action: ActionSpec;
  state?: "pending" | "signed" | "vetoed";
  compact?: boolean;
  className?: string;
  onApprove?: () => void;
  onVeto?: () => void;
  approveLabel?: string;
  interactive?: boolean;
  footer?: ReactNode;
}) {
  const signed = state === "signed";
  const vetoed = state === "vetoed";
  return (
    <article
      className={`rounded-card bg-surface p-4 shadow-depth ${className}`}
      aria-label={action.title}
    >
      <div className="flex items-start justify-between gap-3">
        <span className="inline-flex items-center gap-2 text-[11px] font-extrabold lowercase text-ink-soft">
          <CosignoMark size={15} />
          cosigno wants to
        </span>
        <TierChip tier={action.tier} />
      </div>

      {/* Not a heading: the card is an <article> with an accessible name, and
          scattering h3s through a page of scenes wrecks the document outline. */}
      <p
        className={`mt-2 font-bold lowercase leading-snug text-ink ${
          compact ? "text-sm" : "text-base sm:text-lg"
        }`}
      >
        {action.title}
      </p>
      <p className="mt-1 text-[11px] font-semibold lowercase text-ink-soft">{action.meta}</p>

      {!compact && <PayloadWell className="mt-3">{action.payload}</PayloadWell>}

      <div className="mt-3.5 flex items-center gap-2">
        {signed ? (
          <span className="inline-flex items-center gap-2 rounded-btn bg-signal/12 px-3 py-2 text-sm font-extrabold lowercase text-ink ring-1 ring-inset ring-signal/40">
            <span className="text-signal">
              <DrawnCheck size={16} />
            </span>
            signed &amp; executed
          </span>
        ) : vetoed ? (
          <span className="inline-flex items-center gap-2 rounded-btn px-3 py-2 text-sm font-extrabold lowercase text-ink ring-1 ring-inset ring-ink">
            vetoed, nothing ran
          </span>
        ) : (
          <>
            <button
              type="button"
              onClick={onApprove}
              tabIndex={interactive ? 0 : -1}
              aria-hidden={!interactive}
              className="inline-flex items-center gap-2 rounded-btn bg-signal px-4 py-2 text-sm font-extrabold lowercase text-ink shadow-soft transition-transform duration-fast ease-brand-out hover:-translate-y-px hover:scale-[1.02] active:scale-95"
            >
              <DrawnCheck size={15} />
              {approveLabel}
            </button>
            <button
              type="button"
              onClick={onVeto}
              tabIndex={interactive ? 0 : -1}
              aria-hidden={!interactive}
              className="rounded-btn px-3.5 py-2 text-sm font-bold lowercase text-ink ring-1 ring-inset ring-ink transition-colors duration-fast hover:bg-cream-deep"
            >
              veto
            </button>
          </>
        )}
        {footer}
      </div>
    </article>
  );
}

/* -------------------------------------------------------------- mission ui */

export type StepState = "done" | "running" | "waiting" | "queued";

export function StepRow({
  index,
  label,
  state,
  className = "",
}: {
  index: number;
  label: string;
  state: StepState;
  className?: string;
}) {
  return (
    <li className={`flex items-center gap-3 py-1.5 ${className}`}>
      <span
        className={`grid h-5 w-5 shrink-0 place-items-center rounded-pill text-[10px] font-extrabold ${
          state === "done"
            ? "bg-signal/15 text-signal"
            : state === "waiting"
              ? "ring-1 ring-inset ring-ink text-ink"
              : "bg-cream-deep text-ink-soft"
        }`}
        aria-hidden="true"
      >
        {state === "done" ? <Check size={12} strokeWidth={3.2} /> : index}
      </span>
      <span
        className={`text-[13px] lowercase transition-colors duration-base ${
          state === "running" || state === "waiting"
            ? "font-extrabold text-ink"
            : "font-semibold text-ink-soft"
        }`}
      >
        {label}
      </span>
      {state === "waiting" && (
        <span className="ml-auto text-[10px] font-extrabold lowercase text-ink">
          waiting for you
        </span>
      )}
      {state === "running" && (
        <span className="ml-auto flex items-center gap-1" aria-hidden="true">
          {[0, 1, 2].map((i) => (
            <span
              key={i}
              className="h-1 w-1 animate-shimmer rounded-pill bg-ink-soft"
              style={{ animationDelay: `${i * 180}ms` }}
            />
          ))}
        </span>
      )}
    </li>
  );
}

/**
 * Product window chrome — a titled surface that frames a live scene without
 * pretending to be a browser screenshot.
 */
export function Panel({
  title,
  status,
  children,
  className = "",
  bodyClassName = "",
}: {
  title: ReactNode;
  status?: ReactNode;
  children: ReactNode;
  className?: string;
  bodyClassName?: string;
}) {
  return (
    <div className={`overflow-hidden rounded-card bg-surface shadow-depth-lift ${className}`}>
      <div className="flex items-center justify-between gap-3 border-b border-line/50 px-4 py-3">
        <span className="inline-flex min-w-0 items-center gap-2 text-[12px] font-extrabold lowercase text-ink">
          <CosignoMark size={16} />
          <span className="truncate">{title}</span>
        </span>
        {status}
      </div>
      <div className={`p-4 ${bodyClassName}`}>{children}</div>
    </div>
  );
}

/** The audit line every executed action leaves behind. */
export function ReceiptLine({
  id,
  what,
  className = "",
}: {
  id: string;
  what: string;
  className?: string;
}) {
  return (
    <p
      className={`font-mono text-[10.5px] leading-relaxed text-ink-soft ${className}`}
    >
      <span className="mr-1 inline-block translate-y-[2px] text-signal">
        <DrawnCheck size={11} />
      </span>
      <span className="text-ink">{id}</span> {what}
    </p>
  );
}
