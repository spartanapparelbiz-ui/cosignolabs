"use client";

import { useEffect, useState } from "react";
import { CheckCircle2, ListChecks, PenLine, Search, ShieldCheck, Sparkles } from "lucide-react";

/**
 * First-time guided introduction — three short screens, shown once (a
 * localStorage flag). Plain language only: what to ask for, how the loop
 * works, and the control promise. Dismissable at every step; never blocks
 * a returning user.
 */

const SEEN_KEY = "cosigno_intro_seen";

const EXAMPLES = [
  "plan my weekend trip",
  "prepare tomorrow's meeting",
  "research the best laptop under $1,000",
  "review my inbox and prepare replies",
];

const PROCESS = [
  { icon: PenLine, text: "you give cosigno a goal" },
  { icon: ListChecks, text: "cosigno creates a plan" },
  { icon: Search, text: "cosigno begins preparing the work" },
  { icon: CheckCircle2, text: "you approve important actions" },
  { icon: ShieldCheck, text: "cosigno completes and verifies the task" },
];

export function FirstRunIntro() {
  const [screen, setScreen] = useState<0 | 1 | 2 | 3>(0); // 0 = hidden

  useEffect(() => {
    try {
      if (!window.localStorage.getItem(SEEN_KEY)) setScreen(1);
    } catch {
      // storage unavailable → never block the app
    }
  }, []);

  function dismiss() {
    try {
      window.localStorage.setItem(SEEN_KEY, "1");
    } catch {
      // ignore
    }
    setScreen(0);
  }

  if (screen === 0) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 p-4"
      role="dialog"
      aria-modal="true"
      aria-label="welcome to cosigno"
      onClick={dismiss}
    >
      <div
        className="w-full max-w-md animate-modal-in rounded-card bg-cream p-6 shadow-lift"
        onClick={(e) => e.stopPropagation()}
      >
        {screen === 1 && (
          <>
            <Sparkles size={20} className="text-signal" aria-hidden="true" />
            <h2 className="mt-2 font-display text-xl font-bold lowercase">what do you need handled?</h2>
            <p className="mt-1.5 text-sm font-semibold text-ink-soft">
              describe the result you want. cosigno will turn it into a clear
              plan and guide you through every step.
            </p>
            <div className="mt-3 flex flex-wrap gap-1.5">
              {EXAMPLES.map((ex) => (
                <span key={ex} className="rounded-pill bg-cream-deep px-2.5 py-1 text-xs font-semibold">
                  {ex}
                </span>
              ))}
            </div>
            <div className="mt-5 flex items-center gap-3">
              <button
                onClick={() => setScreen(2)}
                className="rounded-btn bg-signal px-5 py-2.5 text-sm font-extrabold text-ink"
              >
                see how it works
              </button>
              <button onClick={dismiss} className="text-sm font-bold lowercase text-ink-soft underline underline-offset-2">
                skip — start a mission
              </button>
            </div>
          </>
        )}

        {screen === 2 && (
          <>
            <h2 className="font-display text-xl font-bold lowercase">how a mission works</h2>
            <ol className="mt-4 flex flex-col gap-3">
              {PROCESS.map((step, i) => (
                <li key={step.text} className="flex items-center gap-3">
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-btn bg-cream-deep">
                    <step.icon size={15} aria-hidden="true" />
                  </span>
                  <span className="text-sm font-semibold">
                    {i + 1}. {step.text}
                  </span>
                </li>
              ))}
            </ol>
            <div className="mt-5 flex items-center gap-3">
              <button
                onClick={() => setScreen(3)}
                className="rounded-btn bg-signal px-5 py-2.5 text-sm font-extrabold text-ink"
              >
                one more thing
              </button>
              <button onClick={dismiss} className="text-sm font-bold lowercase text-ink-soft underline underline-offset-2">
                skip
              </button>
            </div>
          </>
        )}

        {screen === 3 && (
          <>
            <ShieldCheck size={20} className="text-signal" aria-hidden="true" />
            <h2 className="mt-2 font-display text-xl font-bold lowercase">you stay in control</h2>
            <p className="mt-1.5 text-sm font-semibold text-ink-soft">
              cosigno can research, organize, draft, and prepare automatically.
              before it sends, buys, books, publishes, deletes, or changes
              anything important, it asks you first.
            </p>
            <button
              onClick={dismiss}
              className="mt-5 rounded-btn bg-ink px-5 py-2.5 text-sm font-extrabold text-cream"
            >
              i understand — start a mission
            </button>
          </>
        )}
      </div>
    </div>
  );
}
