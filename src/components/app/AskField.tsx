"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Mic, Slash, Sparkles } from "lucide-react";
import {
  applySuggestion,
  autocompleteAt,
  mentionedApps,
  type AutocompleteState,
  type MentionApp,
} from "@/lib/compose/autocomplete";
import { ConnectorLogo } from "@/components/integrations/ConnectorLogo";

/**
 * The ask field: one line of natural language, with the affordances that make
 * it faster than a chat box.
 *
 *   /            a slash at the start opens the ways of working
 *   @            names a connected app the request should use
 *   ↑ ↓ ⏎ esc    drive the suggestion list without leaving the keyboard
 *   voice        dictation, where the browser actually supports it
 *
 * Two decisions worth stating. The field stays a plain <input> holding plain
 * text: mentions are a typing aid, not a rich-text token model, so what gets
 * sent is exactly what the person can see and edit, and a pasted request
 * behaves the same as a typed one.
 *
 * And the mic only appears where dictation genuinely works. A permanently
 * disabled microphone in a browser without speech recognition is a promise
 * the product can't keep, so the control is absent rather than dead.
 */

/* The Web Speech API is not in the DOM lib and is prefixed in Chromium. */
interface SpeechRecognitionLike {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  start(): void;
  stop(): void;
  onresult: ((e: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null;
  onerror: (() => void) | null;
  onend: (() => void) | null;
}
type SpeechCtor = new () => SpeechRecognitionLike;

function speechCtor(): SpeechCtor | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as {
    SpeechRecognition?: SpeechCtor;
    webkitSpeechRecognition?: SpeechCtor;
  };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

export function AskField({
  value,
  onChange,
  onSubmit,
  apps,
  busy,
  placeholder = "ask cosigno anything…",
}: {
  value: string;
  onChange: (next: string) => void;
  onSubmit: () => void;
  /** Connected apps, offered after an @. */
  apps: MentionApp[];
  busy?: boolean;
  placeholder?: string;
}) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [ac, setAc] = useState<AutocompleteState | null>(null);
  const [active, setActive] = useState(0);
  const [listening, setListening] = useState(false);
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const [canDictate, setCanDictate] = useState(false);

  // Resolved after mount: whether the browser has speech recognition is not
  // knowable on the server, and rendering the control then removing it would
  // shift the control row under the user's cursor.
  useEffect(() => setCanDictate(speechCtor() !== null), []);

  const refresh = useCallback(
    (next: string, caret: number) => {
      const state = autocompleteAt(next, caret, apps);
      setAc(state);
      setActive(0);
    },
    [apps]
  );

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const next = e.target.value;
    onChange(next);
    refresh(next, e.target.selectionStart ?? next.length);
  }

  function pick(index: number) {
    if (!ac) return;
    const suggestion = ac.suggestions[index];
    if (!suggestion) return;
    const out = applySuggestion(value, ac, suggestion);
    onChange(out.value);
    setAc(null);
    requestAnimationFrame(() => {
      const el = inputRef.current;
      if (!el) return;
      el.focus();
      el.setSelectionRange(out.caret, out.caret);
    });
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (ac) {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setActive((i) => (i + 1) % ac.suggestions.length);
        return;
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        setActive((i) => (i - 1 + ac.suggestions.length) % ac.suggestions.length);
        return;
      }
      if (e.key === "Enter" || e.key === "Tab") {
        e.preventDefault();
        pick(active);
        return;
      }
      if (e.key === "Escape") {
        e.preventDefault();
        setAc(null);
        return;
      }
    }
    if (e.key === "Enter") onSubmit();
  }

  /* ------------------------------- dictation ------------------------------ */

  function toggleDictation() {
    if (listening) {
      recognitionRef.current?.stop();
      return;
    }
    const Ctor = speechCtor();
    if (!Ctor) return;
    const rec = new Ctor();
    rec.continuous = false;
    rec.interimResults = false;
    rec.lang = navigator.language || "en-US";
    rec.onresult = (event) => {
      const said = Array.from({ length: event.results.length }, (_, i) => event.results[i][0].transcript)
        .join(" ")
        .trim();
      if (said) onChange(value ? `${value} ${said}` : said);
    };
    // A refused microphone permission ends the same way a finished sentence
    // does — the control returns to its resting state rather than sitting
    // lit forever waiting for audio that will never arrive.
    rec.onerror = () => setListening(false);
    rec.onend = () => setListening(false);
    recognitionRef.current = rec;
    setListening(true);
    rec.start();
  }

  useEffect(() => () => recognitionRef.current?.stop(), []);

  const named = mentionedApps(value, apps);

  return (
    <div className="relative">
      <div className="flex flex-col gap-2.5 sm:flex-row">
        <div className="relative min-w-0 flex-1">
          <input
            ref={inputRef}
            id="cosigno-ask"
            value={value}
            onChange={handleChange}
            onKeyDown={onKeyDown}
            onBlur={() => {
              // Let a click on the panel land before it closes.
              window.setTimeout(() => setAc(null), 120);
            }}
            onClick={(e) =>
              refresh(value, (e.target as HTMLInputElement).selectionStart ?? value.length)
            }
            maxLength={500}
            placeholder={placeholder}
            aria-label="what do you need handled"
            aria-autocomplete="list"
            aria-expanded={Boolean(ac)}
            aria-controls={ac ? "cosigno-ask-suggestions" : undefined}
            role="combobox"
            autoComplete="off"
            className={`w-full rounded-btn bg-cream/40 py-3.5 pl-4 text-base font-semibold shadow-well ring-1 ring-inset ring-line/70 transition-shadow duration-fast placeholder:font-medium placeholder:text-ink-soft/60 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-signal ${
              canDictate ? "pr-11" : "pr-4"
            }`}
          />
          {canDictate && (
            <button
              type="button"
              onClick={toggleDictation}
              aria-pressed={listening}
              aria-label={listening ? "stop dictating" : "dictate your request"}
              className={`absolute right-2 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-btn transition-colors duration-fast ${
                listening
                  ? "bg-signal/15 text-signal"
                  : "text-ink-soft hover:bg-cream-deep hover:text-ink"
              }`}
            >
              {/* Idle is a plain mic: the control is available, so a crossed-out
                  glyph would read as "dictation is unavailable" on the one
                  browser where it isn't. Listening adds the halo and the
                  signal colour — the state where the microphone is genuinely
                  open is the state that should be impossible to miss. */}
              <Mic size={15} strokeWidth={2.4} />
              {listening && (
                <span
                  className="absolute inset-0 animate-status-ping rounded-btn"
                  aria-hidden="true"
                />
              )}
            </button>
          )}
        </div>
        <button
          onClick={onSubmit}
          disabled={busy || !value.trim()}
          className="inline-flex shrink-0 items-center justify-center gap-1.5 rounded-btn bg-signal px-6 py-3.5 text-base font-extrabold text-on-signal shadow-soft transition-[transform,box-shadow] duration-fast ease-brand-out hover:-translate-y-px hover:shadow-lift active:translate-y-0 active:scale-95 disabled:translate-y-0 disabled:bg-cream-deep disabled:text-ink-soft disabled:shadow-none disabled:cursor-not-allowed motion-reduce:hover:translate-y-0"
        >
          <Sparkles size={16} aria-hidden="true" /> {busy ? "reading…" : "delegate"}
        </button>
      </div>

      {/* What the sentence will use — echoed back so a mention is visibly
          understood before anything is committed to. */}
      {named.length > 0 && (
        <div className="mt-2 flex flex-wrap items-center gap-1.5">
          <span className="text-[10px] font-extrabold uppercase tracking-widest text-ink-soft">
            using
          </span>
          {named.map((a) => (
            <span
              key={a.handle}
              className="inline-flex animate-pop-in items-center gap-1.5 rounded-pill bg-surface/80 py-0.5 pl-0.5 pr-2 text-[11px] font-bold shadow-e1"
            >
              <ConnectorLogo kind="app" providerKey={a.providerKey} displayName={a.name} size={16} />
              {a.name}
            </span>
          ))}
        </div>
      )}

      {ac && (
        <ul
          id="cosigno-ask-suggestions"
          role="listbox"
          className="absolute left-0 right-0 top-full z-20 mt-1.5 max-h-64 animate-pop-in overflow-auto rounded-card bg-surface p-1 shadow-e4 ring-1 ring-inset ring-line/60"
        >
          {ac.suggestions.map((s, i) => (
            <li key={s.kind === "slash" ? s.command.name : s.app.handle}>
              <button
                type="button"
                role="option"
                aria-selected={i === active}
                onMouseEnter={() => setActive(i)}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => pick(i)}
                className={`flex w-full items-center gap-2.5 rounded-btn px-2.5 py-2 text-left transition-colors duration-fast ${
                  i === active ? "bg-cream-deep" : "hover:bg-cream-deep/60"
                }`}
              >
                {s.kind === "slash" ? (
                  <>
                    <span
                      className="flex h-6 w-6 shrink-0 items-center justify-center rounded-btn bg-cream-deep text-ink-soft"
                      aria-hidden="true"
                    >
                      <Slash size={12} strokeWidth={2.6} />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-xs font-extrabold">/{s.command.name}</span>
                      <span className="block truncate text-[11px] font-semibold text-ink-soft">
                        {s.command.detail}
                      </span>
                    </span>
                  </>
                ) : (
                  <>
                    <ConnectorLogo
                      kind="app"
                      providerKey={s.app.providerKey}
                      displayName={s.app.name}
                      size={24}
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block text-xs font-extrabold">{s.app.name}</span>
                      <span className="block truncate font-mono text-[11px] text-ink-soft">
                        @{s.app.handle}
                      </span>
                    </span>
                  </>
                )}
              </button>
            </li>
          ))}
          <li className="px-2.5 pb-1 pt-1.5 text-[10px] font-bold lowercase text-ink-soft/70">
            ↑↓ to choose · ⏎ to insert · esc to dismiss
          </li>
        </ul>
      )}
    </div>
  );
}
