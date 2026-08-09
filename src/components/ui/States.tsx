"use client";

import { AlertTriangle, RotateCw } from "lucide-react";
import { Button, ButtonLink } from "@/components/ui/Button";
import { SignatureStack } from "@/components/motion/Depth";
import { SkeletonBlock } from "@/components/Skeleton";

/**
 * THE THREE STATES EVERY SURFACE HAS AND NOBODY DESIGNS.
 *
 * Empty, loading, and broken are where a product either explains itself or
 * abandons the person. Before this file, each surface improvised: some said
 * "Loading…", some showed a bare "no missions yet.", and a failed fetch could
 * put a raw message on screen with no way forward. Three shapes now, used
 * everywhere, each answering the question the user actually has.
 */

/* ------------------------------------------------------------------ empty */

/**
 * An empty surface should teach without becoming a tutorial: say what this
 * place is for, then show the one thing to do next. "No missions yet" reports
 * an absence; "Your workspace is clear" describes a state and hands over the
 * next move.
 */
export function EmptyState({
  headline,
  body,
  action,
  children,
  art = true,
}: {
  headline: string;
  body?: string;
  /** The single next move. More than one and it stops being obvious. */
  action?: { label: string; href?: string; onClick?: () => void };
  /** Extra content under the action — examples, usually. */
  children?: React.ReactNode;
  art?: boolean;
}) {
  return (
    <div className="flex flex-col items-center rounded-card border border-line/60 bg-surface/50 px-6 py-12 text-center shadow-soft">
      {art && <SignatureStack size={120} className="mb-2" />}
      <h2 className="font-display text-lg font-bold">{headline}</h2>
      {body && <p className="mt-1.5 max-w-sm text-sm font-semibold text-ink-soft">{body}</p>}
      {action &&
        (action.href ? (
          <ButtonLink href={action.href} className="mt-5">
            {action.label}
          </ButtonLink>
        ) : (
          <Button onClick={action.onClick} className="mt-5">
            {action.label}
          </Button>
        ))}
      {children && <div className="mt-6 w-full">{children}</div>}
    </div>
  );
}

/* ------------------------------------------------------------------ error */

/**
 * An error is a story with three beats, and the user needs all three:
 * what happened, what cosigno was trying to do, and what happens next. A bare
 * message gives them the first and leaves them stuck.
 *
 * `technical` is for the rare case where a developer genuinely needs the
 * underlying text. It stays folded away — a stack trace shown to a founder is
 * noise that makes a recoverable problem feel like a broken product.
 */
export function ErrorState({
  what,
  tried,
  next,
  retry,
  action,
  technical,
  compact = false,
}: {
  /** Plain sentence: "cosigno couldn't reach your calendar." */
  what: string;
  /** Brief context: "It was checking tomorrow's schedule." */
  tried?: string;
  /** The recovery, in words: "Reconnecting takes about ten seconds." */
  next?: string;
  retry?: () => void;
  action?: { label: string; href: string };
  technical?: string;
  compact?: boolean;
}) {
  return (
    <div
      role="alert"
      className={`rounded-card border border-line/70 bg-surface shadow-soft ${compact ? "p-4" : "p-6"}`}
    >
      <div className="flex items-start gap-3">
        <span
          className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-btn bg-signal/15 text-signal"
          aria-hidden="true"
        >
          <AlertTriangle size={15} strokeWidth={2.6} />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-extrabold leading-snug">{what}</p>
          {tried && <p className="mt-1 text-xs font-semibold text-ink-soft">{tried}</p>}
          {next && <p className="mt-1.5 text-xs font-semibold">{next}</p>}

          {(retry || action) && (
            <div className="mt-3 flex flex-wrap gap-2">
              {retry && (
                <Button tone="ghost" size="sm" onClick={retry} icon={<RotateCw size={13} aria-hidden="true" />}>
                  Try again
                </Button>
              )}
              {action && (
                <ButtonLink href={action.href} size="sm">
                  {action.label}
                </ButtonLink>
              )}
            </div>
          )}

          {technical && (
            <details className="mt-3">
              <summary className="cursor-pointer text-[11px] font-bold text-ink-soft underline underline-offset-2">
                Technical details
              </summary>
              <pre className="mt-1.5 overflow-x-auto whitespace-pre-wrap break-words rounded-btn bg-cream-deep p-2 font-mono text-[10px] text-ink-soft">
                {technical}
              </pre>
            </details>
          )}
        </div>
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------- loading */

/**
 * A loading state should name the operation, because "Loading…" is the same
 * word for "this will take 200ms" and "this is stuck". The label is required
 * for that reason — there is no default, so nobody can accidentally ship the
 * generic one.
 *
 * The skeleton keeps the layout it is standing in for, so the page doesn't
 * jump when content lands.
 */
export function LoadingState({
  label,
  rows = 3,
}: {
  /** What is actually happening: "Gathering your missions". */
  label: string;
  rows?: number;
}) {
  return (
    <div aria-busy="true" aria-live="polite" className="flex flex-col gap-2.5">
      <p className="flex items-center gap-2 text-xs font-bold text-ink-soft">
        <span className="h-1.5 w-1.5 animate-orb-pulse rounded-pill bg-signal" aria-hidden="true" />
        {label}
      </p>
      {Array.from({ length: rows }).map((_, i) => (
        <SkeletonBlock key={i} className="h-16 w-full" />
      ))}
    </div>
  );
}
