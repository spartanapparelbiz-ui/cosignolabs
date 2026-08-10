"use client";

import Link from "next/link";
import {
  ArrowRight,
  Check,
  CircleAlert,
  PauseCircle,
  Plug,
  TrendingUp,
} from "lucide-react";
import type { BriefingLine, BriefingTone } from "@/lib/home/briefing";
import { staggerDelay, STAGGER_MS } from "@/lib/motion";

/**
 * The briefing — what happened while you were away, and what it costs to keep
 * waiting.
 *
 * The design problem: a list of five facts is a list, and a list is scanned
 * rather than read. So the lines are typographically ranked by what they cost
 * to miss — the blocking one gets ink weight and the orange marker, everything
 * else recedes to the secondary — and each carries its own way out, because a
 * briefing that tells you something is waiting and then makes you go find it
 * has spent your attention without saving you anything.
 *
 * The headline sits above at display size. It is the one line you could read
 * from across the room, and it is deliberately not a summary of the other
 * five: a headline holding four facts holds none.
 */

const TONE: Record<
  BriefingTone,
  { Icon: typeof Check; className: string; loud: boolean }
> = {
  attention: { Icon: CircleAlert, className: "text-signal", loud: true },
  degraded: { Icon: Plug, className: "text-signal", loud: true },
  progress: { Icon: TrendingUp, className: "text-ink-soft", loud: false },
  done: { Icon: Check, className: "text-signal", loud: false },
  idle: { Icon: PauseCircle, className: "text-ink-soft", loud: false },
};

export function Briefing({
  greeting,
  headline,
  lines,
}: {
  greeting: string;
  headline: string;
  lines: BriefingLine[];
}) {
  // Nothing to report. A briefing with no lines under it is a headline
  // floating in space, and "Nothing needs you this morning" is a poor first
  // impression for someone who has never seen the product — so a quiet
  // workspace gets the positioning line back, with the calm statement
  // demoted to the subline where it belongs.
  if (lines.length === 0) {
    return (
      <div className="animate-blur-in">
        <p className="text-xs font-bold lowercase tracking-wide text-ink-soft">{greeting}</p>
        <h1 className="mt-1.5 text-balance font-display text-display-lg font-bold">
          your approval-first AI operator.
        </h1>
        <p className="mx-auto mt-3 max-w-md text-pretty text-sm font-semibold leading-relaxed text-ink-soft">
          {headline} connect apps, delegate work, approve actions — stay in control.
        </p>
      </div>
    );
  }

  return (
    <div className="animate-blur-in">
      <p className="text-xs font-bold lowercase tracking-wide text-ink-soft">{greeting}</p>
      {/* The one line you could read from across the room — full display
          scale on desktop, a step down on phones so it never wraps past two
          lines. */}
      <h1 className="mt-1.5 text-balance font-display text-display-lg font-bold sm:text-display-xl">
        {headline}
      </h1>

      {/* The editorial rule between the headline and its lines — a hairline
          with the brand's i-dot at its centre. It marks where the verdict
          ends and the evidence begins. */}
      <span className="mx-auto mt-5 flex w-24 items-center gap-2" aria-hidden="true">
        <span className="h-px flex-1 bg-line" />
        <span className="h-1 w-1 rounded-pill bg-signal" />
        <span className="h-px flex-1 bg-line" />
      </span>

      {lines.length > 0 && (
        <ul className="mx-auto mt-4 flex max-w-xl flex-col gap-0.5">
          {lines.map((line, i) => {
            const tone = TONE[line.tone];
            const body = (
              <>
                <tone.Icon
                  size={14}
                  strokeWidth={2.5}
                  className={`mt-px shrink-0 ${tone.className}`}
                  aria-hidden="true"
                />
                <span
                  className={`min-w-0 flex-1 text-pretty text-left text-[13px] leading-snug ${
                    tone.loud ? "font-bold text-ink" : "font-semibold text-ink-soft"
                  }`}
                >
                  {line.text}
                </span>
                {line.action && (
                  <span className="inline-flex shrink-0 items-center gap-1 whitespace-nowrap text-[11px] font-extrabold text-ink-soft transition-colors duration-fast group-hover:text-signal">
                    {line.action.label}
                    <ArrowRight
                      size={11}
                      className="transition-transform duration-fast group-hover:translate-x-0.5"
                      aria-hidden="true"
                    />
                  </span>
                )}
              </>
            );

            const className =
              "group flex w-full items-start gap-2.5 rounded-btn px-2.5 py-2 transition-colors duration-fast hover:bg-cream-deep/50";

            return (
              <li
                key={line.key}
                style={staggerDelay(i, STAGGER_MS.rows)}
                className="animate-feed-in"
              >
                {line.action?.href ? (
                  <Link href={line.action.href} prefetch className={className}>
                    {body}
                  </Link>
                ) : line.action?.compose ? (
                  <button
                    onClick={() =>
                      window.dispatchEvent(
                        new CustomEvent("cosigno:compose", {
                          detail: { text: line.action!.compose },
                        })
                      )
                    }
                    className={className}
                  >
                    {body}
                  </button>
                ) : (
                  <div className={className}>{body}</div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
