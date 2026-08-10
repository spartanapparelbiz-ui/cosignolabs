"use client";

import Link from "next/link";
import { EmptyIllustration, type EmptyKind } from "@/components/EmptyIllustration";

/**
 * An empty state that does a job.
 *
 * The rule: never report an absence and stop. "No missions running" is a fact
 * the reader already had — they are looking at the empty list. What they don't
 * have is the next move, so every empty state here carries one, and it is a
 * real one: a button that fills the ask box, a link to the apps that would put
 * something here. An empty state without an action is a dead end with a
 * picture on it.
 *
 * The illustration breathes very slightly (the same 5s cadence as the mark),
 * which is enough to keep a blank panel from reading as a broken one, and
 * stops entirely under prefers-reduced-motion.
 */

export interface EmptyStateAction {
  label: string;
  href?: string;
  /** Fills the ask box with this text rather than starting anything. */
  compose?: string;
  onClick?: () => void;
}

export function EmptyState({
  kind = "workspace",
  title,
  body,
  actions = [],
  compact = false,
}: {
  kind?: EmptyKind;
  title: string;
  body?: string;
  actions?: EmptyStateAction[];
  /** Drops the illustration for a state embedded in a small panel. */
  compact?: boolean;
}) {
  function fire(a: EmptyStateAction) {
    if (a.compose) {
      window.dispatchEvent(new CustomEvent("cosigno:compose", { detail: { text: a.compose } }));
    }
    a.onClick?.();
  }

  return (
    <div
      className={`flex flex-col items-center gap-3 rounded-card bg-surface/50 text-center ring-1 ring-inset ring-line/50 ${
        compact ? "px-5 py-7" : "px-6 py-12"
      }`}
    >
      {!compact && (
        <span className="animate-logo-breath motion-reduce:animate-none" aria-hidden="true">
          <EmptyIllustration kind={kind} className="opacity-90" />
        </span>
      )}
      <p className="text-sm font-extrabold">{title}</p>
      {body && <p className="max-w-sm text-pretty text-xs leading-relaxed text-ink-soft">{body}</p>}
      {actions.length > 0 && (
        <div className="mt-1 flex flex-wrap items-center justify-center gap-2">
          {actions.map((a, i) =>
            a.href ? (
              <Link
                key={a.label}
                href={a.href}
                prefetch
                className={`rounded-btn px-4 py-2 text-xs font-extrabold transition-transform duration-fast active:scale-95 ${
                  i === 0
                    ? "bg-signal text-on-signal shadow-soft hover:-translate-y-px"
                    : "text-ink ring-1 ring-inset ring-ink/25 hover:bg-cream-deep"
                }`}
              >
                {a.label}
              </Link>
            ) : (
              <button
                key={a.label}
                onClick={() => fire(a)}
                className={`rounded-btn px-4 py-2 text-xs font-extrabold transition-transform duration-fast active:scale-95 ${
                  i === 0
                    ? "bg-signal text-on-signal shadow-soft hover:-translate-y-px"
                    : "text-ink ring-1 ring-inset ring-ink/25 hover:bg-cream-deep"
                }`}
              >
                {a.label}
              </button>
            )
          )}
        </div>
      )}
    </div>
  );
}
