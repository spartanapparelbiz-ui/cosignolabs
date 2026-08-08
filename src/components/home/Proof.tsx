"use client";

import Link from "next/link";
import { CosignoMark } from "@/components/brand/Logo";
import { Counter, MaskedLines, Rise, Stagger, StaggerItem } from "./primitives";

/**
 * Proof, without borrowed credibility.
 *
 * There are no customer logos here, because we have not earned the right to
 * show any, and there are no invented numbers. What counts up instead are
 * structural facts about the product — things you can check in the app in
 * about a minute — and three quote slots that say plainly what they are.
 */

const FACTS: { value: number; from?: number; suffix?: string; label: string }[] = [
  {
    value: 3,
    label: "tiers of authority. every action lands in one of them before it runs.",
  },
  {
    value: 0,
    from: 24,
    label:
      "changes outside cosigno that happen without your signature. reading, summarising and drafting clear on their own; nothing else does.",
  },
  {
    value: 100,
    suffix: "%",
    label:
      "of proposals, approvals, vetoes and executions written to the audit trail with the payload they carried.",
  },
  {
    value: 1,
    label: "control that halts every running mission and clears the queue.",
  },
];

export function Proof() {
  return (
    <section aria-labelledby="proof-title" className="bg-cream py-24 sm:py-32">
      <div className="mx-auto w-full max-w-6xl px-4">
        <header className="mx-auto max-w-3xl text-center">
          <p className="text-[11px] font-extrabold uppercase tracking-[0.22em] text-ink-soft">
            who this is for
          </p>
          <MaskedLines
            as="h2"
            id="proof-title"
            lines={["built for teams shipping", "ai into production."]}
            className="mt-4 font-display text-[clamp(1.9rem,5.2vw,3.75rem)] font-bold leading-[0.99] tracking-[-0.03em] text-ink"
          />
          <p className="mx-auto mt-5 max-w-xl text-sm font-semibold leading-relaxed text-ink-soft sm:text-base">
            the teams who need this are the ones whose agent already works — and
            who now have to answer for what it did.
          </p>
        </header>

        <Stagger className="mt-14 grid gap-4 sm:grid-cols-2 lg:grid-cols-4" step={0.09}>
          {FACTS.map((f) => (
            <StaggerItem
              key={f.label}
              className="rounded-card bg-surface p-5 shadow-soft"
            >
              <p className="font-display text-5xl font-bold tabular-nums leading-none tracking-tight text-ink">
                <Counter to={f.value} from={f.from ?? 0} />
                {f.suffix}
              </p>
              <p className="mt-3 text-[12px] font-semibold leading-relaxed text-ink-soft">
                {f.label}
              </p>
            </StaggerItem>
          ))}
        </Stagger>

        {/* ------------------------------------------------- the empty seats */}
        <Rise className="mt-16">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <h3 className="font-display text-xl font-bold tracking-tight text-ink sm:text-2xl">
              what people say
            </h3>
            <p className="text-[11px] font-semibold lowercase text-ink-soft">
              we don&apos;t publish testimonials we haven&apos;t earned yet.
            </p>
          </div>
        </Rise>

        <Stagger className="mt-5 grid gap-4 md:grid-cols-3" step={0.08}>
          {["reserved", "reserved", "reserved"].map((_, i) => (
            <StaggerItem
              key={i}
              className="flex min-h-[11rem] flex-col justify-between rounded-card bg-cream-deep/50 p-5 shadow-well"
            >
              <p className="font-display text-lg font-bold leading-snug tracking-tight text-ink-soft">
                &ldquo;&nbsp;&rdquo;
              </p>
              <div className="flex items-center gap-2.5">
                <span className="opacity-40">
                  <CosignoMark size={20} mono />
                </span>
                <span className="text-[11px] font-bold lowercase text-ink-soft">
                  reserved for the founding cohort
                </span>
              </div>
            </StaggerItem>
          ))}
        </Stagger>

        <Rise className="mt-6 text-center">
          <Link
            href="/sign-up"
            prefetch
            className="text-sm font-bold lowercase text-ink underline decoration-signal decoration-2 underline-offset-4 transition-colors hover:text-signal"
          >
            take one of the seats →
          </Link>
        </Rise>
      </div>
    </section>
  );
}
