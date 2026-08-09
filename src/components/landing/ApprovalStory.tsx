"use client";

import { useCallback, useRef, useState } from "react";
import { ShieldAlert } from "lucide-react";
import { track } from "@/lib/analytics";

/**
 * §3 — the demo. The visitor IS the operator and walks the exact scripted
 * sequence, learning each tier by doing it:
 *
 *   context   tier 1 · auto     — already executed (archived 24 newsletters)
 *   card 1    tier 2 · approve  — draft 3 replies → click approve → stamp
 *   card 2    tier 3 · locked   — refund $48.00 → TYPE `confirm` → stamp
 *   card 3    tier 2 · approve  — an injected email's action → VETO it
 *
 * Pure client state, no network, no account. Every control is a real button
 * / labelled input, keyboard-operable, ≥44px. The "signed" stamp is the one
 * animation; under reduced motion it simply appears. Fires the funnel events
 * demo_started (first interaction), injection_caught (veto card 3), and
 * demo_completed (card 3 resolved).
 */

type Kind = "approve" | "locked" | "injection";

interface StoryCard {
  kind: Kind;
  tierLabel: string;
  summary: string;
  payload: string;
  result: string;
}

const CARDS: StoryCard[] = [
  {
    kind: "approve",
    tierLabel: "tier 2 · approve",
    summary: "Draft replies to your 3 most recent leads — saved as drafts, nothing sent.",
    payload: "gmail.draft ×3 · tone: warm, direct · held as drafts",
    result: "signed & executed — 3 drafts saved",
  },
  {
    kind: "locked",
    tierLabel: "tier 3 · locked",
    summary: "Refund $48.00 to the customer on order #2231.",
    payload: "shopify.refund · $48.00 · order #2231 · irreversible",
    result: "signed & executed — refund issued",
  },
  {
    kind: "injection",
    tierLabel: "tier 2 · approve",
    summary: "Forward the “quarterly numbers” thread to an outside address.",
    payload: "gmail.forward · to: partner@external.example",
    result: "vetoed — nothing ran",
  },
];

/** The signed seal — the one ownable gesture, reused across every card. */
function Stamp() {
  return (
    <span
      className="inline-flex h-8 w-8 shrink-0 rotate-[-8deg] items-center justify-center rounded-pill bg-signal text-cream shadow-soft motion-safe:animate-check-pop"
      aria-hidden="true"
    >
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
        <path
          d="M5 12.5 10 17.5 19 6.5"
          stroke="rgb(var(--c-cream))"
          strokeWidth="3"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeDasharray="24"
          className="motion-safe:animate-check-draw"
        />
      </svg>
    </span>
  );
}

const NONE = [false, false, false];

export default function ApprovalStory() {
  const [index, setIndex] = useState(0);
  const [done, setDone] = useState(NONE); // per-card resolved
  const [started, setStarted] = useState(false);
  const [confirmText, setConfirmText] = useState("");
  const [revealed, setRevealed] = useState(false); // injection explainer
  const [finished, setFinished] = useState(false);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);

  const engage = useCallback(() => {
    setStarted((was) => {
      if (!was) track("demo_started");
      return true;
    });
  }, []);

  const advance = useCallback((i: number) => {
    setDone((prev) => {
      if (prev[i]) return prev;
      const next = [...prev];
      next[i] = true;
      return next;
    });
    timers.current.push(
      setTimeout(() => {
        if (i < CARDS.length - 1) setIndex(i + 1);
        else {
          track("demo_completed");
          setFinished(true);
        }
      }, 750)
    );
  }, []);

  const onApprove = useCallback(
    (i: number) => {
      engage();
      track("story_decision", { step: i + 1, decision: "approve" });
      advance(i);
    },
    [engage, advance]
  );

  const onConfirmRefund = useCallback(
    (i: number) => {
      engage();
      if (confirmText.trim().toLowerCase() !== "confirm") return;
      track("story_decision", { step: i + 1, decision: "confirm" });
      advance(i);
    },
    [engage, advance, confirmText]
  );

  const onVetoInjection = useCallback(
    (i: number) => {
      engage();
      track("injection_caught");
      advance(i);
    },
    [engage, advance]
  );

  const reset = useCallback(() => {
    timers.current.forEach(clearTimeout);
    timers.current = [];
    setIndex(0);
    setDone(NONE);
    setConfirmText("");
    setRevealed(false);
    setFinished(false);
    setStarted(true);
  }, []);

  if (finished) {
    return (
      <div className="w-full max-w-lg rounded-card bg-surface/70 p-6 text-center shadow-lift motion-safe:animate-spring-in">
        <div className="mx-auto flex justify-center">
          <Stamp />
        </div>
        <p className="mt-4 text-xl font-extrabold lowercase">
          three tiers. three decisions. all yours.
        </p>
        <p className="mx-auto mt-2 max-w-sm text-sm font-semibold text-ink-soft">
          you approved one, typed to authorize a refund, and vetoed the action
          an injected email tried to slip past you. nothing moved without your
          signature.
        </p>
        <div className="mt-5 flex flex-wrap justify-center gap-3">
          <a
            href="/sign-up"
            onClick={() => track("story_cta", { to: "signup" })}
            className="rounded-btn bg-signal px-6 py-3 text-sm font-extrabold text-ink shadow-soft transition-transform duration-fast ease-brand-out hover:-translate-y-px active:scale-95"
          >
            start with cosigno
          </a>
          <button
            onClick={reset}
            className="rounded-btn px-6 py-3 text-sm font-bold lowercase ring-1 ring-inset ring-ink transition-colors hover:bg-cream-deep"
          >
            replay
          </button>
        </div>
      </div>
    );
  }

  const card = CARDS[index];
  const resolved = done[index];

  return (
    <div
      className="relative w-full max-w-lg rounded-card bg-surface/70 p-4 shadow-lift"
      aria-label="interactive approval demo — you make each decision"
    >
      {/* context: an auto-tier action already ran, establishing the tiers */}
      <div className="mb-3 flex items-center gap-2 rounded-btn bg-cream-deep/70 px-3 py-2">
        <Stamp />
        <div className="min-w-0">
          <p className="truncate text-xs font-bold lowercase">
            archived 24 newsletters
          </p>
          <p className="font-mono text-[10px] text-ink-soft">tier 1 · auto · executed</p>
        </div>
        <span className="ml-auto text-[10px] font-bold lowercase text-ink-soft">
          nothing to approve — it&apos;s in your auto tier
        </span>
      </div>

      {/* progress + hint */}
      <div className="mb-3 flex items-center justify-between px-1">
        <div className="flex gap-1.5" aria-hidden="true">
          {CARDS.map((_, i) => (
            <span
              key={i}
              className={`h-1.5 rounded-pill transition-all duration-base ${
                i === index ? "w-6 bg-ink" : done[i] ? "w-3 bg-signal" : "w-3 bg-line"
              }`}
            />
          ))}
        </div>
        {!started && (
          <span className="text-[11px] font-bold lowercase tracking-wide text-signal">
            you&apos;re the operator — your move
          </span>
        )}
      </div>

      <div key={index} className="rounded-card bg-surface/90 p-4 shadow-soft motion-safe:animate-card-in">
        <div className="flex flex-wrap items-center gap-2">
          <span className="rounded-pill bg-ink/5 px-2.5 py-0.5 text-[10px] font-bold lowercase tracking-wide ring-1 ring-inset ring-ink/20">
            {card.tierLabel}
          </span>
          <span
            className={`rounded-pill px-2.5 py-0.5 text-[10px] font-bold lowercase tracking-wide transition-colors duration-base ${
              resolved
                ? card.kind === "injection"
                  ? "ring-1 ring-inset ring-ink/40 text-ink"
                  : "bg-signal text-cream"
                : "bg-cream-deep text-ink-soft"
            }`}
          >
            {resolved
              ? card.kind === "injection"
                ? "vetoed"
                : "executed"
              : "awaiting sign-off"}
          </span>
          <span className="ml-auto text-[11px] text-ink-soft">
            {index + 1} of {CARDS.length}
          </span>
        </div>

        {/* injection warning */}
        {card.kind === "injection" && (
          <button
            onClick={() => {
              engage();
              setRevealed((r) => !r);
            }}
            aria-expanded={revealed}
            className="mt-2.5 inline-flex w-full items-center gap-1.5 rounded-btn bg-ink px-3 py-2 text-left text-[11px] font-bold lowercase text-cream"
          >
            <ShieldAlert size={13} strokeWidth={2.5} aria-hidden="true" />
            this action originated from message content, not from you.
            <span className="ml-auto underline underline-offset-2">
              {revealed ? "" : "why?"}
            </span>
          </button>
        )}
        {card.kind === "injection" && revealed && (
          <p className="mt-2 rounded-btn bg-cream-deep px-3 py-2 text-xs leading-relaxed text-ink-soft motion-safe:animate-fade-through">
            that email tried to use the agent as its hands. the agent can&apos;t
            act on its own say-so — so you caught it.
          </p>
        )}

        <p className="mt-3 text-sm font-semibold leading-snug">{card.summary}</p>
        <p className="mt-1 font-mono text-[11px] text-ink-soft">payload: {card.payload}</p>

        {resolved ? (
          <div
            className={`mt-3 flex items-center gap-2 ${
              card.kind === "injection" ? "text-ink" : "text-signal"
            }`}
          >
            {card.kind === "injection" ? (
              <ShieldAlert size={16} strokeWidth={2.5} aria-hidden="true" />
            ) : (
              <Stamp />
            )}
            <span className="text-xs font-extrabold lowercase tracking-wide">
              {card.result}
            </span>
          </div>
        ) : card.kind === "approve" ? (
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              onClick={() => onApprove(index)}
              className="inline-flex min-h-[44px] items-center gap-1.5 rounded-btn bg-signal px-5 py-2.5 text-sm font-extrabold text-ink shadow-soft transition-transform duration-fast ease-brand-out hover:-translate-y-px active:scale-95"
            >
              approve
            </button>
            <button
              onClick={() => onVetoInjection(index)}
              className="min-h-[44px] rounded-btn px-4 py-2.5 text-sm font-bold lowercase ring-1 ring-inset ring-ink transition-colors hover:bg-cream-deep"
              aria-label="veto this action"
            >
              veto
            </button>
          </div>
        ) : card.kind === "locked" ? (
          <div className="mt-3">
            <label
              htmlFor="confirm-refund"
              className="text-[11px] font-bold lowercase tracking-wide text-ink-soft"
            >
              locked — type <span className="font-mono text-ink">confirm</span> to authorize
            </label>
            <div className="mt-1.5 flex flex-wrap gap-2">
              <input
                id="confirm-refund"
                value={confirmText}
                onChange={(e) => {
                  engage();
                  setConfirmText(e.target.value);
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter") onConfirmRefund(index);
                }}
                placeholder="confirm"
                autoComplete="off"
                className="min-h-[44px] flex-1 rounded-btn bg-cream-deep px-3 py-2 font-mono text-sm shadow-soft placeholder:text-ink-soft/50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-signal"
              />
              <button
                onClick={() => onConfirmRefund(index)}
                disabled={confirmText.trim().toLowerCase() !== "confirm"}
                className="inline-flex min-h-[44px] items-center gap-1.5 rounded-btn bg-ink px-5 py-2.5 text-sm font-extrabold text-cream transition-transform duration-fast ease-brand-out hover:-translate-y-px active:scale-95 disabled:bg-cream-deep disabled:text-ink-soft disabled:shadow-none disabled:cursor-not-allowed"
              >
                authorize refund
              </button>
            </div>
          </div>
        ) : (
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              onClick={() => onVetoInjection(index)}
              className="inline-flex min-h-[44px] items-center gap-1.5 rounded-btn bg-ink px-5 py-2.5 text-sm font-extrabold text-cream transition-transform duration-fast ease-brand-out hover:-translate-y-px active:scale-95"
            >
              veto it
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
