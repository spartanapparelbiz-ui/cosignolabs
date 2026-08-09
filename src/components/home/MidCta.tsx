"use client";

import Link from "next/link";
import { useRef } from "react";
import { motion, useTransform } from "framer-motion";
import { DrawnCheck } from "./ui";
import { Mark3D } from "./Mark3D";
import { MaskedLines, useSectionPass, useSmoothed, useStillness } from "./primitives";

/**
 * The offer, halfway down.
 *
 * The close at the bottom is the right ending, and it is also fifteen screens
 * from the top. A reader who is convinced by the approval scene should not
 * have to scroll past four more arguments to act on it, so the same two exits
 * appear here, at the point in the story where the case has just been made.
 *
 * The mark behind it seals as the band crosses the window — the check flying
 * home is the section's whole argument, so it is worth saying twice.
 */
export function MidCta({ terms }: { terms: string }) {
  const ref = useRef<HTMLElement>(null);
  const still = useStillness();
  const pass = useSmoothed(useSectionPass(ref), 120, 26);
  // 0 while the band is arriving, 1 once it is centred: the check flies in as
  // you reach it, rather than on a timer nobody is watching.
  const seal = useTransform(pass, [0.28, 0.55], [0, 1]);
  const lift = useTransform(pass, [0, 0.6], [40, 0]);

  return (
    <section
      ref={ref}
      aria-labelledby="midcta-title"
      className="relative overflow-hidden bg-cream-deep py-20 sm:py-28"
    >
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 hidden opacity-[0.09] sm:block"
      >
        <Mark3D
          progress={pass}
          seal={seal}
          still={still}
          mode="ambient"
          decorative
          className="h-full w-full"
        />
      </div>

      <motion.div
        className="relative mx-auto w-full max-w-3xl px-5 text-center"
        style={still ? undefined : { y: lift }}
      >
        <MaskedLines
          as="h2"
          id="midcta-title"
          lines={["ready to hand something over?"]}
          className="text-balance font-display text-[clamp(1.8rem,4.6vw,3rem)] font-bold leading-[1.02] tracking-[-0.03em] text-ink"
        />
        <p className="mx-auto mt-4 max-w-md text-pretty text-[15px] font-medium leading-relaxed text-ink-soft">
          give it one job and watch where it stops. you can do that in about two
          minutes, and it costs nothing.
        </p>

        <div className="mt-7 flex flex-col items-center justify-center gap-3 sm:flex-row">
          <Link
            href="/sign-up"
            prefetch
            className="group inline-flex w-full items-center justify-center gap-2 rounded-btn bg-signal px-7 py-3.5 text-base font-extrabold lowercase text-ink shadow-lift transition-transform duration-fast ease-brand-out hover:-translate-y-0.5 hover:scale-[1.02] active:scale-95 sm:w-auto"
          >
            <span className="transition-transform duration-base ease-brand-out group-hover:scale-110">
              <DrawnCheck size={16} drawn />
            </span>
            start free
          </Link>
          <Link
            href="/demo"
            prefetch
            className="inline-flex w-full items-center justify-center rounded-btn px-5 py-3.5 text-base font-bold lowercase text-ink ring-1 ring-inset ring-ink transition-colors duration-fast hover:bg-cream sm:w-auto"
          >
            watch it run first
          </Link>
        </div>
        <p className="mt-3 text-[12px] font-medium lowercase text-ink-soft">{terms}</p>
      </motion.div>
    </section>
  );
}
