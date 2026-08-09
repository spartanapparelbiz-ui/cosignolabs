"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { motion, useTransform, type MotionValue } from "framer-motion";
import { ActionCard, ProgressRail, StepRow, TierChip, type ActionSpec } from "./ui";
import { Mark3D } from "./Mark3D";
import { useSectionProgress, useSmoothed, useStillness } from "./primitives";

/**
 * The hero is one sentence and one button — and then the product arrives.
 *
 * Scrolling drives a single continuous shot: the sentence lifts away while
 * the operator surface, which starts as a sliver at the bottom edge, rises
 * and grows to fill the frame. Four action cards drift in around it as it
 * settles. It is transform and opacity on a handful of elements, so the whole
 * move stays on the compositor.
 *
 * Reduced motion is handled in CSS, not JavaScript: `motion-reduce` collapses
 * the 240vh scroll stage into an ordinary stacked section — sentence, then
 * the surface at full size — with nothing pinned and nothing to scrub. The
 * scrubbed transforms are withheld from the DOM in the same breath, so a
 * visitor who asked for stillness never sees a single moved frame.
 */

const HERO_ACTION: ActionSpec = {
  id: "a_01",
  title: "reply to 3 leads who asked about pricing",
  meta: "gmail, 3 recipients, drafted not sent",
  tier: "sign",
  payload: (
    <>
      to: dana@northwind.co, sam@lumen.io, r.patel@arcadia.dev
      <br />
      subject: re: pricing for a 12-seat team
      <br />
      body: happy to walk you through it. here are the three plans.
    </>
  ),
};

const STEPS = [
  { label: "read 214 new messages", state: "done" as const },
  { label: "file 168 newsletters", state: "done" as const },
  { label: "find everyone waiting on a reply", state: "done" as const },
  { label: "draft the three replies", state: "done" as const },
  { label: "send the replies", state: "waiting" as const },
  { label: "log what happened", state: "queued" as const },
];

/** The cards that were waiting off-frame the whole time. */
const ORBIT: { action: ActionSpec; position: string; from: [number, number] }[] = [
  {
    action: {
      id: "o1",
      title: "refund order #4412, $48.00",
      meta: "stripe, cannot be undone",
      tier: "locked",
      payload: null,
    },
    position: "-left-[13%] top-[14%]",
    from: [-64, 20],
  },
  {
    action: {
      id: "o2",
      title: "post the release note in #launch",
      meta: "slack, 140 people",
      tier: "sign",
      payload: null,
    },
    position: "-right-[13%] top-[6%]",
    from: [64, 26],
  },
  {
    action: {
      id: "o3",
      title: "summarise thursday's calls",
      meta: "drive, reads only",
      tier: "auto",
      payload: null,
    },
    position: "-left-[11%] bottom-[12%]",
    from: [-50, -14],
  },
  {
    action: {
      id: "o4",
      title: "merge pull request #218",
      meta: "github, touches production",
      tier: "locked",
      payload: null,
    },
    position: "-right-[11%] bottom-[18%]",
    from: [56, -20],
  },
];

export function Hero() {
  const ref = useRef<HTMLElement>(null);
  const still = useStillness();
  const raw = useSectionProgress(ref);
  const p = useSmoothed(raw, 180, 32);

  const headY = useTransform(p, [0, 0.45], ["0vh", "-16vh"]);
  const headOpacity = useTransform(p, [0, 0.3], [1, 0]);
  const headScale = useTransform(p, [0, 0.45], [1, 0.95]);

  /**
   * How far below the fold the surface waits before you scroll.
   *
   * A phone's headline block is three times as tall in proportion, so the
   * same 52vh that leaves a comfortable two-row peek on a laptop puts the
   * panel's top edge through the reassurance line. The offset is a transform,
   * never layout, so resolving it after mount costs nothing and shifts
   * nothing.
   */
  const [panelStart, setPanelStart] = useState(52);
  useEffect(() => {
    const wide = window.matchMedia("(min-width: 640px)");
    const update = () => setPanelStart(wide.matches ? 52 : 64);
    update();
    wide.addEventListener("change", update);
    return () => wide.removeEventListener("change", update);
  }, []);

  const panelY = useTransform(p, [0, 0.75], [`${panelStart}vh`, "0vh"]);
  const panelScale = useTransform(p, [0, 0.75], [0.62, 1]);
  const washOpacity = useTransform(p, [0.12, 0.8], [0, 1]);
  const fieldScale = useTransform(p, [0, 1], [0.7, 1.25]);
  const orbitOpacity = useTransform(p, [0.62, 0.86], [0, 1]);
  const orbitPull = useTransform(p, [0.62, 0.9], [1, 0]);

  return (
    <section
      ref={ref}
      aria-label="cosigno"
      className="relative motion-safe:h-[200vh] motion-safe:md:h-[260vh]"
    >
      {/* The field warms as the surface arrives — one wash, not a gradient set.
          It lives on the section, not on the sticky frame, so it runs edge to
          edge and hands off cleanly to the section below instead of leaving a
          band where the pinned viewport ends. */}
      <motion.div
        aria-hidden="true"
        className="absolute inset-0 hidden bg-cream-deep opacity-0 motion-safe:block"
        style={still ? undefined : { opacity: washOpacity }}
      />
      {/* The ambient field is wider than the viewport, so it gets its own
          clipping frame — a sibling of the sticky stage, never an ancestor of
          it, because an ancestor with `overflow` would kill the pinning.
          Centering rides Framer's own x/y: it writes `transform` inline and
          would overwrite a utility translate on the same node. */}
      <div aria-hidden="true" className="pointer-events-none absolute inset-0 overflow-hidden">
        <motion.div
          className="absolute left-1/2 top-1/2 h-[130vmax] w-[130vmax] rounded-pill"
          style={{
            background:
              "radial-gradient(closest-side, rgba(251,76,32,0.07), rgba(251,76,32,0) 70%)",
            x: "-50%",
            y: "-50%",
            ...(still ? {} : { scale: fieldScale }),
          }}
        />
      </div>

      <div className="relative flex flex-col items-center justify-center gap-14 px-4 pb-16 pt-28 motion-safe:sticky motion-safe:top-0 motion-safe:h-[100dvh] motion-safe:gap-0 motion-safe:overflow-hidden motion-safe:p-0">
        {/* ---------------------------------------------------- the sentence */}
        <motion.div
          className="relative z-20 mx-auto flex w-full max-w-5xl flex-col items-center text-center motion-safe:absolute motion-safe:inset-x-0 motion-safe:px-5"
          style={still ? undefined : { y: headY, opacity: headOpacity, scale: headScale }}
        >
          {/* The mark, as an object rather than a picture of one. Its box is
              sized in CSS, so the canvas mounting inside it moves nothing. */}
          <Mark3D
            progress={p}
            still={still}
            mode="hero"
            fallbackSize={128}
            className="mb-1 h-[clamp(128px,19dvh,300px)] w-full max-w-[540px] sm:h-[clamp(168px,26dvh,300px)]"
          />

          <p className="text-[11px] font-extrabold uppercase tracking-[0.22em] text-ink-soft sm:text-xs">
            the operating system for trusted ai
          </p>

          {/* The trailing space on the first line is load-bearing: block spans
              concatenate for assistive tech, and "cannotact" is not a word. */}
          <h1 className="mt-5 font-display text-[clamp(2.5rem,9.2vw,7.25rem)] font-bold leading-[0.93] tracking-[-0.035em] text-ink">
            <span className="block motion-safe:animate-word-in">ai that cannot </span>
            <span className="block motion-safe:animate-word-in motion-safe:[animation-delay:110ms]">
              act without you.
            </span>
          </h1>

          <p className="mt-6 max-w-xl text-base font-semibold leading-relaxed text-ink-soft motion-safe:animate-word-in motion-safe:[animation-delay:260ms] sm:text-lg">
            cosigno runs the work across your tools. it stops before anything
            sends, changes, or spends.
          </p>

          <div className="mt-8 flex flex-wrap items-center justify-center gap-x-6 gap-y-3 motion-safe:animate-word-in motion-safe:[animation-delay:380ms]">
            <Link
              href="/sign-up"
              prefetch
              className="rounded-btn bg-signal px-8 py-4 text-base font-extrabold lowercase text-ink shadow-lift transition-transform duration-fast ease-brand-out hover:-translate-y-0.5 hover:scale-[1.02] active:scale-95"
            >
              start free
            </Link>
            <a
              href="#pricing"
              className="text-sm font-bold lowercase text-ink underline decoration-signal decoration-2 underline-offset-4 transition-colors hover:text-signal"
            >
              see the plans
            </a>
          </div>
          <p className="mt-3 text-[11px] font-semibold lowercase text-ink-soft motion-safe:animate-word-in motion-safe:[animation-delay:440ms]">
            free tier, no card, about two minutes to your first mission
          </p>
        </motion.div>

        {/* -------------------------------------------- the operator surface */}
        <div className="relative z-10 w-full motion-safe:pointer-events-none motion-safe:absolute motion-safe:inset-0 motion-safe:flex motion-safe:items-center motion-safe:justify-center motion-safe:px-4">
          <motion.div
            className="relative mx-auto w-full max-w-[1060px] will-change-transform motion-safe:[transform:translateY(64vh)_scale(0.62)] motion-safe:sm:[transform:translateY(52vh)_scale(0.62)]"
            style={still ? { transform: "none" } : { y: panelY, scale: panelScale }}
          >
            <HeroSurface />

            {ORBIT.map((o) => (
              <OrbitCard
                key={o.action.id}
                action={o.action}
                position={o.position}
                from={o.from}
                opacity={orbitOpacity}
                pull={orbitPull}
                still={still}
              />
            ))}
          </motion.div>
        </div>
      </div>
    </section>
  );
}

/**
 * One of the four cards that drift toward the surface as it settles. Its own
 * component so the scrub transforms are real hooks, not hooks in a loop.
 */
function OrbitCard({
  action,
  position,
  from,
  opacity,
  pull,
  still,
}: {
  action: ActionSpec;
  position: string;
  from: [number, number];
  opacity: MotionValue<number>;
  pull: MotionValue<number>;
  still: boolean;
}) {
  const x = useTransform(pull, (v) => v * from[0]);
  const y = useTransform(pull, (v) => v * from[1]);
  if (still) return null;
  return (
    <motion.div
      aria-hidden="true"
      className={`absolute hidden w-[250px] opacity-0 2xl:block ${position}`}
      style={{ opacity, x, y }}
    >
      <ActionCard action={action} compact interactive={false} />
    </motion.div>
  );
}

/** The surface itself: one mission, mid-flight, holding at a signature. */
function HeroSurface() {
  return (
    <div className="pointer-events-auto overflow-hidden rounded-card bg-surface shadow-depth-lift">
      <div className="flex items-center justify-between gap-3 border-b border-line/50 px-4 py-3 sm:px-5">
        <span className="truncate text-[11px] font-extrabold lowercase text-ink sm:text-[13px]">
          mission: clear the inbox and answer the leads
        </span>
        <TierChip tier="sign" className="hidden sm:inline-flex" />
      </div>

      <div className="grid gap-4 p-4 sm:p-5 md:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)] md:gap-6">
        <div>
          <ul>
            {STEPS.map((s, i) => (
              <StepRow
                key={s.label}
                index={i + 1}
                label={s.label}
                state={s.state}
                gated={s.state === "waiting"}
              />
            ))}
          </ul>
          <div className="mt-4">
            <ProgressRail value={4 / 6} />
            <p className="mt-2 text-[11px] font-bold lowercase text-ink-soft">
              4 of 6 done, 1 waiting for your signature
            </p>
          </div>
        </div>

        <ActionCard action={HERO_ACTION} interactive={false} className="self-start" />
      </div>
    </div>
  );
}
