"use client";

import { useRef } from "react";
import { motion, useTransform, type MotionValue } from "framer-motion";
import { Chip, Eyebrow, Lede } from "./ui";
import { Mark3D } from "./Mark3D";
import {
  MaskedLines,
  useSectionProgress,
  useSmoothed,
  useStillness,
  useWide,
} from "./primitives";

/**
 * Without cosigno.
 *
 * Three lanes of actions stream past at machine speed, each one faster than
 * the last, so scrolling makes them visibly outrun each other. The counter
 * above is tied to the same scroll position, so the number and the scene can
 * never disagree.
 *
 * The lanes deliberately do NOT fade in. An earlier cut had the second and
 * third rise from low opacity, which looked good and quietly rendered real
 * sentences at a contrast ratio nobody could read — aria-hidden makes text
 * invisible to a screen reader, not to a person with low vision. Speed
 * carries the escalation instead, and every row stays legible.
 *
 * No red anywhere (BRAND.md): the alarm is carried by density, speed, and the
 * hazard band on the stamps that say what's missing.
 */

const LANE_A = [
  ["09:41:02", "sent 412 emails to all-customers", "no approval on file"],
  ["09:41:02", "deployed api 3.14 to production", null],
  ["09:41:03", "refunded $12,480 across 61 orders", "not reversible"],
  ["09:41:03", "deleted 1,204 rows from invoices", "not reversible"],
  ["09:41:04", "posted the roadmap in #general", null],
  ["09:41:04", "gave three new people admin", "no approval on file"],
  ["09:41:05", "cancelled 8 subscriptions", null],
  ["09:41:05", "force-pushed to main", "no receipt"],
  ["09:41:06", "replied to 96 customers", null],
  ["09:41:06", "rewrote the pricing page", "no approval on file"],
  ["09:41:07", "moved 2,300 files out of shared", null],
  ["09:41:07", "sent the invoice run four days early", "not reversible"],
  ["09:41:08", "archived the leads pipeline", "no receipt"],
  ["09:41:08", "closed 46 open tickets", null],
  ["09:41:09", "changed who can sign in", "no approval on file"],
  ["09:41:09", "emailed the wrong list", "not reversible"],
] as const;

const LANE_B = [
  ["09:41:02", "scheduled 31 meetings", null],
  ["09:41:03", "shared the revenue sheet outside the team", "no approval on file"],
  ["09:41:03", "paid 14 invoices", "not reversible"],
  ["09:41:04", "unsubscribed 5,900 contacts", "no receipt"],
  ["09:41:04", "renamed 40 channels", null],
  ["09:41:05", "merged 11 pull requests", "no approval on file"],
  ["09:41:05", "issued 22 discount codes", null],
  ["09:41:06", "deleted last quarter's exports", "not reversible"],
  ["09:41:06", "answered a legal question as you", "no receipt"],
  ["09:41:07", "changed the payout account", "no approval on file"],
  ["09:41:07", "removed two people from the workspace", null],
  ["09:41:08", "published the draft announcement", "not reversible"],
] as const;

const LANE_C = [
  ["09:41:03", "opened 60 browser sessions", null],
  ["09:41:04", "downloaded the customer list", "no approval on file"],
  ["09:41:04", "posted in 12 channels at once", null],
  ["09:41:05", "reset 9 passwords", "not reversible"],
  ["09:41:05", "approved its own request", "no receipt"],
  ["09:41:06", "raised its own spend limit", "no approval on file"],
  ["09:41:06", "overwrote live customer records", "not reversible"],
  ["09:41:07", "emailed a supplier a new bank account", "no approval on file"],
  ["09:41:07", "turned off the audit log", "no receipt"],
  ["09:41:08", "started again from the top", null],
] as const;

type Row = readonly [string, string, string | null];

export function Chaos() {
  const ref = useRef<HTMLElement>(null);
  const still = useStillness();
  const wide = useWide();
  const raw = useSectionProgress(ref);
  const p = useSmoothed(raw, 150, 30);

  const count = useTransform(p, (v) => Math.round(v * 1284).toLocaleString());
  // The header drifts up as the lanes take over. It never fades: dimming body
  // copy to shift focus costs real readers real contrast, and the lanes are
  // loud enough on their own.
  const headY = useTransform(p, [0, 1], ["0px", "-38px"]);

  return (
    <section
      ref={ref}
      aria-labelledby="chaos-title"
      className="relative bg-cream-deep motion-safe:h-[220vh]"
    >
      <div className="relative flex flex-col justify-center px-4 py-24 motion-safe:sticky motion-safe:top-0 motion-safe:h-[100dvh] motion-safe:overflow-hidden motion-safe:py-0">
        {/* The mark without a signature: tumbling, and with the check already
            gone. It is the only place on the page the object is allowed to
            look wrong, because it is the section describing the wrong. */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 hidden opacity-[0.13] sm:block"
        >
          <Mark3D
            progress={p}
            still={still}
            sealed={false}
            mode="scatter"
            decorative
            className="h-full w-full"
          />
        </div>
        <div className="relative z-10 mx-auto w-full max-w-6xl">
          <motion.header
            className="mx-auto max-w-3xl text-center"
            style={still ? undefined : { y: headY }}
          >
            <Eyebrow>without cosigno</Eyebrow>
            <MaskedLines
              as="h2"
              id="chaos-title"
              lines={["give ai your accounts", "and it will use them."]}
              className="mt-4 text-balance font-display text-[clamp(2rem,5.6vw,4rem)] font-bold leading-[0.98] tracking-[-0.03em] text-ink"
            />
            <Lede className="mx-auto mt-5 max-w-xl">
              it can email your customers, spend your money and change your live
              site before you notice.
            </Lede>
          </motion.header>

          <div aria-hidden="true" className="mt-10 flex items-end justify-between gap-4 sm:mt-12">
            <div>
              <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-ink-soft">
                things it did without asking
              </p>
              <motion.p className="font-display text-4xl font-bold tabular-nums leading-none text-ink sm:text-5xl">
                {still ? "1,284" : count}
              </motion.p>
            </div>
            <p className="hidden max-w-[16rem] text-balance text-right text-[12px] font-medium leading-relaxed text-ink-soft sm:block">
              every line below is already done. nobody was asked, and there is
              no record to go back to.
            </p>
          </div>

          <div className="mt-6 grid gap-3 md:grid-cols-3">
            <Lane rows={LANE_A} progress={p} speed={1} still={still} />
            {/* Two more lanes, only where they are visible. `hidden md:block`
                would still ship, hydrate and animate 44 rows a phone never
                shows. */}
            {wide && (
              <>
                <Lane rows={LANE_B} progress={p} speed={1.35} still={still} />
                <Lane rows={LANE_C} progress={p} speed={1.7} still={still} />
              </>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}

/**
 * One streaming lane. The track is translated by a share of its own height,
 * so the same numbers hold at any viewport size, and the mapping is eased —
 * slow, then quick, then still — instead of a constant crawl.
 */
function Lane({
  rows,
  progress,
  speed,
  still,
  className = "",
}: {
  rows: readonly Row[];
  progress: MotionValue<number>;
  speed: number;
  still: boolean;
  className?: string;
}) {
  const shift = useTransform(
    progress,
    [0, 0.18, 0.55, 0.85, 1],
    ["0%", `${-3 * speed}%`, `${-26 * speed}%`, `${-46 * speed}%`, `${-52 * speed}%`]
  );

  return (
    <motion.div
      aria-hidden="true"
      className={`relative h-[clamp(190px,34dvh,340px)] overflow-hidden rounded-card bg-cream/50 shadow-well ${className}`}
      style={{
        maskImage:
          "linear-gradient(to bottom, transparent, black 14%, black 86%, transparent)",
        WebkitMaskImage:
          "linear-gradient(to bottom, transparent, black 14%, black 86%, transparent)",
      }}
    >
      <motion.ul
        className="will-change-transform"
        style={still ? undefined : { y: shift }}
      >
        {/* doubled so the lane never runs out of scene mid-scroll */}
        {[...rows, ...rows].map((r, i) => (
          <li
            key={`${r[1]}-${i}`}
            className="flex h-14 items-center gap-3 border-b border-line/40 px-3.5"
          >
            <span className="font-mono text-[10px] text-ink-soft">{r[0]}</span>
            <span className="min-w-0 flex-1 truncate text-[12.5px] font-bold lowercase text-ink">
              {r[1]}
            </span>
            {r[2] && (
              <Chip tone="hazard" className="shrink-0">
                {r[2]}
              </Chip>
            )}
          </li>
        ))}
      </motion.ul>
    </motion.div>
  );
}
