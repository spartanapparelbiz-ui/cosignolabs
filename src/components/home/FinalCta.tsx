"use client";

import Link from "next/link";
import { useRef } from "react";
import { motion, useTransform } from "framer-motion";
import { LOGO_C_PATH, LOGO_CHECK_PATH, LOGO_VIEWBOX } from "@/components/brand/Logo";
import { MaskedLines, useSectionProgress, useSmoothed, useStillness } from "./primitives";

/**
 * The last screen: one sentence, one button, and a lot of nothing.
 *
 * The only movement is the mark drifting behind the type — an oversized,
 * barely-there version of the logo, parallaxed against the scroll. It is one
 * transform on one SVG, so the quietest section on the page is also the
 * cheapest.
 */
export function FinalCta() {
  const ref = useRef<HTMLElement>(null);
  const still = useStillness();
  const raw = useSectionProgress(ref);
  const p = useSmoothed(raw, 120, 30);

  // Centring is part of the animated transform (Framer writes `transform`
  // inline, so a utility translate on the same node would be thrown away).
  const markY = useTransform(p, [0, 1], ["-38%", "-62%"]);
  const markScale = useTransform(p, [0, 1], [1, 1.12]);
  const markRotate = useTransform(p, [0, 1], [-6, 4]);

  return (
    <section
      ref={ref}
      aria-labelledby="cta-title"
      className="relative flex min-h-[92dvh] items-center overflow-hidden bg-cream"
    >
      <motion.div
        aria-hidden="true"
        className="pointer-events-none absolute left-1/2 top-1/2 w-[min(96vw,820px)] opacity-[0.055]"
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

      <div className="relative mx-auto w-full max-w-4xl px-5 py-28 text-center">
        <MaskedLines
          as="h2"
          id="cta-title"
          lines={["nothing happens", "until you say so."]}
          className="font-display text-[clamp(2.4rem,8.4vw,6.5rem)] font-bold leading-[0.94] tracking-[-0.035em] text-ink"
        />

        <div className="mt-12">
          <Link
            href="/sign-up"
            prefetch
            className="inline-block rounded-btn bg-signal px-9 py-4 text-base font-extrabold lowercase text-ink shadow-lift transition-transform duration-fast ease-brand-out hover:-translate-y-0.5 hover:scale-[1.02] active:scale-95"
          >
            start free
          </Link>
        </div>

        <p className="mt-6 text-[11px] font-semibold lowercase text-ink-soft">
          no card to start · take a tool back whenever you like
        </p>
      </div>
    </section>
  );
}
