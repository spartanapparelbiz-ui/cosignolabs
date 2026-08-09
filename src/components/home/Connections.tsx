"use client";

import { useRef } from "react";
import { motion, useInView } from "framer-motion";
import { CosignoMark } from "@/components/brand/Logo";
import { TierChip } from "./ui";
import { EASE_OUT, MaskedLines, Rise, useStillness } from "./primitives";

/**
 * Connections.
 *
 * Eight tools reach in toward the mark, one line at a time; each tool pulses
 * once its line lands. The lines live in a single stretched SVG with
 * non-scaling strokes, so the whole diagram is one element that resizes
 * cleanly instead of a grid of images pretending to be a diagram.
 *
 * The tools themselves are real DOM with real labels — the drawing is the
 * decoration, never the information.
 */

/** The line canvas, at the same 16:10 aspect as the frame it sits in. */
const VB_W = 1000;
const VB_H = 625;

/** Positions are percentages of the frame — shared by the HTML and the lines. */
const NODES: { key: string; label: string; x: number; y: number }[] = [
  { key: "google", label: "gmail", x: 9, y: 14 },
  { key: "slack", label: "slack", x: 4, y: 42 },
  { key: "github", label: "github", x: 9, y: 70 },
  { key: "notion", label: "notion", x: 19, y: 93 },
  { key: "google-calendar", label: "calendar", x: 91, y: 14 },
  { key: "outlook", label: "outlook", x: 96, y: 42 },
  { key: "google-drive", label: "drive", x: 91, y: 70 },
  { key: "mcp", label: "your own api", x: 81, y: 93 },
];

const RULES = [
  { tier: "auto" as const, what: "search, summarise, draft" },
  { tier: "sign" as const, what: "send, post, update, spend" },
  { tier: "locked" as const, what: "refund, delete, pay" },
];

export function Connections() {
  const ref = useRef<HTMLDivElement>(null);
  const still = useStillness();
  const inView = useInView(ref, { once: true, margin: "0px 0px -18% 0px" });
  const on = inView || still;

  return (
    <section aria-labelledby="connections-title" className="bg-cream-deep/50 py-24 sm:py-32">
      <div className="mx-auto w-full max-w-6xl px-4">
        <header className="mx-auto max-w-2xl text-center">
          <p className="text-[11px] font-extrabold uppercase tracking-[0.22em] text-ink-soft">
            connections
          </p>
          <MaskedLines
            as="h2"
            id="connections-title"
            lines={["connect everything.", "hand over nothing."]}
            className="mt-4 font-display text-[clamp(2rem,5.6vw,4rem)] font-bold leading-[0.98] tracking-[-0.03em] text-ink"
          />
          <p className="mx-auto mt-5 max-w-xl text-sm font-semibold leading-relaxed text-ink-soft sm:text-base">
            one connection per tool, asking for the narrowest access that still
            does the job. the rules arrive with the connection. you can move
            them. the agent cannot.
          </p>
        </header>

        <div
          ref={ref}
          className="relative mx-auto mt-14 aspect-[4/5] w-full max-w-4xl sm:aspect-[16/10]"
        >
          {/*
           * The lines are drawn in a coordinate space with the same 16:10
           * aspect as the frame, so the SVG scales uniformly and a stroke dash
           * means what it says. The obvious alternative — a 0–100 square box
           * with preserveAspectRatio="none" — stretches the two axes by
           * different amounts, and `pathLength` normalisation then disagrees
           * with `non-scaling-stroke` about what "1" is: the drawn line comes
           * out as broken dashes. Below `sm` the frame is portrait and the
           * lines simply don't render; they were only ever decoration around
           * a ring of real, labelled tools.
           */}
          <svg
            aria-hidden="true"
            className="absolute inset-0 hidden h-full w-full sm:block"
            viewBox={`0 0 ${VB_W} ${VB_H}`}
            fill="none"
          >
            {NODES.map((n, i) => {
              const x = (n.x / 100) * VB_W;
              const y = (n.y / 100) * VB_H;
              return (
                <motion.path
                  key={n.key}
                  d={`M ${x} ${y} Q ${(x + VB_W / 2) / 2} ${y} ${VB_W / 2} ${VB_H / 2}`}
                  stroke="currentColor"
                  className="text-ink/25"
                  strokeWidth={1.8}
                  strokeLinecap="round"
                  initial={{ pathLength: still ? 1 : 0, opacity: still ? 1 : 0 }}
                  animate={on ? { pathLength: 1, opacity: 1 } : { pathLength: 0, opacity: 0 }}
                  transition={{ duration: 0.85, ease: EASE_OUT, delay: still ? 0 : 0.1 + i * 0.09 }}
                />
              );
            })}
          </svg>

          {/* the mark, at the middle of everything it is allowed to touch */}
          <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2">
            <span className="grid h-20 w-20 place-items-center rounded-card bg-surface shadow-depth-lift sm:h-24 sm:w-24">
              <CosignoMark size={40} />
            </span>
          </div>

          {NODES.map((n, i) => (
            <div
              key={n.key}
              className="absolute -translate-x-1/2 -translate-y-1/2"
              style={{ left: `${n.x}%`, top: `${n.y}%` }}
            >
              <motion.div
                className="relative flex flex-col items-center gap-1.5"
                initial={{ opacity: still ? 1 : 0, scale: still ? 1 : 0.9 }}
                animate={on ? { opacity: 1, scale: 1 } : { opacity: 0, scale: 0.9 }}
                transition={{ duration: 0.4, ease: EASE_OUT, delay: still ? 0 : i * 0.09 }}
              >
                {/* The single pulse that says the line landed. Centring goes
                    through Framer's x/y — a utility translate on the same node
                    would be overwritten by the inline transform it animates. */}
                {!still && (
                  <motion.span
                    aria-hidden="true"
                    className="pointer-events-none absolute left-1/2 top-[22px] h-11 w-11 rounded-pill ring-1 ring-signal"
                    initial={{ scale: 0.55, opacity: 0, x: "-50%", y: "-50%" }}
                    animate={on ? { scale: [0.55, 1.9], opacity: [0.6, 0] } : {}}
                    transition={{ duration: 1, ease: EASE_OUT, delay: 0.85 + i * 0.09 }}
                  />
                )}
                <span className="grid h-11 w-11 place-items-center rounded-btn bg-surface shadow-soft">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={`/logos/${n.key}.svg`}
                    alt=""
                    width={20}
                    height={20}
                    loading="lazy"
                    decoding="async"
                  />
                </span>
                <span className="whitespace-nowrap text-[10px] font-extrabold lowercase text-ink-soft">
                  {n.label}
                </span>
              </motion.div>
            </div>
          ))}
        </div>

        <Rise className="mx-auto mt-12 grid max-w-3xl gap-2.5 sm:grid-cols-3">
          {RULES.map((r) => (
            <div
              key={r.tier}
              className="rounded-card bg-surface p-4 text-center shadow-soft"
            >
              <TierChip tier={r.tier} />
              <p className="mt-2.5 text-[12px] font-bold lowercase text-ink">{r.what}</p>
            </div>
          ))}
        </Rise>
        <p className="mx-auto mt-5 max-w-xl text-center text-[11px] font-semibold leading-relaxed text-ink-soft">
          refunds, deletions and payments are pinned to the top tier. they
          cannot be lowered, and the agent has no way to raise its own
          authority.
        </p>
      </div>
    </section>
  );
}
