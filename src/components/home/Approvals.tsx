"use client";

import { useRef, useState } from "react";
import { motion, useMotionValueEvent, useTransform } from "framer-motion";
import { CosignoMark } from "@/components/brand/Logo";
import { DrawnCheck, PayloadWell, TierChip } from "./ui";
import { EASE_OUT, MaskedLines, useSectionProgress, useSmoothed, useStillness } from "./primitives";

/**
 * The approval, at full size.
 *
 * One card, six beats, all driven by how far you've scrolled: the deck comes
 * forward, the payload opens, the locked action asks you to type its name, the
 * signature draws itself, and the receipt lands.
 *
 * Two rules keep a scene this busy honest. Nothing animates a layout property
 * — the card's height never changes, so the "expansion" is the card coming
 * toward you while the deck falls away behind it. And no slot is ever empty
 * waiting to be filled: each reserved area holds its earlier state and
 * cross-fades to the later one, so the card reads as a finished object at
 * every single frame rather than a form with holes in it.
 */

const CONFIRM_WORD = "REFUND";
const MARKS = [0.13, 0.3, 0.45, 0.63, 0.8];

const CAPTIONS = [
  "three actions are waiting.",
  "the consequential one comes forward.",
  "everything it will do, before it does it.",
  "a locked action asks you to type its name.",
  "your signature — not a checkbox.",
  "signed, executed, and written down.",
];

/** The four things every card carries, whatever the action is. */
const CARD_ALWAYS: [string, string][] = [
  ["the exact payload", "every recipient, every amount, every id — before, not after."],
  ["the tool it will use", "which connection it goes through, and how far that reaches."],
  ["whether it can be undone", "stated on the card, not discovered afterwards."],
  ["two answers", "approve or veto. both are written down and both are yours."],
];

/** A believable hand, drawn once. */
const SIGNATURE_PATH =
  "M6 42C20 10 30 8 34 24c4 16-4 28-8 20s6-24 24-22 10 22 22 20 14-22 26-22 6 24 18 22 14-26 28-24 4 22 22 18c12-3 20-10 26-14";

export function Approvals() {
  const ref = useRef<HTMLElement>(null);
  const still = useStillness();
  const raw = useSectionProgress(ref);
  const p = useSmoothed(raw, 150, 30);

  const [stage, setStage] = useState(0);
  const [typed, setTyped] = useState(0);

  useMotionValueEvent(p, "change", (v) => {
    let next = 0;
    for (const m of MARKS) if (v >= m) next += 1;
    setStage((prev) => (prev === next ? prev : next));

    const t = Math.round(Math.max(0, Math.min(1, (v - 0.47) / 0.14)) * CONFIRM_WORD.length);
    setTyped((prev) => (prev === t ? prev : t));
  });

  // Behind the front card: two more waiting, their edges showing under it,
  // sliding out from under as it takes focus.
  const deck1Y = useTransform(p, [0, 0.26], [13, 62]);
  const deck1O = useTransform(p, [0.1, 0.26], [1, 0]);
  const deck2Y = useTransform(p, [0, 0.26], [26, 98]);
  const deck2O = useTransform(p, [0.08, 0.22], [1, 0]);

  const frontScale = useTransform(p, [0, 0.24], [0.945, 1]);
  const frontLift = useTransform(p, [0, 0.24], [0, -8]);

  // Each reserved slot: what was there before, and what replaces it.
  const summaryOut = useTransform(p, [0.24, 0.34], [1, 0]);
  const payloadIn = useTransform(p, [0.3, 0.42], [0, 1]);
  const payloadY = useTransform(p, [0.3, 0.42], [12, 0]);
  const pinnedOut = useTransform(p, [0.42, 0.5], [1, 0]);
  const confirmIn = useTransform(p, [0.46, 0.56], [0, 1]);
  const confirmY = useTransform(p, [0.46, 0.56], [10, 0]);

  // Signing: a sheen crosses the approve button, then the seal replaces it.
  const sheenX = useTransform(p, [0.62, 0.8], ["-130%", "240%"]);
  const pendingOut = useTransform(p, [0.82, 0.9], [1, 0]);
  const sealIn = useTransform(p, [0.82, 0.9], [0, 1]);
  const sealY = useTransform(p, [0.82, 0.9], [10, 0]);
  const unsignedOut = useTransform(p, [0.6, 0.68], [1, 0]);
  const sigIn = useTransform(p, [0.64, 0.72], [0, 1]);
  const sigDraw = useTransform(p, [0.66, 0.84], [0, 1]);
  const receiptIn = useTransform(p, [0.84, 0.92], [0, 1]);

  const shown = still ? MARKS.length : stage;
  const typedNow = still ? CONFIRM_WORD.length : typed;

  return (
    <section
      ref={ref}
      aria-labelledby="approvals-title"
      className="relative bg-cream-deep/50 motion-safe:h-[300vh]"
    >
      <div className="flex flex-col justify-center px-4 py-24 motion-safe:sticky motion-safe:top-0 motion-safe:h-[100dvh] motion-safe:overflow-hidden motion-safe:py-0">
        <div className="mx-auto grid w-full max-w-6xl items-center gap-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,30rem)] lg:gap-16">
          <div className="text-center lg:text-left">
            <p className="inline-flex items-center gap-2 text-[11px] font-extrabold uppercase tracking-[0.22em] text-ink-soft">
              <span className="h-1.5 w-1.5 rounded-pill bg-signal" aria-hidden="true" />
              approvals
            </p>
            <MaskedLines
              as="h2"
              id="approvals-title"
              lines={["the approval", "is the product."]}
              className="mt-4 font-display text-[clamp(2.1rem,5.6vw,4.25rem)] font-bold leading-[0.97] tracking-[-0.035em] text-ink"
            />
            <p className="mx-auto mt-5 max-w-md text-sm font-semibold leading-relaxed text-ink-soft sm:text-base lg:mx-0">
              other products log what their agent did. this is the thing it has
              to get past first — and it is the same object whether the action
              costs nothing or ends a customer relationship.
            </p>

            {/* the narration, one line at a time, in reserved space */}
            <div className="mt-8 h-6" aria-live="polite">
              <motion.p
                key={shown}
                className="font-mono text-[11px] tracking-[0.04em] text-ink-soft"
                initial={still ? false : { opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.32, ease: EASE_OUT }}
              >
                {CAPTIONS[Math.min(shown, CAPTIONS.length - 1)]}
              </motion.p>
            </div>

            <div aria-hidden="true" className="mt-6 hidden items-center gap-1.5 lg:flex">
              {CAPTIONS.map((c, i) => (
                <span
                  key={c}
                  className={`h-1 rounded-pill transition-all duration-base ease-brand-out ${
                    i <= shown ? "w-7 bg-signal" : "w-3 bg-line"
                  }`}
                />
              ))}
            </div>

            {/* what is on the card, always — the part that doesn't change */}
            <dl className="mx-auto mt-10 hidden max-w-md grid-cols-2 gap-x-6 gap-y-4 text-left lg:mx-0 lg:grid">
              {CARD_ALWAYS.map(([term, detail]) => (
                <div key={term}>
                  <dt className="text-[11px] font-extrabold lowercase text-ink">{term}</dt>
                  <dd className="mt-0.5 text-[11px] font-semibold leading-relaxed text-ink-soft">
                    {detail}
                  </dd>
                </div>
              ))}
            </dl>
          </div>

          {/* ------------------------------------------------------ the deck */}
          <div className="relative mx-auto w-full max-w-[30rem]">
            {!still && (
              <>
                <motion.div
                  aria-hidden="true"
                  className="absolute inset-x-8 bottom-0"
                  style={{ y: deck2Y, opacity: deck2O }}
                >
                  <DeckCard />
                </motion.div>
                <motion.div
                  aria-hidden="true"
                  className="absolute inset-x-4 bottom-0"
                  style={{ y: deck1Y, opacity: deck1O }}
                >
                  <DeckCard />
                </motion.div>
              </>
            )}

            <motion.article
              aria-label="refund $96.00 to two customers"
              className="relative z-10 rounded-card bg-surface p-5 shadow-depth-lift"
              style={still ? undefined : { scale: frontScale, y: frontLift }}
            >
              <div className="flex items-start justify-between gap-3">
                <span className="inline-flex items-center gap-2 text-[11px] font-extrabold lowercase text-ink-soft">
                  <CosignoMark size={16} />
                  cosigno wants to
                </span>
                <TierChip tier="locked" />
              </div>

              <p className="mt-2.5 font-display text-xl font-bold leading-snug tracking-tight text-ink sm:text-2xl">
                refund $96.00 to two customers
              </p>
              <p className="mt-1.5 text-[11px] font-semibold lowercase text-ink-soft">
                stripe · 2 charges · cannot be undone
              </p>

              {/* slot one: the summary, replaced by the exact payload */}
              <div className="relative mt-4 h-[5.5rem]">
                {!still && (
                  <motion.div className="absolute inset-0" style={{ opacity: summaryOut }}>
                    <PayloadWell className="h-full">
                      2 charges · $96.00 total · both on invoice 2214
                      <br />
                      <span className="text-ink">every line is shown before you answer.</span>
                    </PayloadWell>
                  </motion.div>
                )}
                <motion.div
                  className="absolute inset-0"
                  style={still ? undefined : { opacity: payloadIn, y: payloadY }}
                >
                  <PayloadWell className="h-full">
                    ch_3PmQ1a → $48.00 · dana@northwind.co
                    <br />
                    ch_3PmQ7f → $48.00 · sam@lumen.io
                    <br />
                    reason: duplicate charge on invoice 2214
                  </PayloadWell>
                </motion.div>
              </div>

              {/* slot two: the tier note, replaced by the typed confirmation */}
              <div className="relative mt-3 h-[3.6rem]">
                {!still && (
                  <motion.p
                    className="absolute inset-x-0 top-2 text-[11px] font-semibold leading-relaxed text-ink-soft"
                    style={{ opacity: pinnedOut }}
                  >
                    read it, edit it, or throw it away. the mission is holding
                    either way.
                  </motion.p>
                )}
                <motion.div
                  className="absolute inset-0"
                  style={still ? undefined : { opacity: confirmIn, y: confirmY }}
                >
                  <span className="text-[10.5px] font-bold lowercase text-ink-soft">
                    this is a locked action. type its name to approve.
                  </span>
                  <div className="mt-1.5 flex h-9 items-center rounded-btn bg-cream-deep/70 px-3 shadow-well">
                    <span className="font-mono text-[13px] font-bold tracking-[0.14em] text-ink">
                      {CONFIRM_WORD.slice(0, typedNow)}
                    </span>
                    <span
                      aria-hidden="true"
                      className={`ml-0.5 h-4 w-[2px] bg-ink transition-opacity duration-fast ${
                        typedNow < CONFIRM_WORD.length
                          ? "opacity-100 motion-safe:animate-shimmer"
                          : "opacity-0"
                      }`}
                    />
                  </div>
                </motion.div>
              </div>

              {/* the answer row — one fixed-height slot, two states */}
              <div className="relative mt-4 h-11">
                <motion.div
                  className="absolute inset-0 flex items-center gap-2"
                  style={still ? { opacity: 0 } : { opacity: pendingOut }}
                >
                  <span className="relative inline-flex items-center gap-2 overflow-hidden rounded-btn bg-signal px-4 py-2.5 text-sm font-extrabold lowercase text-ink shadow-soft">
                    {/* the sheen that crosses the button as it is signed */}
                    {!still && (
                      <motion.span
                        aria-hidden="true"
                        className="absolute inset-y-0 w-1/2 -skew-x-12 bg-cream/45"
                        style={{ x: sheenX }}
                      />
                    )}
                    <span className="relative z-10 inline-flex items-center gap-2">
                      <DrawnCheck size={15} />
                      approve
                    </span>
                  </span>
                  <span className="rounded-btn px-3.5 py-2.5 text-sm font-bold lowercase text-ink ring-1 ring-inset ring-ink">
                    veto
                  </span>
                </motion.div>

                <motion.div
                  className="absolute inset-0 flex items-center"
                  style={still ? undefined : { opacity: sealIn, y: sealY }}
                >
                  <span className="inline-flex items-center gap-2 rounded-btn bg-signal/12 px-4 py-2.5 text-sm font-extrabold lowercase text-ink ring-1 ring-inset ring-signal/40">
                    <span className="text-signal">
                      <DrawnCheck size={16} drawn={shown >= 5} />
                    </span>
                    signed &amp; executed
                  </span>
                </motion.div>
              </div>

              {/* slot three: the empty signature line, then the hand */}
              <div className="relative mt-3 h-[3.4rem]">
                {!still && (
                  <motion.p
                    className="absolute inset-x-0 top-3 font-mono text-[10px] text-ink-soft"
                    style={{ opacity: unsignedOut }}
                  >
                    unsigned · nothing has run · no receipt exists yet
                  </motion.p>
                )}
                <motion.svg
                  aria-hidden="true"
                  viewBox="0 0 200 60"
                  className="absolute left-0 top-0 h-9 w-[200px] text-ink"
                  fill="none"
                  style={still ? undefined : { opacity: sigIn }}
                >
                  <motion.path
                    d={SIGNATURE_PATH}
                    stroke="currentColor"
                    strokeWidth={2.4}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    style={still ? { pathLength: 1 } : { pathLength: sigDraw }}
                  />
                </motion.svg>
                <motion.p
                  className="absolute inset-x-0 bottom-0 font-mono text-[10px] text-ink-soft"
                  style={still ? undefined : { opacity: receiptIn }}
                >
                  r_8f2c41 · signed by you · 11:01:38 · verified
                </motion.p>
              </div>
            </motion.article>
          </div>
        </div>
      </div>
    </section>
  );
}

/**
 * The two cards still waiting behind the one in focus. Only their bottom edge
 * is ever visible, so they carry no content — a card whose text bleeds out
 * from under the front one reads as a rendering fault, not as a deck.
 */
function DeckCard() {
  return <div className="h-24 rounded-card bg-surface shadow-depth" />;
}
