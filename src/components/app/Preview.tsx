"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowDown, ArrowRight, Check, Info, Loader2, TriangleAlert } from "lucide-react";
import { PREVIEW_EXAMPLES } from "./previewExamples";

/**
 * Preview — "what happens if I turn this on?"
 *
 * The page answers that one question and nothing else. Someone writes a rule
 * in their own words, sees the change it would make, sees it play out over
 * work they already recognise, and decides. Nobody is asked to learn a
 * vocabulary to use it, and nothing about the machinery underneath appears on
 * screen.
 *
 * What IS on screen is real: the preview runs the same path a live action
 * takes (see /api/rules/check), so the change shown here is the change that
 * will happen. That is the whole promise of the page, and it is why the honest
 * notes — a rule that reaches further than it looks, or one that can't reach
 * anything yet — are said plainly rather than dropped for the sake of a
 * cleaner screen.
 */

interface Affected {
  id: string;
  summary: string;
  created_at: string;
  from: string;
  to: string;
}

/** The rule, said back in the terms that decide what happens. */
interface RuleReading {
  action: string;
  requirement: string;
  scope: string;
  qualifier?: string;
  broad: boolean;
}

/** Where a rule reaches today, and where it doesn't. */
interface Coverage {
  covered: { provider: string; label: string; capabilities: number }[];
  noConnector: { provider: string; label: string }[];
  noSuchCapability: { provider: string; label: string }[];
  viaOwnWork: boolean;
  unreachable: boolean;
}

interface CheckResult {
  rule: {
    text: string;
    description: string;
    requirement: string;
    confidence: "high" | "low";
    reading: RuleReading;
  };
  checked: number;
  missions_affected: number;
  changed: number;
  unaffected: number;
  already_covered: number;
  would_ask: Affected[];
  would_block: Affected[];
  would_ask_count: number;
  would_block_count: number;
  recommendation: "safe" | "review" | "no_effect" | "no_history";
  coverage: Coverage;
}

interface SavedRule {
  id: string;
  text: string;
  enabled: boolean;
}

/* ------------------------------------------------------------------ words -- */

/** The rule's promise, as the state it puts an action into. */
const AFTER_STATE: Record<string, string> = {
  approve: "Approval required",
  sign: "Your signature required",
  never: "Not allowed",
  auto: "No change",
};

/** The same promise as a sentence about cosigno, for the confirmation. */
const PROMISE: Record<string, string> = {
  approve: "cosigno asks you first",
  sign: "cosigno waits for your signature",
  never: "cosigno will not do this at all",
  auto: "cosigno keeps the checks it already had",
};

/** How each action reads inside a sentence: "covers sending in Gmail". */
const DOING: Record<string, string> = {
  Read: "reading",
  Draft: "drafting",
  Send: "sending",
  Post: "posting",
  Publish: "publishing",
  Create: "creating",
  Update: "changes",
  Archive: "archiving",
  Move: "moving",
  Rename: "renaming",
  Close: "closing",
  Merge: "merging",
  Cancel: "cancelling",
  Delete: "deleting",
  Refund: "refunds",
  "Send payment": "payments",
  Deploy: "deploying",
  "Call a webhook": "webhooks",
};

/** What an action used to do, in the past tense a person would use. */
const BEFORE_LABEL: Record<string, string> = {
  "ran automatically": "Ran automatically",
  "waited for approval": "Waited for your approval",
  "needed your signature": "Needed your signature",
};

/** What it would do instead — present tense, because it is the new normal. */
const AFTER_LABEL: Record<string, string> = {
  "would be blocked": "Doesn't happen",
  "ran automatically": "Runs as before",
  "waited for approval": "Waits for your approval",
  "needed your signature": "Waits for your signature",
};

/** Join names the way a person says them. */
function listNames(items: { label: string }[]): string {
  const names = items.map((i) => i.label);
  if (names.length <= 1) return names[0] ?? "";
  return `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
}

function plural(n: number, word: string): string {
  return `${word}${n === 1 ? "" : "s"}`;
}

/**
 * Is this exact rule already on? Turning the same sentence on twice does
 * nothing and leaves a person looking at their rule listed twice, wondering
 * which one is real.
 */
function isAlreadyOn(saved: SavedRule[] | null, text: string): boolean {
  const norm = (s: string) => s.trim().toLowerCase().replace(/[.\s]+$/, "");
  return (saved ?? []).some((r) => r.enabled && norm(r.text) === norm(text));
}

/* ------------------------------------------------------------------- page -- */

export function Preview() {
  const [text, setText] = useState("");
  const [result, setResult] = useState<CheckResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [saving, setSaving] = useState(false);
  const [enabled, setEnabled] = useState<CheckResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<SavedRule[] | null>(null);
  const stage = useRef<HTMLDivElement>(null);

  const loadSaved = useCallback(async () => {
    try {
      const r = await fetch("/api/rules", { cache: "no-store" });
      if (!r.ok) return;
      setSaved((await r.json()).rules ?? []);
    } catch {
      /* which rules are already on is context, not the point of the page */
    }
  }, []);

  useEffect(() => {
    loadSaved();
  }, [loadSaved]);

  /** Bring the answer into view when it lands below the fold. */
  function revealStage() {
    const el = stage.current;
    if (!el) return;
    requestAnimationFrame(() => {
      const top = el.getBoundingClientRect().top;
      if (top > window.innerHeight * 0.6) el.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  }

  async function preview(value?: string) {
    const t = (value ?? text).trim();
    if (!t) return;
    setText(t);
    setBusy(true);
    setError(null);
    setEnabled(null);
    try {
      const r = await fetch("/api/rules/check", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ text: t }),
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data.message || "that one couldn't be previewed.");
      setResult(data);
      revealStage();
    } catch (e) {
      setError(e instanceof Error ? e.message : "that one couldn't be previewed.");
    } finally {
      setBusy(false);
    }
  }

  async function enable() {
    if (!result) return;
    setSaving(true);
    setError(null);
    try {
      const r = await fetch("/api/rules", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ text: result.rule.text }),
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data.message || "that rule couldn't be enabled.");
      setEnabled(result);
      setResult(null);
      setText("");
      loadSaved();
    } catch (e) {
      setError(e instanceof Error ? e.message : "that rule couldn't be enabled.");
    } finally {
      setSaving(false);
    }
  }

  const quiet = Boolean(result || enabled);

  return (
    <div className="mx-auto w-full max-w-3xl px-5 pb-28 pt-14 sm:px-6 sm:pt-20">
      <Hero
        text={text}
        setText={setText}
        busy={busy}
        quiet={quiet}
        onPreview={() => preview()}
        onTryExample={() => preview(PREVIEW_EXAMPLES[0])}
      />

      {error && (
        <p className="mt-6 animate-card-in rounded-card bg-surface p-5 text-sm font-semibold shadow-depth">
          {error}
        </p>
      )}

      <div ref={stage} className="scroll-mt-6">
        {enabled ? (
          <Enabled result={enabled} onDone={() => setEnabled(null)} />
        ) : result ? (
          <Result
            result={result}
            saving={saving}
            alreadyOn={isAlreadyOn(saved, result.rule.text)}
            onEnable={enable}
            onBack={() => setResult(null)}
          />
        ) : (
          <Examples onPick={(r) => preview(r)} saved={saved} busy={busy} />
        )}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------- hero -- */

function Hero({
  text,
  setText,
  busy,
  quiet,
  onPreview,
  onTryExample,
}: {
  text: string;
  setText: (v: string) => void;
  busy: boolean;
  quiet: boolean;
  onPreview: () => void;
  onTryExample: () => void;
}) {
  return (
    <header>
      <h1 className="font-display text-5xl font-bold tracking-tight sm:text-7xl">Preview</h1>

      {/* Once there is something to read, the promise steps out of the way —
          it has already been kept. */}
      {!quiet && (
        <div className="animate-rise-in">
          <p className="mt-5 max-w-2xl font-display text-xl font-bold sm:text-2xl">
            See exactly what changes before you enable a rule.
          </p>
          <p className="mt-2 max-w-2xl text-base font-semibold text-ink-soft">
            Test it against your previous work. Nothing changes until you decide.
          </p>
        </div>
      )}

      <div className="mt-8 rounded-card bg-surface p-2 shadow-depth transition-shadow duration-base focus-within:shadow-depth-lift sm:mt-10">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <input
            value={text}
            onChange={(e) => setText(e.target.value)}
            // The button is disabled while a preview runs; the key must be too,
            // or holding Enter fires several long reads at once.
            onKeyDown={(e) => {
              if (e.key === "Enter" && !busy) onPreview();
            }}
            placeholder="Try a rule…"
            aria-label="the rule you want to preview"
            className="min-h-[60px] flex-1 rounded-btn bg-transparent px-4 text-lg font-semibold outline-none placeholder:font-normal placeholder:text-ink-soft focus-visible:outline-none"
          />
          <button
            onClick={onPreview}
            disabled={busy || !text.trim()}
            className="inline-flex min-h-[56px] shrink-0 items-center justify-center gap-2 rounded-btn bg-ink px-8 text-base font-extrabold text-cream transition-transform duration-fast active:scale-95 disabled:cursor-not-allowed disabled:bg-cream-deep disabled:text-ink-soft"
          >
            {busy ? (
              <>
                <Loader2 size={17} className="animate-spin" aria-hidden="true" /> Reading…
              </>
            ) : (
              "Preview"
            )}
          </button>
        </div>
      </div>

      {!quiet && (
        <button
          onClick={onTryExample}
          disabled={busy}
          className="mt-3 inline-flex items-center gap-2 rounded-pill px-1 text-sm font-semibold text-ink-soft transition-colors duration-fast hover:text-ink disabled:opacity-60"
        >
          <span className="text-ink-soft">Try:</span>
          <span className="text-ink underline decoration-signal decoration-2 underline-offset-4">
            {PREVIEW_EXAMPLES[0]}
          </span>
        </button>
      )}
    </header>
  );
}

/* --------------------------------------------------------------- examples -- */

function Examples({
  onPick,
  saved,
  busy,
}: {
  onPick: (rule: string) => void;
  saved: SavedRule[] | null;
  busy: boolean;
}) {
  const on = (saved ?? []).filter((r) => r.enabled);
  return (
    <section className="mt-16">
      <h2 className="font-display text-2xl font-bold sm:text-3xl">Popular Previews</h2>

      <div className="mt-6 grid gap-3 sm:grid-cols-2">
        {PREVIEW_EXAMPLES.map((rule, i) => {
          const active = isAlreadyOn(saved, rule);
          return (
            <button
              key={rule}
              onClick={() => onPick(rule)}
              disabled={busy}
              style={{ animationDelay: `${i * 45}ms` }}
              className="group flex animate-card-in items-center justify-between gap-4 rounded-card bg-surface px-5 py-5 text-left text-base font-semibold shadow-depth transition-all duration-base ease-brand-out hover:-translate-y-1 hover:shadow-depth-lift focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-signal disabled:opacity-60"
            >
              <span className={active ? "text-ink-soft" : undefined}>{rule}</span>
              {active ? (
                <span className="flex shrink-0 items-center gap-1 text-xs font-bold text-signal">
                  <Check size={14} aria-hidden="true" /> on
                </span>
              ) : (
                <ArrowRight
                  size={17}
                  className="shrink-0 text-ink-soft transition-transform duration-base group-hover:translate-x-1 group-hover:text-signal"
                  aria-hidden="true"
                />
              )}
            </button>
          );
        })}
      </div>

      {on.length > 0 && (
        <div className="mt-14">
          <h3 className="text-[11px] font-black uppercase tracking-[0.22em] text-ink-soft">
            Already on
          </h3>
          <ul className="mt-4 flex flex-col gap-2.5">
            {on.map((r) => (
              <li key={r.id} className="flex items-center gap-2.5 text-sm font-semibold">
                <Check size={15} className="shrink-0 text-signal" aria-hidden="true" />
                {r.text}
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}

/* ----------------------------------------------------------------- result -- */

function Result({
  result,
  saving,
  alreadyOn,
  onEnable,
  onBack,
}: {
  result: CheckResult;
  saving: boolean;
  alreadyOn: boolean;
  onEnable: () => void;
  onBack: () => void;
}) {
  const { rule, coverage } = result;
  const changes = [...result.would_block, ...result.would_ask];
  const noHistory = result.checked === 0;

  return (
    <section className="mt-14 animate-rise-in">
      <p className="text-[11px] font-black uppercase tracking-[0.22em] text-ink-soft">
        You&apos;re previewing
      </p>
      <h2 className="mt-3 font-display text-3xl font-bold leading-tight sm:text-4xl">{rule.text}</h2>

      <Change result={result} />

      {rule.reading.broad && <Reach reading={rule.reading} />}
      <Where coverage={coverage} reading={rule.reading} />

      {noHistory ? (
        <NoHistory />
      ) : (
        <>
          <Summary result={result} />
          <Recommendation result={result} />
          {changes.length > 0 && <Timeline changes={changes} count={result.changed} />}
        </>
      )}

      <Enable
        result={result}
        saving={saving}
        alreadyOn={alreadyOn}
        onEnable={onEnable}
        onBack={onBack}
      />
    </section>
  );
}

/**
 * The change itself, in two cards and an arrow. This is the answer to the
 * question the page exists for, so it is the largest thing on the screen and
 * it is made of two words, not a summary.
 */
function Change({ result }: { result: CheckResult }) {
  const after = AFTER_STATE[result.rule.requirement] ?? "Approval required";
  const stop = result.rule.requirement === "never";
  const r = result.rule.reading;
  const doing = DOING[r.action] ?? r.action.toLowerCase();

  return (
    <div className="mt-8">
      <div className="grid items-stretch gap-3 sm:grid-cols-[1fr_auto_1fr]">
        <State label="Before" value="Automatic" />
        <span className="flex items-center justify-center text-ink-soft" aria-hidden="true">
          <ArrowDown size={22} className="sm:hidden" />
          <ArrowRight size={22} className="hidden sm:block" />
        </span>
        <State label="After" value={after} tone={stop ? "stop" : "signal"} />
      </div>

      <p className="mt-4 text-sm font-semibold text-ink-soft">
        Covers {doing} {placeFor(result)}
        {r.qualifier ? `, ${r.qualifier.toLowerCase()}` : ""}.{" "}
        {/* A rule that forbids something catches work you would have approved
            too, so the reassurance that goes with an approval rule would be a
            lie here. */}
        {stop
          ? "It applies even to work you would have said yes to."
          : "Anything that already waited for you stays exactly as it is."}
      </p>
    </div>
  );
}

/**
 * Where the rule lands, named as places a person recognises, and carrying its
 * own preposition so the sentence reads either way. Taken from what can really
 * be reached — naming a system the rule can't touch would contradict the note
 * underneath it, and one of the two would be wrong.
 */
function placeFor(result: CheckResult): string {
  const { covered, viaOwnWork, unreachable } = result.coverage;
  const scope = result.rule.reading.scope;
  const plain =
    scope.toLowerCase() === "everything cosigno can do" ? "everything cosigno does" : scope;
  if (unreachable) return `in ${plain}`;
  if (covered.length > 0) return `in ${listNames(covered)}`;
  if (viaOwnWork) return "that cosigno does itself";
  return `in ${plain}`;
}

function State({
  label,
  value,
  tone = "flat",
}: {
  label: string;
  value: string;
  tone?: "flat" | "signal" | "stop";
}) {
  const skin =
    tone === "signal"
      ? "bg-signal/12 ring-1 ring-inset ring-signal"
      : tone === "stop"
        ? "bg-ink text-cream"
        : "bg-surface";
  return (
    <div className={`animate-card-in rounded-card p-6 shadow-depth sm:p-7 ${skin}`}>
      <p
        className={`text-[11px] font-black uppercase tracking-[0.22em] ${
          tone === "stop" ? "text-cream/70" : "text-ink-soft"
        }`}
      >
        {label}
      </p>
      <p className="mt-2 font-display text-2xl font-bold leading-tight sm:text-3xl">{value}</p>
    </div>
  );
}

/** Three counts, in the words of the question they answer. */
function Summary({ result }: { result: CheckResult }) {
  const stop = result.would_block_count > 0;
  return (
    <div className="mt-12">
      <div className="grid gap-3 sm:grid-cols-3">
        <Count label="Would change" value={result.changed} />
        <Count label="Would stay the same" value={result.unaffected} />
        <Count
          label={stop ? "Would be stopped" : "Would require approval"}
          value={stop ? result.would_block_count : result.would_ask_count}
        />
      </div>
      <p className="mt-3 text-xs font-semibold text-ink-soft">
        From the last {result.checked} {plural(result.checked, "thing")} cosigno did for you.
      </p>
    </div>
  );
}

function Count({ label, value }: { label: string; value: number }) {
  return (
    <div className="animate-card-in rounded-card bg-surface p-6 shadow-depth">
      {/* Two lines of room whether or not this label needs them, so the three
          numbers sit on one line across the row. */}
      <p className="min-h-[2.6em] text-[11px] font-black uppercase leading-[1.3] tracking-[0.16em] text-ink-soft">
        {label}
      </p>
      <p className="mt-1 font-display text-4xl font-bold tabular-nums">{value}</p>
      <p className="text-sm font-semibold text-ink-soft">{plural(value, "action")}</p>
    </div>
  );
}

/** One line, and it never says "safe" about something we couldn't read. */
function Recommendation({ result }: { result: CheckResult }) {
  const { headline, body, tone } = verdictFor(result);
  return (
    <div
      className={`mt-4 animate-card-in rounded-card bg-surface p-6 shadow-depth ${
        tone === "good" ? "ring-1 ring-inset ring-signal" : ""
      }`}
    >
      <p className="text-[11px] font-black uppercase tracking-[0.22em] text-ink-soft">
        Recommendation
      </p>
      <p className="mt-2 flex items-start gap-2.5 font-display text-xl font-bold sm:text-2xl">
        {tone === "good" && (
          <Check size={22} className="mt-1 shrink-0 text-signal" strokeWidth={3} aria-hidden="true" />
        )}
        {headline}
      </p>
      <p className="mt-1.5 text-sm font-semibold text-ink-soft">{body}</p>
    </div>
  );
}

function verdictFor(result: CheckResult): {
  tone: "good" | "care" | "flat";
  headline: string;
  body: string;
} {
  // A rule nothing can reach must never be called safe to enable — that reads
  // as "you're covered". What it can't reach is stated above; this has to
  // agree with it rather than talk over it.
  if (result.coverage.unreachable) {
    return {
      tone: "care",
      headline: "This wouldn't change anything yet.",
      body: "cosigno can't do this today, so the rule has nothing to hold back. It is kept, and it starts working the moment that changes.",
    };
  }
  if (result.rule.reading.broad) {
    return {
      tone: "care",
      headline: "Worth a closer look.",
      body: "As written this covers everything cosigno does here, which is more than most people mean. Name the action you want to catch and it will only ever catch that.",
    };
  }
  if (result.would_block_count > 0) {
    return {
      tone: "care",
      headline: "Read what changes first.",
      body: "This stops work outright rather than asking you about it. Make sure everything below is something you want stopped.",
    };
  }
  if (result.recommendation === "no_effect") {
    return {
      tone: "flat",
      headline: "Nothing in your previous work would change.",
      body: "Either you haven't done this kind of work yet, or it already waited for you. The rule still applies to everything from here on.",
    };
  }
  return {
    tone: "good",
    headline: "Looks safe to enable.",
    body: "It adds a check exactly where you asked for one, and leaves the rest of your work alone.",
  };
}

/** The change, played back over work a person recognises. */
function Timeline({ changes, count }: { changes: Affected[]; count: number }) {
  return (
    <section className="mt-14">
      <h3 className="font-display text-2xl font-bold sm:text-3xl">From your previous work</h3>
      <p className="mt-2 text-sm font-semibold text-ink-soft">
        {count > changes.length
          ? `${changes.length} of the ${count} things this would have changed.`
          : "Every one of these already happened. This is what it would have looked like."}
      </p>

      <ul className="mt-6 flex flex-col gap-4">
        {changes.map((c, i) => (
          <li
            key={c.id}
            style={{ animationDelay: `${i * 60}ms` }}
            className="animate-card-in rounded-card bg-surface p-6 shadow-depth"
          >
            <p className="font-display text-lg font-bold leading-snug">{c.summary}</p>
            <div className="mt-5 grid items-stretch gap-2.5 sm:grid-cols-[1fr_auto_1fr]">
              <Step label="Before" value={BEFORE_LABEL[c.from] ?? c.from} />
              <span className="flex items-center justify-center text-ink-soft" aria-hidden="true">
                <ArrowDown size={18} className="sm:hidden" />
                <ArrowRight size={18} className="hidden sm:block" />
              </span>
              <Step
                label="After"
                value={AFTER_LABEL[c.to] ?? c.to}
                tone={c.to === "would be blocked" ? "stop" : "signal"}
              />
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}

function Step({
  label,
  value,
  tone = "flat",
}: {
  label: string;
  value: string;
  tone?: "flat" | "signal" | "stop";
}) {
  const skin =
    tone === "signal"
      ? "bg-signal/12 ring-1 ring-inset ring-signal"
      : tone === "stop"
        ? "bg-ink text-cream"
        : "bg-cream-deep";
  return (
    <div className={`rounded-btn px-4 py-3.5 ${skin}`}>
      <p
        className={`text-[10px] font-black uppercase tracking-[0.18em] ${
          tone === "stop" ? "text-cream/70" : "text-ink-soft"
        }`}
      >
        {label}
      </p>
      <p className="mt-1 text-sm font-bold">{value}</p>
    </div>
  );
}

/** Nothing to play it against — said as a fact, not as a failure. */
function NoHistory() {
  return (
    <div className="mt-12 animate-card-in rounded-card bg-surface p-8 shadow-depth">
      <p className="font-display text-xl font-bold sm:text-2xl">
        There isn&apos;t enough previous work yet.
      </p>
      <p className="mt-2 max-w-xl text-base font-semibold text-ink-soft">
        You can still enable the rule and cosigno will begin using it for future work.
      </p>
    </div>
  );
}

/**
 * A rule that names no action governs every one of them, which is a far bigger
 * claim than most people mean to make. It is said before the decision, not
 * after it.
 */
function Reach({ reading }: { reading: RuleReading }) {
  return (
    <p className="mt-6 flex items-start gap-3 rounded-card bg-surface p-5 text-sm font-semibold shadow-depth">
      <TriangleAlert size={17} className="mt-0.5 shrink-0" aria-hidden="true" />
      <span>
        This doesn&apos;t name one action, so it covers <b>everything</b> cosigno does in{" "}
        {reading.scope.toLowerCase()} — including reading. Name the action you mean (send, delete,
        post…) and it will only ever catch that.
      </span>
    </p>
  );
}

/**
 * Where the rule reaches, and where it doesn't.
 *
 * A rule that is on looks like protection whether or not anything can trigger
 * it. Letting someone believe they are covered when they are not is the most
 * expensive thing this page could do, so the gap is named — and it names which
 * apps rather than gesturing at "some".
 */
function Where({ coverage, reading }: { coverage: Coverage; reading: RuleReading }) {
  const { covered, noConnector, noSuchCapability, viaOwnWork, unreachable } = coverage;
  const doing = DOING[reading.action] ?? reading.action.toLowerCase();

  if (unreachable) {
    const why =
      noConnector.length > 0
        ? `cosigno doesn't work with ${listNames(noConnector)} yet`
        : noSuchCapability.length > 0
          ? `${doing} isn't something cosigno can do in ${listNames(noSuchCapability)}`
          : "cosigno can't do this anywhere yet";
    return (
      <p className="mt-6 flex items-start gap-3 rounded-card bg-surface p-5 text-sm font-semibold shadow-depth">
        <TriangleAlert size={17} className="mt-0.5 shrink-0" aria-hidden="true" />
        <span>
          <b>Nothing can trigger this yet</b> — {why}. You can still enable it, and it starts
          working the moment that changes. Until then, don&apos;t count on it.
        </span>
      </p>
    );
  }

  // Reachable, but only partly. The line above already names where it lands,
  // so this one only has to name the gap — "protected in Gmail" is true,
  // "protected everywhere" would not be.
  const gaps = [...noConnector, ...noSuchCapability];
  if (gaps.length === 0) return null;

  // With one kind of gap the names were just read out, so a pronoun is enough.
  // With both, each reason has to say which systems it is about.
  const both = noConnector.length > 0 && noSuchCapability.length > 0;
  const reasons = [
    noConnector.length > 0
      ? `cosigno can't connect to ${both ? listNames(noConnector) : noConnector.length === 1 ? "it" : "those"} yet`
      : "",
    noSuchCapability.length > 0
      ? `${doing} isn't something cosigno can do ${both ? `in ${listNames(noSuchCapability)}` : noSuchCapability.length === 1 ? "there" : "in those"}`
      : "",
  ].filter(Boolean);

  return (
    <p className="mt-6 flex items-start gap-3 rounded-card bg-surface p-5 text-sm font-semibold text-ink-soft shadow-depth">
      <Info size={17} className="mt-0.5 shrink-0" aria-hidden="true" />
      <span>
        It doesn&apos;t reach <b className="text-ink">{listNames(gaps)}</b> — {reasons.join(", and ")}
        .{covered.length > 0 && viaOwnWork ? " Everything else cosigno does itself is covered." : ""}
      </span>
    </p>
  );
}

/* ----------------------------------------------------------------- enable -- */

function Enable({
  result,
  saving,
  alreadyOn,
  onEnable,
  onBack,
}: {
  result: CheckResult;
  saving: boolean;
  alreadyOn: boolean;
  onEnable: () => void;
  onBack: () => void;
}) {
  if (alreadyOn) {
    return (
      <div className="mt-14 text-center">
        <p className="flex items-center justify-center gap-2.5 font-display text-xl font-bold">
          <Check size={20} strokeWidth={3} className="text-signal" aria-hidden="true" />
          This rule is already on.
        </p>
        <button
          onClick={onBack}
          className="mt-4 text-sm font-bold text-ink-soft underline decoration-signal decoration-2 underline-offset-4 transition-colors hover:text-ink"
        >
          Preview something else
        </button>
      </div>
    );
  }

  return (
    <div className="mt-14">
      <button
        onClick={onEnable}
        disabled={saving}
        className="flex min-h-[68px] w-full items-center justify-center gap-2.5 rounded-card bg-ink px-8 font-display text-xl font-bold text-cream shadow-depth transition-transform duration-fast ease-brand-out active:scale-[0.99] disabled:opacity-70"
      >
        {saving ? (
          <>
            <Loader2 size={20} className="animate-spin" aria-hidden="true" /> Enabling…
          </>
        ) : (
          "Enable Rule"
        )}
      </button>
      <p className="mt-3 text-center text-sm font-semibold text-ink-soft">
        You can turn this off anytime.
      </p>
      <div className="mt-6 text-center">
        <button
          onClick={onBack}
          className="text-sm font-bold text-ink-soft underline decoration-line decoration-2 underline-offset-4 transition-colors hover:text-ink hover:decoration-signal"
        >
          Preview something else
        </button>
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------- enabled -- */

function Enabled({ result, onDone }: { result: CheckResult; onDone: () => void }) {
  const dark = result.coverage.unreachable;
  return (
    <section className="mt-14 animate-spring-in rounded-card bg-surface p-10 text-center shadow-depth-lift">
      <span
        className={`mx-auto flex h-14 w-14 animate-check-pop items-center justify-center rounded-pill ${
          dark ? "bg-cream-deep" : "bg-signal"
        }`}
      >
        <Check size={30} strokeWidth={3} className="text-ink" aria-hidden="true" />
      </span>

      <p className="mt-6 text-[11px] font-black uppercase tracking-[0.22em] text-ink-soft">
        {dark ? "Saved" : "Enabled"}
      </p>
      <p className="mx-auto mt-3 max-w-lg font-display text-2xl font-bold leading-tight sm:text-3xl">
        {result.rule.text}
      </p>

      {dark ? (
        <p className="mx-auto mt-4 max-w-md text-base font-semibold text-ink-soft">
          It isn&apos;t holding anything back yet — cosigno can&apos;t do this today. It starts the
          moment that changes.
        </p>
      ) : (
        <>
          <p className="mx-auto mt-4 max-w-md text-base font-semibold">
            From now on, {PROMISE[result.rule.requirement] ?? "cosigno asks you first"}.
          </p>
          <p className="mx-auto mt-1.5 max-w-md text-sm font-semibold text-ink-soft">
            Work that already happened is untouched. You can turn this off anytime.
          </p>
        </>
      )}

      <button
        onClick={onDone}
        className="mt-8 rounded-btn px-6 py-3 text-sm font-bold ring-1 ring-inset ring-ink transition-colors duration-fast hover:bg-cream-deep"
      >
        Preview another rule
      </button>
    </section>
  );
}
