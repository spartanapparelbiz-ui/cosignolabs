"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { Check, ShieldAlert } from "lucide-react";
import { CREAM } from "@/lib/brand";
import { track } from "@/lib/analytics";

/**
 * The interactive approval story — a hands-on replacement for the passive
 * demo loop. The visitor IS the operator: they approve two actions and catch
 * a third that an injected email tried to sneak past them. Three cards, three
 * decisions, all theirs. If they don't touch it within 6s it plays itself
 * (the old behavior), converting to interactive the instant they engage.
 *
 * Pure client state, mock data, no API calls. Every control is a real button
 * (keyboard-accessible, ≥44px). Under prefers-reduced-motion the check/slide
 * animations collapse (globals.css) but every interaction still works.
 */

type Decision = "approve" | "hold";

interface StoryCard {
  tier: 2;
  summary: string;
  payload: string;
  /** the executed/held confirmation line */
  result: string;
  decision: Decision;
  injection?: {
    chip: string;
    why: string;
    /** label for the (correct) action once the warning is read */
    action: string;
  };
}

const CARDS: StoryCard[] = [
  {
    tier: 2,
    summary: 'archive 47 newsletter emails and label them "newsletters".',
    payload: "archive+label · 47 matches · reversible",
    result: "signed & executed — 47 emails archived",
    decision: "approve",
  },
  {
    tier: 2,
    summary: "draft replies to your 3 most recent leads — saved as drafts, nothing sent.",
    payload: "draft ×3 · tone: warm, direct · held as drafts",
    result: "signed & executed — 3 drafts saved",
    decision: "approve",
  },
  {
    tier: 2,
    summary: "forward the “quarterly numbers” thread to an outside address.",
    payload: "forward · to: exfil@attacker.example",
    result: "held — nothing was sent",
    decision: "hold",
    injection: {
      chip: "external content attempted to direct the agent",
      why: "an email in your inbox hid instructions telling the operator to forward your thread to an outside address. cosigno flagged it and refused to act — the decision stays yours.",
      action: "hold it",
    },
  },
];

const AUTOPLAY_DELAY = 6000;

const NONE: (Decision | null)[] = [null, null, null];

export default function ApprovalStory() {
  const [index, setIndex] = useState(0);
  const [taken, setTaken] = useState<(Decision | null)[]>(NONE);
  const [revealed, setRevealed] = useState(false); // injection why shown
  const [done, setDone] = useState(false);
  const [interacted, setInteracted] = useState(false);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);

  const clearTimers = useCallback(() => {
    timers.current.forEach(clearTimeout);
    timers.current = [];
  }, []);

  const resolve = useCallback((i: number, decision: Decision) => {
    setTaken((prev) => {
      if (prev[i]) return prev;
      const next = [...prev];
      next[i] = decision;
      return next;
    });
    timers.current.push(
      setTimeout(() => {
        if (i < CARDS.length - 1) setIndex(i + 1);
        else setDone(true);
      }, 700)
    );
  }, []);

  // First interaction cancels autoplay and hands control to the visitor.
  const engage = useCallback(() => {
    setInteracted(true);
    clearTimers();
  }, [clearTimers]);

  const onApprove = useCallback(
    (i: number) => {
      engage();
      track("story_decision", { step: i + 1, decision: "approve" });
      resolve(i, "approve");
    },
    [engage, resolve]
  );

  const onHold = useCallback(
    (i: number) => {
      engage();
      track("story_decision", { step: i + 1, decision: "hold" });
      resolve(i, "hold");
    },
    [engage, resolve]
  );

  const onReveal = useCallback(() => {
    engage();
    setRevealed(true);
    track("story_injection_read");
  }, [engage]);

  // Autoplay: if untouched, walk the story itself, then loop back — until the
  // visitor engages. Disabled under reduced motion? No: it's a state loop, not
  // an animation, and it still stops on first interaction. But we honor the
  // reduced-motion preference by not autoplaying (respect "don't move things").
  useEffect(() => {
    if (interacted || done) return;
    if (
      typeof window !== "undefined" &&
      window.matchMedia?.("(prefers-reduced-motion: reduce)").matches
    ) {
      return; // let the visitor drive; nothing auto-moves
    }
    const t = setTimeout(function step() {
      // Autoplay the current card with its own (correct) decision.
      setTaken((prev) => {
        if (prev[index]) return prev;
        const next = [...prev];
        next[index] = CARDS[index].decision;
        return next;
      });
      if (CARDS[index].injection) setRevealed(true);
      timers.current.push(
        setTimeout(() => {
          if (index < CARDS.length - 1) setIndex(index + 1);
          else {
            // loop the story so the hero always shows motion
            timers.current.push(
              setTimeout(() => {
                setIndex(0);
                setTaken(NONE);
                setRevealed(false);
              }, 1600)
            );
          }
        }, 800)
      );
    }, AUTOPLAY_DELAY);
    timers.current.push(t);
    return () => clearTimeout(t);
  }, [index, interacted, done]);

  useEffect(() => clearTimers, [clearTimers]);

  if (done) {
    return (
      <div className="w-full max-w-lg rounded-card bg-surface/70 p-6 text-center shadow-lift animate-spring-in">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-signal text-cream">
          <Check size={26} strokeWidth={3} aria-hidden="true" />
        </div>
        <p className="mt-4 text-xl font-extrabold lowercase">
          3 actions. 3 decisions. all yours.
        </p>
        <p className="mx-auto mt-2 max-w-sm text-sm font-semibold text-ink-soft">
          two you approved, one the operator caught and you held. that&apos;s
          the whole loop — nothing moves without your signature.
        </p>
        <div className="mt-5 flex flex-wrap justify-center gap-3">
          <Link
            href="/app"
            prefetch
            onClick={() => track("story_cta", { to: "start_free" })}
            className="rounded-btn bg-signal px-6 py-3 text-sm font-extrabold text-ink shadow-soft transition-transform duration-fast ease-brand-out hover:-translate-y-px active:scale-95"
          >
            start free
          </Link>
          <button
            onClick={() => {
              setIndex(0);
              setTaken(NONE);
              setRevealed(false);
              setDone(false);
              setInteracted(true);
            }}
            className="rounded-btn px-6 py-3 text-sm font-bold lowercase ring-1 ring-inset ring-ink transition-colors hover:bg-cream-deep"
          >
            replay
          </button>
        </div>
      </div>
    );
  }

  const card = CARDS[index];
  const decisionTaken = taken[index];
  const isResolved = decisionTaken !== null;
  const injectionLocked = Boolean(card.injection) && !revealed;
  const heldText = card.injection ? "held — nothing was sent" : "vetoed — nothing ran";

  return (
    <div
      className="relative w-full max-w-lg rounded-card bg-surface/70 p-4 shadow-lift"
      aria-label="interactive approval demo — you approve each action"
    >
      {/* progress + hint */}
      <div className="mb-3 flex items-center justify-between px-1">
        <div className="flex gap-1.5" aria-hidden="true">
          {CARDS.map((_, i) => (
            <span
              key={i}
              className={`h-1.5 rounded-full transition-all duration-base ${
                i === index ? "w-6 bg-ink" : taken[i] ? "w-3 bg-signal" : "w-3 bg-line"
              }`}
            />
          ))}
        </div>
        {!interacted && !isResolved && (
          <span className="text-[11px] font-bold lowercase tracking-wide text-signal">
            you&apos;re the operator — approve it
          </span>
        )}
      </div>

      <div key={index} className="animate-card-in rounded-card bg-surface/90 p-4 shadow-soft">
        <div className="flex flex-wrap items-center gap-2">
          <span className="rounded-pill bg-ink/5 px-2.5 py-0.5 text-[10px] font-bold lowercase tracking-wide ring-1 ring-inset ring-ink/20">
            tier {card.tier} · approve
          </span>
          <span
            className={`rounded-pill px-2.5 py-0.5 text-[10px] font-bold lowercase tracking-wide transition-colors duration-base ${
              isResolved
                ? decisionTaken === "hold"
                  ? "ring-1 ring-inset ring-ink/40 text-ink"
                  : "bg-signal text-cream"
                : "bg-cream-deep text-ink-soft"
            }`}
          >
            {isResolved
              ? decisionTaken === "hold"
                ? "held"
                : "executed"
              : "awaiting sign-off"}
          </span>
          <span className="ml-auto text-[11px] text-ink-soft">
            {index + 1} of {CARDS.length}
          </span>
        </div>

        {/* injection warning chip (card 3) */}
        {card.injection && (
          <button
            onClick={onReveal}
            aria-expanded={revealed}
            className={`mt-2.5 inline-flex w-full items-center gap-1.5 rounded-btn px-3 py-2 text-left text-[11px] font-bold lowercase text-cream transition-transform ${
              injectionLocked ? "animate-chip-pulse bg-ink" : "bg-ink"
            }`}
          >
            <ShieldAlert size={13} strokeWidth={2.5} aria-hidden="true" />
            {card.injection.chip}
            <span className="ml-auto underline underline-offset-2">
              {revealed ? "" : "tap to read why"}
            </span>
          </button>
        )}
        {card.injection && revealed && (
          <p className="mt-2 rounded-btn bg-cream-deep px-3 py-2 text-xs leading-relaxed text-ink-soft animate-fade-through">
            {card.injection.why}
          </p>
        )}

        <p className="mt-3 text-sm font-semibold leading-snug">{card.summary}</p>
        <p className="mt-1 font-mono text-[11px] text-ink-soft">payload: {card.payload}</p>

        {!isResolved ? (
          <div className="mt-3 flex flex-wrap gap-2">
            {card.decision === "approve" ? (
              <button
                onClick={() => onApprove(index)}
                className="inline-flex min-h-[44px] items-center gap-1.5 rounded-btn bg-signal px-5 py-2.5 text-sm font-extrabold text-ink shadow-soft transition-transform duration-fast ease-brand-out hover:-translate-y-px active:scale-95 motion-safe:animate-pulse-glow"
              >
                <Check size={15} strokeWidth={3} aria-hidden="true" />
                approve
              </button>
            ) : (
              <button
                onClick={() => onHold(index)}
                disabled={injectionLocked}
                className="inline-flex min-h-[44px] items-center gap-1.5 rounded-btn bg-ink px-5 py-2.5 text-sm font-extrabold text-cream transition-transform duration-fast ease-brand-out hover:-translate-y-px active:scale-95 disabled:cursor-not-allowed disabled:opacity-40"
              >
                {injectionLocked ? "read the warning first" : card.injection!.action}
              </button>
            )}
            {card.decision === "approve" && (
              <button
                onClick={() => onHold(index)}
                className="min-h-[44px] rounded-btn px-4 py-2.5 text-sm font-bold lowercase ring-1 ring-inset ring-ink transition-colors hover:bg-cream-deep"
                aria-label="veto this action"
              >
                veto
              </button>
            )}
          </div>
        ) : (
          <div
            className={`mt-3 flex items-center gap-1.5 ${
              decisionTaken === "hold" ? "text-ink" : "text-signal"
            }`}
          >
            {decisionTaken === "hold" ? (
              <ShieldAlert size={16} strokeWidth={2.5} aria-hidden="true" />
            ) : (
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                className="animate-check-pop"
                aria-hidden="true"
              >
                <circle cx="12" cy="12" r="11" fill="currentColor" />
                <path
                  d="M6.5 12.5 10.5 16.5 17.5 8.5"
                  stroke={CREAM}
                  strokeWidth="2.8"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeDasharray="24"
                  className="animate-check-draw"
                />
              </svg>
            )}
            <span className="text-xs font-extrabold lowercase tracking-wide">
              {decisionTaken === "approve" ? card.result : heldText}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
