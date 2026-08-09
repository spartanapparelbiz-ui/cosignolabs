"use client";

import Link from "next/link";
import { Eyebrow, Lede } from "./ui";
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
  { value: 3, label: "levels of permission. every action lands in one of them first." },
  {
    value: 0,
    from: 24,
    label:
      "changes made without your say-so. reading, summarising and drafting go ahead on their own. nothing else does.",
  },
  {
    value: 100,
    suffix: "%",
    label: "of what happens leaves a receipt, including the things you turned down.",
  },
  { value: 1, label: "button that stops every job at once and clears what was waiting." },
];

export function Proof() {
  return (
    <section aria-labelledby="proof-title" className="bg-cream py-20 sm:py-32">
      <div className="mx-auto w-full max-w-6xl px-5">
        <header className="mx-auto max-w-3xl text-center">
          <Eyebrow>who this is for</Eyebrow>
          <MaskedLines
            as="h2"
            id="proof-title"
            lines={["built for teams already", "running ai at work."]}
            className="mt-4 text-balance font-display text-[clamp(1.9rem,5.2vw,3.75rem)] font-bold leading-[0.99] tracking-[-0.03em] text-ink"
          />
          <Lede className="mx-auto mt-5 max-w-xl">
            for teams whose ai already works, and who now have to answer for
            what it did.
          </Lede>
        </header>

        <Stagger className="mt-11 grid sm:mt-14 gap-4 sm:grid-cols-2 lg:grid-cols-4" step={0.09}>
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

        <Rise className="mx-auto mt-11 max-w-xl sm:mt-14 text-center">
          <p className="text-sm font-semibold leading-relaxed text-ink-soft">
            there are no customer quotes here yet. cosigno is onboarding its
            first teams, and a quote from someone who has not used it would be
            worth nothing to you.
          </p>
          <Link
            href="/sign-up"
            prefetch
            className="mt-4 inline-block text-sm font-bold lowercase text-ink underline decoration-signal decoration-2 underline-offset-4 transition-colors hover:text-signal"
          >
            be one of the first teams
          </Link>
        </Rise>
      </div>
    </section>
  );
}
