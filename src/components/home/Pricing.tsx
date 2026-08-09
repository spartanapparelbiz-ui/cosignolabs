"use client";

import Link from "next/link";
import { useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { DrawnCheck, Eyebrow, Lede } from "./ui";
import { Mark3D } from "./Mark3D";
import { EASE_OUT, MaskedLines, Stagger, StaggerItem, useSectionPass, useSmoothed, useStillness } from "./primitives";
import { PricingLink } from "@/components/landing/Track";

/**
 * Pricing.
 *
 * Every number on this page arrives as a prop from the server, read from the
 * plans source of truth — so the marketing page cannot drift from what the
 * product actually enforces, and the plan module never ships to the browser.
 *
 * The cards rise on entry and the hovered one comes forward a hair (scale and
 * shadow, nothing that reflows). The comparison rows below stagger in the
 * first time they're seen.
 */

export interface PlanCard {
  id: string;
  name: string;
  tagline: string;
  /** The monthly price, already formatted. */
  price: string;
  /** The annual price expressed per month, which is what people compare. */
  annualPrice: string;
  /** What the annual plan actually charges, once. */
  annualTotal: string;
  /** e.g. "2 months free" — empty on the free plan. */
  saving: string;
  cadence: string;
  features: string[];
  cta: string;
  featured: boolean;
  /** Where the button goes: sign-up for free, straight to checkout for paid. */
  href: string;
}

export function Pricing({ plans, intro }: { plans: PlanCard[]; intro: string }) {
  const ref = useRef<HTMLElement>(null);
  const still = useStillness();
  const pass = useSmoothed(useSectionPass(ref), 120, 26);
  const [hovered, setHovered] = useState<string | null>(null);
  const [interval, setInterval] = useState<"monthly" | "annual">("monthly");

  return (
    <section
      ref={ref}
      id="pricing"
      aria-labelledby="pricing-title"
      className="relative overflow-hidden bg-cream-deep/45 py-20 sm:py-32"
    >
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 top-0 hidden h-[26rem] opacity-[0.11] sm:block"
      >
        <Mark3D
          progress={pass}
          still={still}
          mode="spin"
          decorative
          className="h-full w-full"
        />
      </div>
      <div className="relative mx-auto w-full max-w-6xl px-5">
        <header className="mx-auto max-w-2xl text-center">
          <Eyebrow>pricing</Eyebrow>
          <MaskedLines
            as="h2"
            id="pricing-title"
            lines={["one signature.", "three sizes."]}
            className="mt-4 text-balance font-display text-[clamp(2rem,5.6vw,4rem)] font-bold leading-[0.98] tracking-[-0.03em] text-ink"
          />
          <Lede className="mx-auto mt-5 max-w-lg">
            one operation is one step of thinking, or one action taken. every
            plan asks you the same way. being asked is never an upgrade.
          </Lede>
          {/* The billing switch. Annual is preselected nowhere: a default that
              quietly costs twelve months up front is not a kindness. It is
              offered, priced per month so the comparison is honest, and the
              saving is stated in months rather than a percentage nobody can
              check. */}
          <div className="mt-8 inline-flex rounded-pill bg-cream-deep/80 p-1 ring-1 ring-inset ring-line/70">
            {(["monthly", "annual"] as const).map((i) => (
              <button
                key={i}
                type="button"
                onClick={() => setInterval(i)}
                aria-pressed={interval === i}
                className={`rounded-pill px-4 py-2 text-[12px] font-extrabold lowercase transition-colors duration-fast ${
                  interval === i ? "bg-surface text-ink shadow-soft" : "text-ink-soft hover:text-ink"
                }`}
              >
                {i === "monthly" ? "monthly" : "yearly, 2 months free"}
              </button>
            ))}
          </div>
        </header>

        <Stagger className="mt-11 grid sm:mt-14 gap-4 md:grid-cols-3" step={0.1}>
          {plans.map((plan) => {
            const lifted = hovered === plan.id;
            return (
              <StaggerItem key={plan.id} className="h-full">
                <motion.div
                  onHoverStart={() => setHovered(plan.id)}
                  onHoverEnd={() => setHovered((h) => (h === plan.id ? null : h))}
                  animate={{ scale: lifted ? 1.02 : 1, y: lifted ? -4 : 0 }}
                  transition={{ duration: 0.28, ease: EASE_OUT }}
                  className={`flex h-full flex-col rounded-card bg-surface p-6 ${
                    plan.featured
                      ? "shadow-depth-lift ring-2 ring-signal"
                      : "shadow-depth ring-1 ring-inset ring-line/70"
                  }`}
                >
                  <div className="flex items-baseline justify-between gap-2">
                    <h3 className="text-sm font-extrabold lowercase text-ink">{plan.name}</h3>
                    {plan.featured && (
                      <span className="rounded-pill bg-signal/15 px-2.5 py-1 text-[10px] font-extrabold lowercase text-ink ring-1 ring-inset ring-signal/40">
                        most chosen
                      </span>
                    )}
                  </div>
                  <p className="mt-1 text-[11px] font-semibold lowercase text-ink-soft">
                    {plan.tagline}
                  </p>

                  {/* The number swaps, the box does not: both prices are laid
                      on top of each other in a fixed-height slot, so switching
                      the interval never moves the card or the page. */}
                  <div className="relative mt-5 h-[3.1rem]">
                    <AnimatePresence initial={false} mode="wait">
                      <motion.p
                        key={interval}
                        className="absolute inset-x-0 top-0 font-display text-4xl font-bold tracking-tight text-ink"
                        initial={still ? false : { opacity: 0, y: 8 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={still ? undefined : { opacity: 0, y: -8 }}
                        transition={{ duration: 0.2, ease: EASE_OUT }}
                      >
                        {interval === "annual" && plan.cadence ? plan.annualPrice : plan.price}
                        <span className="ml-1 text-sm font-semibold text-ink-soft">
                          {plan.cadence}
                        </span>
                      </motion.p>
                    </AnimatePresence>
                    <p className="absolute inset-x-0 bottom-0 text-[11px] font-semibold lowercase text-ink-soft">
                      {plan.cadence === ""
                        ? "free forever"
                        : interval === "annual"
                          ? `${plan.annualTotal} a year, ${plan.saving}`
                          : "cancel any time"}
                    </p>
                  </div>

                  <ul className="mt-5 flex-1 space-y-2">
                    {plan.features.map((f) => (
                      <li key={f} className="flex items-start gap-2.5">
                        <span className="mt-[3px] shrink-0 text-signal">
                          <DrawnCheck size={13} />
                        </span>
                        <span className="text-[12px] font-semibold leading-relaxed text-ink-soft">
                          {f}
                        </span>
                      </li>
                    ))}
                  </ul>

                  {/* Paid plans go straight to the card form; free needs an
                      account first. Checkout is NOT prefetched: it is a
                      force-dynamic route behind the billing gate, so a
                      prefetch is a real request that 503s wherever Stripe is
                      not configured, and it buys nothing — nobody arrives at
                      checkout by accident. */}
                  <Link
                    href={
                      plan.href.startsWith("/checkout")
                        ? `${plan.href}&interval=${interval}`
                        : plan.href
                    }
                    prefetch={!plan.href.startsWith("/checkout")}
                    className={`mt-6 rounded-btn px-4 py-3 text-center text-sm font-extrabold lowercase transition-transform duration-fast ease-brand-out hover:-translate-y-px active:scale-95 ${
                      plan.featured
                        ? "bg-signal text-ink shadow-soft motion-safe:animate-pulse-glow"
                        : "text-ink ring-1 ring-inset ring-ink hover:bg-cream-deep"
                    }`}
                  >
                    {plan.cta}
                  </Link>
                  <p className="mt-2 text-center text-[10.5px] font-semibold lowercase text-ink-soft">
                    {plan.cadence === "" ? "no card needed" : "card at the last step, cancel any time"}
                  </p>
                </motion.div>
              </StaggerItem>
            );
          })}
        </Stagger>

        {/* The intro offer is a first-MONTH discount, so it is only true on
            the monthly tab. Leaving it up under yearly prices would be an
            offer we do not make. */}
        <p className="mt-5 text-center text-[11px] font-semibold lowercase text-ink-soft">
          {interval === "monthly" ? `${intro}. ` : "billed once a year, cancel any time. "}
          <PricingLink className="underline decoration-signal underline-offset-2 hover:text-ink">
            see the full breakdown
          </PricingLink>
        </p>
      </div>
    </section>
  );
}
