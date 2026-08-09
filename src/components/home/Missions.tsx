"use client";

import { useRef, useState } from "react";
import { motion, useMotionValueEvent, useTransform } from "framer-motion";
import { ActionCard, Chip, Eyebrow, Lede, ProgressRail, ReceiptLine, StepRow, type StepState } from "./ui";
import { MaskedLines, useSectionProgress, useSmoothed, useStillness } from "./primitives";

/**
 * A mission, driven by your scrollbar.
 *
 * Steps clear themselves until one of them would change something outside
 * cosigno — then the whole mission holds, not just that step. Scroll past the
 * signature and it resumes and closes itself.
 *
 * The scrub sets exactly one piece of React state (which stage we're in, and
 * only when it changes), so eight discrete states cost eight renders across
 * the whole section. Everything continuous — the card sliding in, the hold
 * pulse — rides motion values straight to the compositor.
 */

const STEPS: { label: string; gate?: boolean }[] = [
  { label: "open the two invoices tagged duplicate" },
  { label: "match them against the original charges" },
  { label: "write the refund note for each customer" },
  { label: "refund $96.00 to two customers", gate: true },
  { label: "email both customers the confirmation" },
  { label: "file the receipts and close the mission" },
];

/** Stage boundaries in scroll progress. Stage n means n things have resolved. */
const MARKS = [0.06, 0.16, 0.26, 0.36, 0.62, 0.74, 0.86];
const HOLD_STAGE = 4;

export function Missions() {
  const ref = useRef<HTMLElement>(null);
  const still = useStillness();
  const raw = useSectionProgress(ref);
  const p = useSmoothed(raw, 160, 30);
  const [stage, setStage] = useState(0);

  useMotionValueEvent(p, "change", (v) => {
    let next = 0;
    for (const m of MARKS) if (v >= m) next += 1;
    setStage((prev) => (prev === next ? prev : next));
  });

  const cardOpacity = useTransform(p, [0.33, 0.4, 0.6, 0.665], [0, 1, 1, 0]);
  const cardX = useTransform(p, [0.33, 0.42], [64, 0]);
  const cardScale = useTransform(p, [0.6, 0.665], [1, 0.96]);
  const noteOpacity = useTransform(p, [0.28, 0.36, 0.62, 0.7], [1, 0, 0, 1]);

  // Under stillness the whole scene renders resolved — a finished mission,
  // legible in one glance, with nothing left to scrub toward.
  const shown = still ? MARKS.length : stage;
  const holding = shown === HOLD_STAGE;
  const done = shown >= MARKS.length;

  const stepState = (i: number): StepState => {
    // While the mission is held, nothing downstream is "running" — that is the
    // whole point of the hold, and showing a spinner on the next step would
    // quietly contradict it.
    if (holding) return i < 3 ? "done" : i === 3 ? "waiting" : "queued";
    if (i === 3 && shown > HOLD_STAGE) return "done";
    if (i < shown) return "done";
    if (i === shown) return "running";
    return "queued";
  };

  const filled = done ? 1 : Math.min(shown, STEPS.length) / STEPS.length;

  return (
    <section
      ref={ref}
      aria-labelledby="missions-title"
      className="relative bg-cream motion-safe:h-[250vh]"
    >
      <div className="flex flex-col justify-center px-4 py-24 motion-safe:sticky motion-safe:top-0 motion-safe:h-[100dvh] motion-safe:overflow-hidden motion-safe:py-0">
        <div className="mx-auto w-full max-w-5xl">
          <header className="mx-auto max-w-2xl text-center">
            <Eyebrow>missions</Eyebrow>
            <MaskedLines
              as="h2"
              id="missions-title"
              lines={["a mission runs itself", "until it needs you."]}
              className="mt-4 text-balance font-display text-[clamp(1.9rem,5vw,3.5rem)] font-bold leading-[1] tracking-[-0.03em] text-ink"
            />
            <Lede className="mx-auto mt-5 max-w-lg">
              a mission is a job you hand over. when one step would change
              something real, the whole job stops and waits for you.
            </Lede>
          </header>

          {/* The card that arrives at the hold gets its own column rather than
              floating over the panel — an overlay would sit on top of the very
              step it is about, and cover the "waiting for you" marker. */}
          <div className="mt-10 lg:grid lg:grid-cols-[minmax(0,1fr)_21rem] lg:items-center lg:gap-6">
            <div className="overflow-hidden rounded-card bg-surface shadow-depth-lift">
              <div className="flex items-center justify-between gap-3 border-b border-line/50 px-4 py-3">
                <span className="truncate text-[12px] font-extrabold lowercase text-ink">
                  mission: sort out the duplicate charges
                </span>
                {done ? (
                  <Chip tone="signal">complete, 6 of 6</Chip>
                ) : holding ? (
                  <Chip tone="ink" className="motion-safe:animate-chip-pulse">
                    held, waiting for your signature
                  </Chip>
                ) : (
                  <Chip tone="muted">running</Chip>
                )}
              </div>

              <div className="p-4 sm:p-5">
                <ul>
                  {STEPS.map((s, i) => (
                    <StepRow
                      key={s.label}
                      index={i + 1}
                      label={s.label}
                      state={stepState(i)}
                      gated={s.gate}
                    />
                  ))}
                </ul>

                <div className="mt-5">
                  <div
                    className={`transition-opacity duration-base ${
                      holding ? "opacity-60" : "opacity-100"
                    }`}
                  >
                    <ProgressRail
                      value={filled}
                      className="[&>div]:transition-transform [&>div]:duration-slow [&>div]:ease-brand-out"
                    />
                  </div>
                  {/* Two lines are reserved on a phone, where the held and
                      finished captions wrap and the short running one does
                      not. Letting the line count change mid-scrub moved
                      everything below it. */}
                  <p className="mt-2 min-h-[2.125rem] text-[11px] font-bold lowercase text-ink-soft sm:min-h-0">
                    {done
                      ? "6 of 6 done, one signature, one typed confirmation"
                      : holding
                        ? "3 of 6 done, nothing else moves until you answer"
                        : `${Math.min(shown, STEPS.length)} of 6 done`}
                  </p>
                </div>

                {/* Reserved, not conditional: rendering the receipts only on
                    completion grew the card mid-scroll and shifted the scene. */}
                <div
                  className={`mt-4 h-[2.35rem] space-y-1 transition-opacity duration-slow ease-brand-out ${
                    done ? "opacity-100" : "opacity-0"
                  }`}
                  aria-hidden={!done}
                >
                  <ReceiptLine id="r_44c1" what="$96.00 refunded, you typed it" at="11:01" />
                  <ReceiptLine id="r_44c2" what="2 emails sent, signed by you" at="11:02" />
                </div>
              </div>
            </div>

            {/* The side column is never empty: it explains what a hold is
                until the hold actually happens, then hands over to the card. */}
            <div aria-hidden="true" className="relative hidden min-h-[19rem] lg:block">
              <motion.div
                className="absolute inset-x-0 top-1/2 -translate-y-1/2"
                style={still ? { opacity: 0 } : { opacity: noteOpacity }}
              >
                <p className="text-[11px] font-extrabold uppercase tracking-[0.18em] text-ink-soft">
                  what stopping means
                </p>
                <ul className="check-list mt-3 space-y-2.5 text-[12.5px] font-medium leading-relaxed text-ink-soft">
                  <li>the whole job pauses, not just that step.</li>
                  <li>nothing later runs ahead of your answer.</li>
                  <li>it never times out and never guesses for you.</li>
                </ul>
              </motion.div>

              {!still && (
                <motion.div
                  className="pointer-events-none absolute inset-x-0 top-1/2 -translate-y-1/2"
                  style={{ opacity: cardOpacity }}
                >
                  <motion.div style={{ x: cardX, scale: cardScale }}>
                    <ActionCard
                      interactive={false}
                      action={{
                        id: "m_gate",
                        title: "refund $96.00 to two customers",
                        meta: "stripe, cannot be undone, typed confirmation",
                        tier: "locked",
                        payload: (
                          <>
                            charge ch_3PmQ1a &nbsp; $48.00 &nbsp; dana@northwind.co
                            <br />
                            charge ch_3PmQ7f &nbsp; $48.00 &nbsp; sam@lumen.io
                          </>
                        ),
                      }}
                    />
                  </motion.div>
                </motion.div>
              )}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
