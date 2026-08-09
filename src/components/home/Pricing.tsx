"use client";

import Link from "next/link";
import { useRef, useState } from "react";
import { motion, useInView } from "framer-motion";
import { DrawnCheck } from "./ui";
import { EASE_OUT, MaskedLines, Rise, Stagger, StaggerItem, useArmed } from "./primitives";
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
  price: string;
  cadence: string;
  features: string[];
  cta: string;
  featured: boolean;
}

export interface ComparisonRow {
  label: string;
  cells: (string | boolean)[];
}

export function Pricing({
  plans,
  rows,
  intro,
}: {
  plans: PlanCard[];
  rows: ComparisonRow[];
  intro: string;
}) {
  const [hovered, setHovered] = useState<string | null>(null);

  return (
    <section id="pricing" aria-labelledby="pricing-title" className="bg-cream-deep/45 py-24 sm:py-32">
      <div className="mx-auto w-full max-w-6xl px-4">
        <header className="mx-auto max-w-2xl text-center">
          <p className="text-[11px] font-extrabold uppercase tracking-[0.22em] text-ink-soft">
            pricing
          </p>
          <MaskedLines
            as="h2"
            id="pricing-title"
            lines={["one signature.", "three sizes."]}
            className="mt-4 font-display text-[clamp(2rem,5.6vw,4rem)] font-bold leading-[0.98] tracking-[-0.03em] text-ink"
          />
          <p className="mx-auto mt-5 max-w-lg text-sm font-semibold leading-relaxed text-ink-soft sm:text-base">
            an operation is one piece of thinking or one executed action. the
            approval model is identical on every plan — it is the product, not
            a tier.
          </p>
        </header>

        <Stagger className="mt-14 grid gap-4 md:grid-cols-3" step={0.1}>
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

                  <p className="mt-5 font-display text-4xl font-bold tracking-tight text-ink">
                    {plan.price}
                    <span className="ml-1 text-sm font-semibold text-ink-soft">
                      {plan.cadence}
                    </span>
                  </p>

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

                  <Link
                    href="/sign-up"
                    prefetch
                    className={`mt-6 rounded-btn px-4 py-3 text-center text-sm font-extrabold lowercase transition-transform duration-fast ease-brand-out hover:-translate-y-px active:scale-95 ${
                      plan.featured
                        ? "bg-signal text-ink shadow-soft motion-safe:animate-pulse-glow"
                        : "text-ink ring-1 ring-inset ring-ink hover:bg-cream-deep"
                    }`}
                  >
                    {plan.cta}
                  </Link>
                </motion.div>
              </StaggerItem>
            );
          })}
        </Stagger>

        <p className="mt-5 text-center text-[11px] font-semibold lowercase text-ink-soft">
          {intro} ·{" "}
          <PricingLink className="underline decoration-signal underline-offset-2 hover:text-ink">
            see the full breakdown
          </PricingLink>
        </p>

        {/* ------------------------------------------------ what differs */}
        <Rise className="mt-14 overflow-hidden rounded-card bg-surface shadow-depth">
          <table className="w-full border-collapse text-left">
            <caption className="sr-only">what differs between the plans</caption>
            <thead>
              <tr className="border-b border-line/60">
                <th scope="col" className="px-4 py-3 text-[11px] font-extrabold lowercase text-ink-soft">
                  what differs
                </th>
                {plans.map((p) => (
                  <th
                    key={p.id}
                    scope="col"
                    className="px-4 py-3 text-center text-[11px] font-extrabold lowercase text-ink"
                  >
                    {p.name}
                  </th>
                ))}
              </tr>
            </thead>
            <ComparisonBody rows={rows} />
          </table>
        </Rise>
      </div>
    </section>
  );
}

const ROW_HIDDEN = { opacity: 0, y: 10, transition: { duration: 0 } };
const ROW_SHOWN = { opacity: 1, y: 0, transition: { duration: 0.45, ease: EASE_OUT } };

/**
 * The rows stagger in the first time the table is seen — but only if the
 * table was below the fold when the page hydrated, so the comparison is never
 * hidden from someone who simply landed next to it.
 */
function ComparisonBody({ rows }: { rows: ComparisonRow[] }) {
  const ref = useRef<HTMLTableSectionElement>(null);
  const armed = useArmed(ref);
  const inView = useInView(ref, { once: true, margin: "0px 0px -8% 0px" });
  const hidden = armed && !inView;

  return (
    <motion.tbody
      ref={ref}
      initial={false}
      animate={hidden ? "hidden" : "shown"}
      variants={{
        hidden: { transition: { duration: 0 } },
        shown: { transition: { staggerChildren: 0.06 } },
      }}
    >
      {rows.map((row) => (
        <motion.tr
          key={row.label}
          className="border-b border-line/40 last:border-0"
          variants={{ hidden: ROW_HIDDEN, shown: ROW_SHOWN }}
        >
          <th
            scope="row"
            className="px-4 py-3 text-left text-[12px] font-semibold lowercase text-ink-soft"
          >
            {row.label}
          </th>
          {row.cells.map((cell, j) => (
            <td key={j} className="px-4 py-3 text-center text-[12px] font-bold lowercase text-ink">
              {typeof cell === "boolean" ? (
                cell ? (
                  <span className="inline-flex text-signal">
                    <DrawnCheck size={15} />
                  </span>
                ) : (
                  <span className="text-ink-soft">—</span>
                )
              ) : (
                cell
              )}
            </td>
          ))}
        </motion.tr>
      ))}
    </motion.tbody>
  );
}
