"use client";

import { useCallback, useEffect, useState } from "react";
import { ArrowRight, Check, Info, Loader2, ShieldCheck, TriangleAlert } from "lucide-react";
import { GALLERY } from "./galleryRules";
import { Page, PageHeader } from "@/components/ui/Page";
import { badge, btn, card, dot, field } from "@/components/ui/styles";

/**
 * Safety rules — "test an AI rule before turning it on."
 *
 * Someone opens this page for one reason: they want to hand cosigno a job but
 * are not sure they trust it with a particular kind of action yet. So the page
 * is built around that sentence and nothing else. It never asks anyone to
 * learn what a policy, a ledger, or a replay is; it shows a rule, what that
 * rule would have done to work they already recognise, and a switch.
 *
 * The check runs the REAL enforcement path server-side (see
 * /api/rules/check), so what is previewed here is what will actually happen.
 */

interface Affected {
  id: string;
  summary: string;
  created_at: string;
  from: string;
  to: string;
}

/** What cosigno understood — the same structure enforcement matches on. */
interface RuleReading {
  action: string;
  requirement: string;
  scope: string;
  qualifier?: string;
  broad: boolean;
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
  recommendation: "safe" | "review" | "no_effect" | "no_history";
  coverage: Coverage;
}

/** What a rule can actually govern today — see coverageFor(). */
interface Coverage {
  covered: { provider: string; label: string; capabilities: number }[];
  noConnector: { provider: string; label: string }[];
  noSuchCapability: { provider: string; label: string }[];
  viaOwnWork: boolean;
  unreachable: boolean;
}

interface SavedRule {
  id: string;
  text: string;
  enabled: boolean;
}

/** Join a list of names the way a person would say it. */
function listNames(items: { label: string }[]): string {
  const names = items.map((i) => i.label);
  if (names.length <= 1) return names[0] ?? "";
  return `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
}



/**
 * What cosigno now promises, said as behaviour rather than as a requirement
 * level. "waits for your approval" is a setting; "cosigno asks you first" is
 * the thing a person wanted when they wrote the rule.
 */
const PROMISE: Record<string, string> = {
  approve: "cosigno asks you first",
  sign: "cosigno needs your signature before it goes ahead",
  never: "cosigno will not do this at all",
  auto: "cosigno keeps the checks it already had",
};

/** How the recommendation reads. Never says "safe" about a rule we misread. */
const VERDICT: Record<
  CheckResult["recommendation"],
  { tone: "good" | "warn" | "flat"; title: string; body: string }
> = {
  safe: {
    tone: "good",
    title: "Looks safe to turn on.",
    body: "It adds a checkpoint where you'd want one, and leaves the rest of your work alone.",
  },
  review: {
    tone: "warn",
    title: "Read this one before turning it on.",
    body: "It reaches further than most rules do. Make sure everything it would catch is something you actually want stopped.",
  },
  no_effect: {
    tone: "flat",
    title: "Nothing in your past work would have changed.",
    body: "Either you haven't done this kind of work yet, or it already asked for at least this much. The rule still applies going forward.",
  },
  no_history: {
    tone: "flat",
    title: "There's no completed work to check this against yet.",
    body: "The rule is still safe to turn on — a rule can only ever add a checkpoint, never remove one.",
  },
};

/**
 * Is this exact rule already switched on? Turning the same sentence on twice
 * does nothing useful and leaves a person staring at their rule listed twice,
 * wondering which one is real.
 */
function isAlreadyOn(saved: SavedRule[] | null, text: string): boolean {
  const norm = (s: string) => s.trim().toLowerCase().replace(/[.\s]+$/, "");
  return (saved ?? []).some((r) => r.enabled && norm(r.text) === norm(text));
}

/* ------------------------------------------------------------------ page -- */

export function SafetyRules() {
  const [text, setText] = useState("");
  const [result, setResult] = useState<CheckResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [saving, setSaving] = useState(false);
  const [enabled, setEnabled] = useState<CheckResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<SavedRule[] | null>(null);

  const loadSaved = useCallback(async () => {
    try {
      const r = await fetch("/api/rules", { cache: "no-store" });
      if (!r.ok) return;
      setSaved((await r.json()).rules ?? []);
    } catch {
      /* the list of existing rules is context, not the point of the page */
    }
  }, []);

  useEffect(() => {
    loadSaved();
  }, [loadSaved]);

  async function check(value?: string) {
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
      if (!r.ok) throw new Error(data.message || "Couldn't check that rule.");
      setResult(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't check that rule.");
    } finally {
      setBusy(false);
    }
  }

  async function turnOn() {
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
      if (!r.ok) throw new Error(data.message || "Couldn't turn that rule on.");
      setEnabled(result);
      setResult(null);
      setText("");
      loadSaved();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't turn that rule on.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Page width="work">
      <PageHeader
        title="What happens if you turn this on?"
        description="Write a rule and cosigno replays your past work against it, so you see exactly what would have changed before anything binds."
      />

      {enabled ? (
        <RuleEnabled result={enabled} onAddAnother={() => setEnabled(null)} />
      ) : (
        <>
          <Editor
            text={text}
            setText={setText}
            busy={busy}
            onCheck={() => check()}
          />

          {error && (
            <p className="mt-4 rounded-card border border-line bg-surface p-4 text-sm font-semibold">
              {error}
            </p>
          )}

          {result ? (
            <Report
              result={result}
              saving={saving}
              onTurnOn={turnOn}
              alreadyOn={isAlreadyOn(saved, result.rule.text)}
            />
          ) : (
            <Gallery onPick={(r) => check(r)} saved={saved} />
          )}
        </>
      )}
    </Page>
  );
}

/* ---------------------------------------------------------------- editor -- */

function Editor({
  text,
  setText,
  busy,
  onCheck,
}: {
  text: string;
  setText: (v: string) => void;
  busy: boolean;
  onCheck: () => void;
}) {
  return (
    <div className="mt-12 flex flex-col gap-2 sm:flex-row">
      <input
        value={text}
        onChange={(e) => setText(e.target.value)}
        // The button is disabled while a check runs; the key must be too, or
        // holding Enter fires several 500-action reads at once.
        onKeyDown={(e) => {
          if (e.key === "Enter" && !busy) onCheck();
        }}
        placeholder="e.g. always ask before deleting files"
        aria-label="the rule you want to test"
        className={field("lg")}
      />
      <button onClick={onCheck} disabled={busy || !text.trim()} className={btn("primary", "lg", "shrink-0")}>
        {busy ? (
          <>
            <Loader2 size={15} className="animate-spin" aria-hidden="true" /> Checking…
          </>
        ) : (
          "Test this rule"
        )}
      </button>
    </div>
  );
}

/* --------------------------------------------------------------- gallery -- */

function Gallery({
  onPick,
  saved,
}: {
  onPick: (rule: string) => void;
  saved: SavedRule[] | null;
}) {
  const on = (saved ?? []).filter((r) => r.enabled);
  return (
    <div className="mt-14">
      <h2 className="t-eyebrow">Rules people usually start with</h2>
      <p className="t-caption mt-1.5">
        Pick one to see what it would have done. Nothing turns on until you say so.
      </p>

      <div className="mt-7 grid gap-x-10 gap-y-8 sm:grid-cols-2">
        {GALLERY.map((section) => (
          <div key={section.group}>
            <p className="t-eyebrow">{section.group}</p>
            <div className="-mx-3 mt-1.5 flex flex-col">
              {section.rules.map((rule) => {
                const active = isAlreadyOn(saved, rule);
                return (
                  <button
                    key={rule}
                    onClick={() => onPick(rule)}
                    className="group flex items-center justify-between gap-3 rounded-btn px-3 py-2.5 text-left text-[1rem] transition-colors duration-fast hover:bg-ink/[0.035] focus-visible:outline-none focus-visible:bg-ink/[0.05]"
                  >
                    <span className={active ? "text-ink-soft" : undefined}>{rule}</span>
                    {active ? (
                      <span className="t-caption flex shrink-0 items-center gap-1 text-positive">
                        <Check size={13} strokeWidth={2.2} aria-hidden="true" /> on
                      </span>
                    ) : (
                      <ArrowRight
                        size={14}
                        strokeWidth={2}
                        className="shrink-0 -translate-x-1 text-ink-soft opacity-0 transition-all duration-base ease-brand-out group-hover:translate-x-0 group-hover:opacity-100"
                        aria-hidden="true"
                      />
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      {on.length > 0 && (
        <div className="mt-14">
          <h2 className="t-eyebrow">Already on</h2>
          <p className="t-caption mt-1.5">cosigno checks these before every action it takes.</p>
          <ul className="mt-3 flex flex-col gap-2">
            {on.map((r) => (
              <li key={r.id} className="flex items-center gap-2.5 text-[1rem]">
                <Check size={14} strokeWidth={2.2} className="shrink-0 text-positive" aria-hidden="true" />
                {r.text}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

/* ---------------------------------------------------------------- report -- */

function Report({
  result,
  saving,
  onTurnOn,
  alreadyOn,
}: {
  result: CheckResult;
  saving: boolean;
  onTurnOn: () => void;
  alreadyOn: boolean;
}) {
  /**
   * A rule nothing can trigger must never be summarised as "safe to turn on" —
   * that reads as "you'll be protected". The coverage notice above states the
   * gap; the verdict has to agree with it rather than contradict it.
   */
  const verdict: (typeof VERDICT)[keyof typeof VERDICT] = result.coverage.unreachable
    ? {
        tone: "warn",
        title: "Turning this on would not protect anything yet.",
        body: "The rule is understood and will be saved, but cosigno cannot perform the action it guards today. It starts working if that support is added.",
      }
    : VERDICT[result.recommendation];
  const affected = [...result.would_block, ...result.would_ask];

  return (
    <div className="mt-8">
      <Understood rule={result.rule} />
      <CoverageNotice coverage={result.coverage} reading={result.rule.reading} />

      <h2 className="mt-8 font-display text-xl font-semibold">Over your previous work</h2>
      <div className="mt-3 grid gap-3 sm:grid-cols-3">
        <Stat
          value={result.missions_affected}
          label={result.missions_affected === 1 ? "mission would change" : "missions would change"}
          emphasis
        />
        <Stat
          value={result.changed}
          label={result.changed === 1 ? "action would be stopped first" : "actions would be stopped first"}
          emphasis={result.changed > 0}
        />
        <Stat
          value={result.unaffected}
          label={result.unaffected === 1 ? "action would carry on as before" : "actions would carry on as before"}
        />
      </div>
      <p className="mt-2 text-xs text-ink-soft">
        checked against the last {result.checked} thing{result.checked === 1 ? "" : "s"} cosigno did
        for you.
      </p>

      <Verdict verdict={verdict} />

      {affected.length > 0 && (
        <section className="mt-8">
          <h2 className="font-display text-xl font-semibold">What would have changed</h2>
          <ul className="mt-3 flex flex-col gap-2">
            {affected.map((a) => (
              <li
                key={a.id}
                className="rounded-card border border-line bg-surface p-4 shadow-rest"
              >
                <p className="text-sm font-semibold">{a.summary}</p>
                <div className="mt-2.5 flex flex-wrap items-center gap-2">
                  <Pill label={a.from} tone="before" />
                  <ArrowRight size={14} className="shrink-0 text-ink-soft" aria-hidden="true" />
                  <Pill label={a.to} tone={a.to === "would be blocked" ? "blocked" : "after"} />
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}

      {alreadyOn ? (
        <p className="mt-8 flex items-center gap-2.5 rounded-card border border-line bg-surface p-4 text-sm font-semibold shadow-rest">
          <Check size={16} className="shrink-0 text-signal" aria-hidden="true" />
          You already have this rule on — nothing to do.
        </p>
      ) : (
        <div className="mt-8 flex flex-col items-start gap-3 sm:flex-row sm:items-center">
          <button
            onClick={onTurnOn}
            disabled={saving}
            className="inline-flex min-h-[52px] items-center justify-center gap-2 rounded-btn bg-ink px-6 text-sm font-semibold text-cream shadow-rest transition-transform active:scale-95 disabled:opacity-60"
          >
            {saving ? (
              <>
                <Loader2 size={16} className="animate-spin" aria-hidden="true" /> Turning it on…
              </>
            ) : (
              <>
                <ShieldCheck size={16} aria-hidden="true" />
                {/* The button must not say "turn on" for something that will
                    not do anything — that is the claim, restated as a verb. */}
                {result.coverage.unreachable ? "save this rule anyway" : "turn this rule on"}
              </>
            )}
          </button>
          <p className="text-xs text-ink-soft">
            {result.coverage.unreachable
              ? "It will be kept and start working if cosigno gains this capability. You can remove it at any time."
              : "You can turn it off again at any time. It never changes work that already happened."}
          </p>
        </div>
      )}
    </div>
  );
}

/**
 * "You wrote / cosigno understood" — the whole trust argument of this page in
 * one panel. The three terms shown are literally the three the engine matches
 * on, so there is nothing understood that is not displayed, and nothing
 * displayed that is not enforced.
 */
function Understood({ rule }: { rule: CheckResult["rule"] }) {
  const r = rule.reading;
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <div className="rounded-card border border-line bg-surface p-5 shadow-rest">
        <p className="t-eyebrow">You wrote</p>
        <p className="mt-1.5 font-display text-lg font-semibold">{rule.text}</p>
      </div>

      <div className="rounded-card border border-line bg-surface p-5 shadow-rest">
        <p className="t-eyebrow">
          cosigno understood
        </p>
        <dl className="mt-2.5 flex flex-col gap-2">
          <Term label="action" value={r.action} />
          <Term label="requirement" value={r.requirement} />
          <Term label="scope" value={r.scope} />
          {r.qualifier && <Term label="only when" value={r.qualifier} />}
        </dl>
      </div>

      {r.broad && (
        <p className="flex items-start gap-2.5 rounded-card border border-ink bg-surface p-4 text-sm shadow-rest sm:col-span-2">
          <TriangleAlert size={16} className="mt-0.5 shrink-0 text-ink" aria-hidden="true" />
          <span>
            <b>This rule doesn&apos;t name one action.</b> as written it governs{" "}
            <b>Everything</b> cosigno does in {r.scope.toLowerCase()} — including reading. name the
            action you mean (send, delete, post…) and it will only ever catch that.
          </span>
        </p>
      )}
    </div>
  );
}

/**
 * What this rule can and cannot reach today.
 *
 * A stored rule looks like protection whether or not anything can trigger it.
 * If cosigno cannot perform the action the rule guards, saying nothing lets a
 * person believe they are covered when they are not — the single most
 * expensive thing this product could get wrong. So the gap is stated first,
 * in the same breath as the reading, and it names which tools rather than
 * gesturing at "some".
 */
function CoverageNotice({ coverage, reading }: { coverage: Coverage; reading: RuleReading }) {
  const { covered, noConnector, noSuchCapability, viaOwnWork, unreachable } = coverage;

  if (unreachable) {
    const why =
      noConnector.length > 0
        ? `cosigno has no connector for ${listNames(noConnector)} yet`
        : noSuchCapability.length > 0
          ? `cosigno can't ${reading.action.toLowerCase()} in ${listNames(noSuchCapability)} — that isn't something it can do there`
          : "cosigno can't perform this action anywhere yet";
    return (
      <p className="mt-3 flex items-start gap-2.5 rounded-card border border-ink bg-surface p-4 text-sm shadow-rest">
        <TriangleAlert size={16} className="mt-0.5 shrink-0 text-ink" aria-hidden="true" />
        <span>
          <b>This rule is valid, but nothing can trigger it today.</b> {why}, so turning it on
          protects nothing right now. it will be stored, and it starts protecting the moment that
          support exists — but do not count on it until then.
        </span>
      </p>
    );
  }

  // Reachable, but only partly. Naming the gap matters as much as naming the
  // cover: "protected in Gmail" is true, "protected everywhere" would not be.
  const gaps = [...noConnector, ...noSuchCapability];
  if (gaps.length === 0) return null;

  return (
    <p className="mt-3 flex items-start gap-2.5 rounded-card border border-line bg-surface p-4 text-sm text-ink-soft shadow-rest">
      <Info size={16} className="mt-0.5 shrink-0" aria-hidden="true" />
      <span>
        this covers{" "}
        <b className="text-ink">
          {covered.length > 0 ? listNames(covered) : "cosigno's own work"}
          {covered.length > 0 && viaOwnWork ? ", and cosigno's own work" : ""}
        </b>
        .{" "}
        {noConnector.length > 0 && (
          <>
            It does <b className="text-ink">not</b> cover {listNames(noConnector)} — there is no
            connector for {noConnector.length === 1 ? "it" : "those"} yet.{" "}
          </>
        )}
        {noSuchCapability.length > 0 && (
          <>
            It also does <b className="text-ink">not</b> cover {listNames(noSuchCapability)}, where{" "}
            cosigno has no {reading.action.toLowerCase()} capability.
          </>
        )}
      </span>
    </p>
  );
}

function Term({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline gap-2">
      <dt className="w-24 shrink-0 text-[0.75rem] font-semibold text-ink-soft">{label}</dt>
      <dd className="text-sm font-semibold">{value}</dd>
    </div>
  );
}

function Verdict({ verdict }: { verdict: (typeof VERDICT)[keyof typeof VERDICT] }) {
  const ring =
    verdict.tone === "good"
      ? "border-signal"
      : verdict.tone === "warn"
        ? "border-ink"
        : "border-line";
  return (
    <div className={`mt-5 flex items-start gap-3 rounded-card border ${ring} bg-surface p-4 shadow-rest`}>
      {verdict.tone === "good" ? (
        <ShieldCheck size={18} className="mt-0.5 shrink-0 text-signal" aria-hidden="true" />
      ) : verdict.tone === "warn" ? (
        <TriangleAlert size={18} className="mt-0.5 shrink-0 text-ink" aria-hidden="true" />
      ) : (
        <Check size={18} className="mt-0.5 shrink-0 text-ink-soft" aria-hidden="true" />
      )}
      <div>
        <p className="text-sm font-semibold">{verdict.title}</p>
        <p className="mt-0.5 text-sm text-ink-soft">{verdict.body}</p>
      </div>
    </div>
  );
}

function Stat({ value, label, emphasis }: { value: number; label: string; emphasis?: boolean }) {
  return (
    <div
      className={`rounded-card border bg-surface p-4 shadow-rest ${
        emphasis && value > 0 ? "border-signal" : "border-line"
      }`}
    >
      <p className="font-display text-3xl font-semibold tabular-nums">{value}</p>
      <p className="mt-0.5 text-sm font-semibold text-ink-soft">{label}</p>
    </div>
  );
}

/** before / after / blocked, so the change reads without being read. */
function Pill({ label, tone }: { label: string; tone: "before" | "after" | "blocked" }) {
  const TONE = {
    before: "bg-cream-deep text-ink-soft",
    after: "bg-signal/20 text-ink ring-1 ring-inset ring-signal",
    blocked: "bg-ink text-cream",
  } as const;
  return (
    <span className={`rounded-pill px-2.5 py-1 text-xs font-semibold ${TONE[tone]}`}>{label}</span>
  );
}

/* --------------------------------------------------------------- enabled -- */

function RuleEnabled({ result, onAddAnother }: { result: CheckResult; onAddAnother: () => void }) {
  return (
    <div className="mt-12 flex animate-card-in flex-col items-center px-6 py-16 text-center">
      {/* The quiet celebration: the mark pops once and the tick draws itself.
          Half a second, then it is over — turning on a rule is a decision, not
          an achievement to be applauded. */}
      <span
        className={`flex h-11 w-11 animate-check-pop items-center justify-center rounded-pill ${
          result.coverage.unreachable ? "bg-ink/[0.07]" : "bg-positive"
        }`}
      >
        <Check
          size={22}
          strokeWidth={2.6}
          className={result.coverage.unreachable ? "text-ink-soft" : "text-cream"}
          aria-hidden="true"
        />
      </span>
      <p className="t-display mt-6 text-[1.5rem]">
        {result.coverage.unreachable ? "Rule saved" : "Rule is on"}
      </p>
      {/* The person's own sentence back, and what cosigno now promises about
          it — not the parser's structured reading, which belongs in the report
          where it is being checked, not in the confirmation. */}
      <p className="t-title mx-auto mt-3 max-w-[28rem]">{result.rule.text}</p>
      {result.coverage.unreachable ? (
        /* Confirming a save is honest; celebrating protection that does not
           exist is not. The wording changes because the truth changed. */
        <p className="t-caption mx-auto mt-3 max-w-[28rem]">
          It isn&apos;t protecting anything yet — cosigno can&apos;t do this action today. It
          starts the moment that changes.
        </p>
      ) : (
        <>
          <p className="t-body mx-auto mt-3 max-w-[28rem]">
            From now on, {PROMISE[result.rule.requirement] ?? "cosigno checks with you first"}.
          </p>
          <p className="t-caption mx-auto mt-2 max-w-[28rem]">
            Nothing else changes, and work that already happened is untouched.
          </p>
        </>
      )}
      <button onClick={onAddAnother} className={btn("secondary", "md", "mt-8")}>
        Test another rule
      </button>
    </div>
  );
}
