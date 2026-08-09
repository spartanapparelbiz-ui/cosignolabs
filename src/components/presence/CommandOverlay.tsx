"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { ArrowRight } from "lucide-react";
import { CosignoMark } from "@/components/brand/Logo";
import { classifyIntent, intentHref } from "@/lib/intent";
import type { CosignoState } from "@/lib/state";

/**
 * Activating cosigno. Not a chatbot in a sidebar: the user expresses intent
 * and THE INTERFACE BECOMES THE ANSWER — "what's waiting on me?" turns the
 * workspace into only the decisions; "show the launch" opens that mission's
 * environment; anything else is a delegation that flows into the normal
 * understand→plan pipeline. Routing is deterministic (src/lib/intent.ts).
 */

const SUGGESTIONS = [
  "What's waiting on me?",
  "What's happening?",
  "What did you finish today?",
  "What's blocked?",
  "Show my missions",
];

export function CommandOverlay({
  state,
  onClose,
}: {
  state: CosignoState | null;
  onClose(): void;
}) {
  const router = useRouter();
  const [text, setText] = useState("");
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    inputRef.current?.focus();
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const go = useCallback(
    (raw: string) => {
      const input = raw.trim();
      if (!input) return;
      router.push(intentHref(classifyIntent(input)));
      onClose();
    },
    [onClose, router]
  );

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-ink/45 p-4 pt-[14vh] backdrop-blur-[2px]"
      role="dialog"
      aria-modal="true"
      aria-label="cosigno"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="w-full max-w-xl animate-spring-in rounded-card bg-surface p-5 shadow-raise">
        <form
          className="flex items-center gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            go(text);
          }}
        >
          <CosignoMark size={22} />
          <input
            ref={inputRef}
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Tell cosigno what you need — or where to take you"
            className="min-w-0 flex-1 bg-transparent text-base font-semibold outline-none placeholder:text-ink-soft/60"
            maxLength={500}
            aria-label="tell cosigno what you need"
          />
          <button
            type="submit"
            disabled={!text.trim()}
            className="shrink-0 rounded-btn bg-ink p-2 text-cream disabled:bg-cream-deep disabled:text-ink-soft disabled:shadow-none disabled:cursor-not-allowed"
            aria-label="go"
          >
            <ArrowRight size={15} />
          </button>
        </form>

        {state && (
          <p className="mt-3 text-[0.75rem] font-bold uppercase tracking-[0.1em] text-ink-soft">
            {state.moving} moving · {state.need_you} need you · {state.watching} watching ·{" "}
            {state.blocked} blocked
          </p>
        )}

        <div className="mt-3 flex flex-wrap gap-1.5">
          {SUGGESTIONS.map((s) => (
            <button
              key={s}
              onClick={() => go(s)}
              className="rounded-pill bg-cream-deep px-3 py-1 text-xs font-bold text-ink-soft transition-colors hover:text-ink"
            >
              {s}
            </button>
          ))}
        </div>

        <p className="mt-3 text-[0.75rem] font-semibold text-ink-soft/70">
          Anything else becomes a delegation — cosigno shows you its plan before it starts.
        </p>
      </div>
    </div>,
    document.body
  );
}
