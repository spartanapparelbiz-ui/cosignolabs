"use client";

import Link from "next/link";
import { useRef } from "react";
import { motion, useTransform } from "framer-motion";
import { Eyebrow } from "./ui";
import {
  EASE_OUT,
  MaskedLines,
  useSectionPass,
  useSmoothed,
  useStillness,
} from "./primitives";

/**
 * What this actually is, in ten seconds.
 *
 * The page used to open the story with the world going wrong, which is a good
 * second beat and a poor first one: a reader who has not yet worked out what
 * the product *is* has nothing to hang the alarm on. Three sentences, in the
 * order the thing happens, before any of the argument starts.
 *
 * The three cards ride the scroll rather than a one-shot reveal — each rises
 * and settles on its own offset as the section crosses the window, so the
 * block assembles itself while you read it instead of snapping into place the
 * moment its top edge appears.
 */

const STEPS: { n: string; title: string; body: string }[] = [
  {
    n: "1",
    title: "tell it what you want done",
    body: "in a sentence, the way you would ask a person. “clear my inbox and answer the leads.”",
  },
  {
    n: "2",
    title: "it works inside your apps",
    body: "gmail, slack, drive, stripe, your own tools. it reads, sorts, drafts and prepares.",
  },
  {
    n: "3",
    title: "it asks before it does anything real",
    body: "sending, changing, spending. you see exactly what it wants to do, and you say yes or no.",
  },
];

export function Primer() {
  const ref = useRef<HTMLElement>(null);
  const still = useStillness();
  const pass = useSmoothed(useSectionPass(ref), 120, 26);

  return (
    <section
      ref={ref}
      aria-labelledby="primer-title"
      className="relative overflow-hidden bg-cream py-20 sm:py-28"
    >
      <div className="mx-auto w-full max-w-6xl px-5">
        <header className="mx-auto max-w-2xl text-center">
          <Eyebrow>in plain words</Eyebrow>
          <MaskedLines
            as="h2"
            id="primer-title"
            lines={["it does the work.", "you keep the say."]}
            className="mt-4 text-balance font-display text-[clamp(1.9rem,5.2vw,3.5rem)] font-bold leading-[1] tracking-[-0.03em] text-ink"
          />
        </header>

        <div className="mt-11 grid gap-4 sm:mt-14 md:grid-cols-3">
          {STEPS.map((s, i) => (
            <PrimerCard key={s.n} step={s} index={i} pass={pass} still={still} />
          ))}
        </div>

        <p className="mt-9 text-center text-[13px] font-medium text-ink-soft">
          that is the whole product.{" "}
          <Link
            href="/sign-up"
            prefetch
            className="font-bold text-ink underline decoration-signal decoration-2 underline-offset-4 transition-colors hover:text-signal"
          >
            try it free
          </Link>{" "}
          or{" "}
          <Link
            href="/demo"
            prefetch
            className="font-bold text-ink underline decoration-signal decoration-2 underline-offset-4 transition-colors hover:text-signal"
          >
            watch it run
          </Link>
          , no account needed for the second one.
        </p>
      </div>
    </section>
  );
}

/**
 * One card, on its own scroll offset. A component rather than a loop body
 * because each one owns real hooks — a transform per card, not a transform
 * conjured inside a map.
 */
function PrimerCard({
  step,
  index,
  pass,
  still,
}: {
  step: { n: string; title: string; body: string };
  index: number;
  pass: ReturnType<typeof useSmoothed>;
  still: boolean;
}) {
  // Each card lags the one before it, so the row deals itself out as the
  // section crosses the window. Transform only: nothing here can reflow.
  const start = 0.06 + index * 0.06;
  const y = useTransform(pass, [start, start + 0.3], [46, 0]);
  const opacity = useTransform(pass, [start, start + 0.22], [0, 1]);
  const scale = useTransform(pass, [start, start + 0.3], [0.965, 1]);

  return (
    <motion.div
      className="rounded-card bg-surface p-6 shadow-depth ring-1 ring-inset ring-line/60"
      style={still ? undefined : { y, opacity, scale }}
      transition={{ ease: EASE_OUT }}
    >
      <span
        aria-hidden="true"
        className="grid h-8 w-8 place-items-center rounded-pill bg-signal/15 font-display text-lg font-bold text-ink"
      >
        {step.n}
      </span>
      <h3 className="mt-4 text-[15px] font-extrabold lowercase leading-snug text-ink">
        {step.title}
      </h3>
      <p className="mt-2 text-pretty text-[13.5px] font-medium leading-relaxed text-ink-soft">
        {step.body}
      </p>
    </motion.div>
  );
}
