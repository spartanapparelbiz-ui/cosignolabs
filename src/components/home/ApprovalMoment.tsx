"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { AnimatePresence, motion, useInView } from "framer-motion";
import { ActionCard, DrawnCheck, type ActionSpec } from "./ui";
import { EASE_OUT, EASE_SPRING, MaskedLines, useStillness } from "./primitives";

/**
 * The moment the whole product exists for.
 *
 * The runaway feed from the section above freezes mid-flight, a single card
 * arrives, and nothing else happens until someone answers it. The buttons are
 * real: click approve and the scene resumes with your signature on it. If you
 * don't, a presence dot walks over and presses it for you after a beat —
 * once, deliberately — because the point of the scene is what happens *after*
 * the answer, and nobody should have to hunt for it.
 */

const THE_ASK: ActionSpec = {
  id: "a_88",
  title: "send 412 emails to all-customers",
  meta: "gmail · 412 recipients · cannot be unsent",
  tier: "sign",
  payload: (
    <>
      to: all-customers (412)
      <br />
      subject: an important update to your account
      <br />
      attachments: none · reply-to: you@yourcompany.com
    </>
  ),
};

const FROZEN = [
  "deployed api 3.14 to production",
  "refunded $12,480 across 61 orders",
  "deleted 1,204 rows from invoices",
  "gave three new people admin",
  "changed the payout account",
  "force-pushed to main",
];

type Phase = "frozen" | "signed" | "vetoed";

export function ApprovalMoment() {
  const ref = useRef<HTMLElement>(null);
  const still = useStillness();
  const inView = useInView(ref, { once: true, margin: "0px 0px -25% 0px" });
  const [phase, setPhase] = useState<Phase>("frozen");
  const [guiding, setGuiding] = useState(false);

  const sign = useCallback(() => {
    setGuiding(false);
    setPhase("signed");
  }, []);

  const veto = useCallback(() => {
    setGuiding(false);
    setPhase("vetoed");
  }, []);

  const answered = phase !== "frozen";

  // The self-demonstration: only ever runs while the card is still unanswered
  // and only when the scene is actually on screen.
  useEffect(() => {
    if (!inView || phase !== "frozen" || still) return;
    const walk = setTimeout(() => setGuiding(true), 2600);
    const press = setTimeout(sign, 3800);
    return () => {
      clearTimeout(walk);
      clearTimeout(press);
    };
  }, [inView, phase, still, sign]);

  const revealed = inView || still;

  return (
    <section
      ref={ref}
      aria-labelledby="moment-title"
      className="relative overflow-hidden bg-cream py-24 sm:py-32"
    >
      {/* The freeze: one hairline crosses the frame, once. It travels on a
          transform, not on `left` — animating an inset is the one thing on
          this page that registered as a layout shift, however small. */}
      {!still && (
        <motion.div
          aria-hidden="true"
          className="pointer-events-none absolute inset-y-0 left-0 w-px bg-signal/70"
          initial={{ x: "-2vw", opacity: 0 }}
          animate={revealed ? { x: "102vw", opacity: [0, 1, 1, 0] } : {}}
          transition={{ duration: 0.9, ease: EASE_OUT }}
        />
      )}

      <div className="mx-auto w-full max-w-6xl px-4">
        <header className="mx-auto max-w-2xl text-center">
          <p className="inline-flex items-center gap-2 text-[11px] font-extrabold uppercase tracking-[0.22em] text-ink-soft">
            <span className="h-1.5 w-1.5 rounded-pill bg-signal" aria-hidden="true" />
            with cosigno
          </p>
          <MaskedLines
            as="h2"
            id="moment-title"
            lines={["everything stops", "right here."]}
            className="mt-4 font-display text-[clamp(2.1rem,6vw,4.5rem)] font-bold leading-[0.98] tracking-[-0.03em] text-ink"
          />
          <p className="mx-auto mt-5 max-w-lg text-sm font-semibold leading-relaxed text-ink-soft sm:text-base">
            the queue is still there. it is just not moving — and it will go on
            not moving for as long as you need it to.
          </p>
        </header>

        <div className="mt-12 grid items-center gap-8 lg:mt-16 lg:grid-cols-[minmax(0,1fr)_minmax(0,26rem)] lg:gap-14">
          {/* --------------------------------------------- the frozen queue */}
          <ul
            aria-hidden="true"
            className="space-y-2"
          >
            {FROZEN.map((row, i) => (
              <li
                key={row}
                className="flex items-center gap-3 rounded-btn bg-surface px-4 py-3 shadow-soft transition-transform duration-slow ease-brand-out"
                style={{
                  transform:
                    answered || still
                      ? "none"
                      : `rotate(${(i % 2 ? -1 : 1) * (0.4 + i * 0.18)}deg) translateX(${
                          (i % 3) * 4
                        }px)`,
                  transitionDelay: answered ? `${i * 70}ms` : "0ms",
                }}
              >
                <span
                  className={`shrink-0 text-signal transition-opacity duration-base ${
                    phase === "signed" ? "opacity-100" : "opacity-0"
                  }`}
                  style={{ transitionDelay: phase === "signed" ? `${140 + i * 70}ms` : "0ms" }}
                >
                  <DrawnCheck size={15} drawn={phase === "signed"} />
                </span>
                <span className="min-w-0 truncate text-[13px] font-bold lowercase text-ink">
                  {row}
                </span>
                <span className="ml-auto shrink-0 font-mono text-[10px] text-ink-soft">
                  {phase === "signed" ? "held · then signed" : phase === "vetoed" ? "held · nothing ran" : "held"}
                </span>
              </li>
            ))}
          </ul>

          {/* ---------------------------------------------------- the card */}
          <div className="relative mx-auto w-full max-w-[26rem]">
            <motion.div
              initial={false}
              animate={
                revealed
                  ? { opacity: 1, y: 0, scale: 1 }
                  : { opacity: 0, y: 28, scale: 0.97 }
              }
              transition={{ duration: 0.62, ease: EASE_SPRING, delay: still ? 0 : 0.45 }}
            >
              <ActionCard
                action={THE_ASK}
                state={phase === "frozen" ? "pending" : phase}
                onApprove={sign}
                onVeto={veto}
                className={answered ? "motion-safe:animate-sig-seal" : ""}
              />
            </motion.div>

            {/* the presence dot — the product pressing its own button, once */}
            <AnimatePresence>
              {guiding && (
                <motion.span
                  aria-hidden="true"
                  className="pointer-events-none absolute bottom-[2.05rem] left-[4.6rem] h-3.5 w-3.5 rounded-pill bg-ink shadow-lift"
                  initial={{ x: 150, y: 96, opacity: 0, scale: 1 }}
                  animate={{ x: 0, y: 0, opacity: 1, scale: [1, 1, 0.7, 1] }}
                  exit={{ opacity: 0, scale: 0.6 }}
                  transition={{ duration: 1.1, ease: EASE_OUT, times: [0, 0.72, 0.86, 1] }}
                />
              )}
            </AnimatePresence>

            <div className="mt-4 h-12 text-center">
              <AnimatePresence mode="wait" initial={false}>
                {answered ? (
                  <motion.p
                    key="after"
                    className="font-mono text-[10.5px] leading-relaxed text-ink-soft"
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.4, ease: EASE_OUT, delay: 0.25 }}
                  >
                    {phase === "signed"
                      ? "signed 09:41:12 · receipt r_8f2c41"
                      : "vetoed 09:41:12 · receipt r_8f2c41"}
                    <br />
                    either way, it is written down and it is yours.
                  </motion.p>
                ) : (
                  <motion.p
                    key="before"
                    className="text-[11px] font-bold lowercase text-ink-soft"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.3 }}
                  >
                    412 people are waiting on your answer.
                  </motion.p>
                )}
              </AnimatePresence>
            </div>
          </div>
        </div>

        <p
          className={`mx-auto mt-12 max-w-xl text-center font-display text-xl font-bold leading-snug tracking-tight text-ink transition-opacity duration-slow ease-brand-out sm:text-2xl ${
            answered ? "opacity-100" : "opacity-0"
          }`}
        >
          {phase === "vetoed"
            ? "nothing continued. that is also an answer."
            : "everything continued — with your name on it."}
        </p>
      </div>
    </section>
  );
}
