"use client";

import Link from "next/link";
import { useRef } from "react";
import { motion, useInView, useTransform } from "framer-motion";
import { CosignoMark, LOGO_C_PATH, LOGO_CHECK_PATH, LOGO_VIEWBOX } from "@/components/brand/Logo";
import { Chip, DrawnCheck, PayloadWell } from "./ui";
import { EASE_SPRING, MaskedLines, useSectionProgress, useSmoothed, useStillness } from "./primitives";

/**
 * The close.
 *
 * The whole page has been about one object: a card that states exactly what
 * is about to happen and then waits for you. So the conversion moment is that
 * object one last time, with the roles swapped — this is the card cosigno is
 * holding out, and the thing waiting on a signature is your account.
 *
 * That shape does the conversion work on its own: the payload well is
 * literally "what happens after you click", in the same place the reader has
 * spent the last ten screens learning to look. Two exits, and the cheaper one
 * costs nothing: /demo needs no account at all.
 *
 * Every number and claim here is either derived from the plans source of
 * truth (passed in from the server) or checked against the sign-up flow and
 * the connector scopes — no aspirational onboarding.
 */

const STEPS: [string, string][] = [
  ["01", "create your account — email and a password, or continue with google"],
  ["02", "connect one tool — it asks for the narrowest access that does the job"],
  ["03", "give it a job — it stops at the first card and waits for you"],
];

export function FinalCta({ terms }: { terms: string }) {
  const ref = useRef<HTMLElement>(null);
  const cardRef = useRef<HTMLDivElement>(null);
  const still = useStillness();
  const raw = useSectionProgress(ref);
  const p = useSmoothed(raw, 120, 30);
  const seen = useInView(cardRef, { once: true, margin: "0px 0px -20% 0px" });

  // Centring is part of the animated transform: Framer writes `transform`
  // inline, so a utility translate on the same node would be discarded.
  const markY = useTransform(p, [0, 1], ["-42%", "-58%"]);
  const markScale = useTransform(p, [0, 1], [1, 1.1]);
  const markRotate = useTransform(p, [0, 1], [-5, 3]);

  return (
    <section
      ref={ref}
      aria-labelledby="cta-title"
      className="relative flex min-h-[100dvh] items-center overflow-hidden bg-cream"
    >
      <motion.div
        aria-hidden="true"
        className="pointer-events-none absolute left-1/2 top-1/2 w-[min(96vw,760px)] opacity-[0.05]"
        style={
          still
            ? { transform: "translate(-50%, -50%)" }
            : { x: "-50%", y: markY, scale: markScale, rotate: markRotate }
        }
      >
        <svg viewBox={LOGO_VIEWBOX} fill="none" className="w-full">
          <path d={LOGO_C_PATH} fill="var(--logo-c)" />
          <path d={LOGO_CHECK_PATH} fill="var(--logo-check)" />
        </svg>
      </motion.div>

      <div className="relative mx-auto w-full max-w-5xl px-5 py-20 sm:py-24">
        <MaskedLines
          as="h2"
          id="cta-title"
          lines={["nothing happens", "until you say so."]}
          className="text-center font-display text-[clamp(2.3rem,7.2vw,5.25rem)] font-bold leading-[0.94] tracking-[-0.035em] text-ink"
        />

        <p className="mx-auto mt-6 max-w-sm text-center font-mono text-[11px] tracking-[0.04em] text-ink-soft">
          so here is the last card on the page. this one is yours.
        </p>

        {/* --------------------------------------------------- the last card */}
        <motion.div
          ref={cardRef}
          className="mx-auto mt-9 w-full max-w-[34rem]"
          initial={false}
          animate={
            seen || still ? { opacity: 1, y: 0, scale: 1 } : { opacity: 0, y: 24, scale: 0.975 }
          }
          transition={{ duration: 0.66, ease: EASE_SPRING }}
        >
          <div className="rounded-card bg-surface p-6 shadow-depth-lift sm:p-8">
            <div className="flex items-start justify-between gap-3">
              <span className="inline-flex items-center gap-2 text-[11px] font-extrabold lowercase text-ink-soft">
                <CosignoMark size={16} />
                cosigno wants to
              </span>
              <Chip tone="signal">about two minutes</Chip>
            </div>

            <p className="mt-3 font-display text-2xl font-bold leading-tight tracking-tight text-ink sm:text-3xl">
              hand you the operator.
            </p>
            <p className="mt-1.5 text-[12px] font-semibold lowercase text-ink-soft">{terms}</p>

            <PayloadWell className="mt-5">
              <span className="mb-1.5 block text-ink">what happens after you click</span>
              {STEPS.map(([n, text]) => (
                <span key={n} className="mt-1 flex gap-2.5">
                  <span className="shrink-0 text-ink">{n}</span>
                  <span>{text}</span>
                </span>
              ))}
            </PayloadWell>

            <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-center">
              <Link
                href="/sign-up"
                prefetch
                className="group inline-flex items-center justify-center gap-2 rounded-btn bg-signal px-7 py-3.5 text-base font-extrabold lowercase text-ink shadow-lift transition-transform duration-fast ease-brand-out hover:-translate-y-0.5 hover:scale-[1.02] active:scale-95"
              >
                <span className="transition-transform duration-base ease-brand-out group-hover:scale-110">
                  <DrawnCheck size={17} drawn={seen || still} />
                </span>
                start free
              </Link>
              <Link
                href="/demo"
                prefetch
                className="inline-flex items-center justify-center rounded-btn px-5 py-3.5 text-base font-bold lowercase text-ink ring-1 ring-inset ring-ink transition-colors duration-fast hover:bg-cream-deep"
              >
                watch it run first
              </Link>
            </div>

            <p className="mt-4 text-[11px] font-semibold lowercase leading-relaxed text-ink-soft">
              the free plan never asks for a card. the demo needs no account at
              all — it runs in your browser against simulated tools.
            </p>
          </div>
        </motion.div>

        <p className="mt-7 text-center text-[12px] font-semibold lowercase text-ink-soft">
          already have an account?{" "}
          <Link
            href="/sign-in"
            prefetch
            className="font-bold text-ink underline decoration-signal decoration-2 underline-offset-4 transition-colors hover:text-signal"
          >
            sign in
          </Link>
        </p>
      </div>
    </section>
  );
}
