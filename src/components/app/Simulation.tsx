"use client";

import { useEffect, useState } from "react";
import { AlertTriangle, CheckCircle2, FlaskConical, ShieldCheck } from "lucide-react";
import { useToast } from "@/components/Toast";

/**
 * The Policy Simulator answers one question: what would happen if I added
 * this rule?
 *
 * Type a rule, and it replays against the real decision history: how much
 * past work would have been stopped, how much would still pass, and the
 * specific actions affected — then a verdict in a sentence, and an Enable
 * button that saves the rule for real.
 *
 * The verdict is derived, never asserted: a rule can only ever TIGHTEN what
 * cosigno may do (the engine cannot parse a rule into more permission), so
 * "safe" here means "won't unexpectedly stop your routine work", and the
 * numbers that produced the verdict sit right next to it.
 */

interface SimDecision {
  decision_id: string;
  actor: string;
  action: string;
  resource: string;
  changed: boolean;
  newly_blocked: boolean;
  reason: string;
}

interface SimResult {
  evaluated: number;
  tightened: number;
  newly_held: number;
  newly_blocked: number;
  unchanged: number;
  would_have_stopped: SimDecision[];
  decisions: SimDecision[];
  confidence: "high" | "low";
  history_size: number;
}

/**
 * Popular rules — one click, no typing.
 *
 * Every entry here was checked against the rules engine's actual parse: the
 * enforced rule matches the label. Candidates whose parse came out broader
 * than their wording ("never delete production databases" would forbid ALL
 * deletion) were rewritten or dropped — a chip that promises narrower than
 * it enforces is a small lie with a big blast radius.
 */
const POPULAR_RULES = [
  "Require approval for refunds",
  "Never delete anything",
  "Require a signature for payments over $500",
  "Require approval before posting anything",
  "Require approval for sending email",
  "Never post to #announcements",
];

/**
 * The rule's enforced interpretation, from the permissions engine that will
 * actually hold it. Shown before enabling, so what you approve is what runs.
 */
interface EnforcedPreview {
  description: string;
}

export function Simulation() {
  const toast = useToast();
  const [text, setText] = useState("");
  const [activeRules, setActiveRules] = useState(0);
  const [busy, setBusy] = useState(false);
  const [res, setRes] = useState<SimResult | null>(null);
  const [enforced, setEnforced] = useState<EnforcedPreview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [enabling, setEnabling] = useState(false);
  const [enabled, setEnabled] = useState(false);

  useEffect(() => {
    // The rules already protecting this workspace — real count, shown only
    // when there's something to count.
    fetch("/api/rules")
      .then((r) => r.json())
      .then((d) =>
        setActiveRules(
          (Array.isArray(d.rules) ? d.rules : []).filter(
            (r: { enabled?: boolean }) => r.enabled !== false
          ).length
        )
      )
      .catch(() => undefined);
  }, []);

  async function run(value?: string) {
    const t = (value ?? text).trim();
    if (!t) return;
    setBusy(true);
    setError(null);
    setEnabled(false);
    try {
      // Two reads, one truth each: the ledger replay (what history says), and
      // the permissions engine's parse (what enabling will actually enforce).
      const [simRes, prevRes] = await Promise.all([
        fetch("/api/v1/simulate", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ text: t }),
        }),
        fetch("/api/rules?preview=1", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ text: t }),
        }),
      ]);
      const sim = await simRes.json();
      if (!simRes.ok) throw new Error(sim.message || "the simulation didn't run.");
      setRes(sim);
      const prev = await prevRes.json().catch(() => null);
      setEnforced(prevRes.ok && prev?.description ? { description: prev.description } : null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "the simulation didn't run.");
    } finally {
      setBusy(false);
    }
  }

  async function enable() {
    const t = text.trim();
    if (!t) return;
    setEnabling(true);
    try {
      const r = await fetch("/api/rules", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ text: t }),
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data.message || "the rule didn't save.");
      setEnabled(true);
      setActiveRules((n) => n + 1);
      toast("success", "rule enabled — it applies to the next thing cosigno tries.");
    } catch (e) {
      toast("error", e instanceof Error ? e.message : "the rule didn't save.");
    } finally {
      setEnabling(false);
    }
  }

  const stillPass = res ? res.evaluated - res.tightened : 0;

  return (
    <div className="mx-auto w-full max-w-4xl px-6 py-10 lg:px-10">
      <header>
        <h1 className="font-display text-3xl font-extrabold sm:text-4xl">
          What would happen if I added this rule?
        </h1>
        <p className="mt-2 max-w-2xl text-base text-ink-soft">
          Write a rule in plain English. Cosigno replays it against everything that already
          happened and shows exactly what it would have stopped — before anything is enabled.
        </p>
        {activeRules > 0 && (
          <p className="mt-3 inline-flex items-center gap-2 rounded-pill bg-surface/70 px-3.5 py-1.5 text-xs font-bold shadow-soft">
            <ShieldCheck size={13} className="text-signal" aria-hidden="true" />
            {activeRules} rule{activeRules === 1 ? "" : "s"} currently protecting your workspace
          </p>
        )}
      </header>

      <div className="mt-8 flex flex-col gap-2 sm:flex-row">
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && run()}
          placeholder="e.g. Require a signature for refunds over $500"
          aria-label="draft rule"
          className="min-h-[52px] flex-1 rounded-card bg-surface/70 px-4 text-base font-semibold shadow-soft outline-none ring-1 ring-inset ring-transparent transition-all duration-fast placeholder:text-ink-soft/60 focus:ring-ink/30"
        />
        <button
          onClick={() => run()}
          disabled={busy || !text.trim()}
          className="inline-flex min-h-[52px] shrink-0 items-center justify-center gap-2 rounded-card bg-ink px-6 text-sm font-extrabold lowercase text-cream transition-transform duration-fast active:scale-95 disabled:bg-cream-deep disabled:text-ink-soft disabled:cursor-not-allowed"
        >
          <FlaskConical size={16} aria-hidden="true" /> {busy ? "trying it…" : "try it"}
        </button>
      </div>

      {/* popular rules — most people won't know what to type, so they don't have to */}
      <section className="mt-6">
        <h2 className="text-xs font-extrabold uppercase tracking-[0.16em] text-ink-soft">
          Popular rules — try one with a click
        </h2>
        <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {POPULAR_RULES.map((e) => (
            <button
              key={e}
              onClick={() => {
                setText(e);
                run(e);
              }}
              disabled={busy}
              className="rounded-card bg-surface/60 px-4 py-3 text-left text-sm font-semibold shadow-soft transition-all duration-fast ease-brand-out hover:-translate-y-0.5 hover:shadow-lift disabled:cursor-not-allowed disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-signal"
            >
              {e}
            </button>
          ))}
        </div>
      </section>

      {error && (
        <p className="mt-5 rounded-card bg-surface/70 p-4 text-sm font-semibold shadow-soft" role="alert">
          {error}
        </p>
      )}

      {res && (
        <div className="mt-8 flex flex-col gap-5 animate-fade-through">
          <Verdict res={res} />

          {/* the two numbers someone actually asked for */}
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="rounded-card bg-surface/70 p-5 shadow-soft">
              <p className="font-display text-4xl font-extrabold tabular-nums">{res.tightened}</p>
              <p className="mt-1 text-sm font-bold">would have been stopped</p>
              <p className="mt-0.5 text-xs text-ink-soft">
                {res.newly_blocked} refused outright · {res.newly_held} paused for you
              </p>
            </div>
            <div className="rounded-card bg-surface/70 p-5 shadow-soft">
              <p className="font-display text-4xl font-extrabold tabular-nums">{stillPass}</p>
              <p className="mt-1 text-sm font-bold">would still pass</p>
              <p className="mt-0.5 text-xs text-ink-soft">
                of {res.evaluated} past action{res.evaluated === 1 ? "" : "s"} replayed
              </p>
            </div>
          </div>

          {/* who is affected — the distinct people/agents behind the changed work */}
          <AffectedLine res={res} />

          {/* examples affected */}
          {res.would_have_stopped.length > 0 && (
            <div className="rounded-card bg-surface/70 p-5 shadow-soft">
              <p className="text-sm font-extrabold">what this rule would have caught</p>
              <ul className="mt-2.5 flex flex-col gap-2">
                {res.would_have_stopped.slice(0, 5).map((d) => (
                  <li key={d.decision_id} className="flex items-start gap-2 text-sm">
                    <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-pill bg-signal" aria-hidden="true" />
                    <span>
                      <span className="font-bold">{d.action}</span>
                      <span className="text-ink-soft"> on {d.resource} — {d.reason}</span>
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* enable — with the enforced interpretation shown first */}
          <div className="rounded-card bg-surface/70 p-5 shadow-soft">
            {enforced ? (
              <p className="text-sm">
                <span className="font-bold lowercase text-ink-soft">enabling saves it as: </span>
                <span className="font-extrabold">{enforced.description}</span>
              </p>
            ) : (
              <p className="text-sm text-ink-soft">
                this rule can be simulated, but the permissions engine couldn&apos;t turn it into an
                enforceable rule — rephrase it to enable it.
              </p>
            )}
            <div className="mt-3 flex flex-wrap items-center gap-3">
              <button
                onClick={enable}
                disabled={!enforced || enabling || enabled}
                className="rounded-btn bg-signal px-5 py-2.5 text-sm font-extrabold lowercase text-on-signal transition-transform duration-fast active:scale-95 disabled:bg-cream-deep disabled:text-ink-soft disabled:cursor-not-allowed"
              >
                {enabled ? "enabled ✓" : enabling ? "enabling…" : "enable this rule"}
              </button>
              <p className="text-xs text-ink-soft">
                rules only ever tighten what cosigno may do — enabling one can never give it more
                permission. change or remove it any time in connections → rules.
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/** Who the rule touches, read from the replayed decisions — never guessed. */
function AffectedLine({ res }: { res: SimResult }) {
  const actors = [...new Set(res.decisions.filter((d) => d.changed).map((d) => d.actor))];
  if (actors.length === 0) return null;
  return (
    <p className="text-sm text-ink-soft">
      <span className="font-bold lowercase text-ink">who&apos;s affected: </span>
      {actors.slice(0, 4).join(", ")}
      {actors.length > 4 ? ` and ${actors.length - 4} more` : ""} — everyone else&apos;s work is
      untouched.
    </p>
  );
}

/**
 * One sentence, derived from the replay. The thresholds are visible logic,
 * not vibes: a rule that stops most of the user's routine work gets called
 * broad; a rule the parser wasn't sure about gets called out for reading.
 */
function Verdict({ res }: { res: SimResult }) {
  if (res.confidence === "low") {
    return (
      <div className="flex items-start gap-3 rounded-card bg-signal/10 p-4 ring-1 ring-inset ring-signal/30">
        <AlertTriangle size={18} className="mt-0.5 shrink-0 text-signal" aria-hidden="true" />
        <p className="text-sm">
          <span className="font-extrabold">Read this one before enabling.</span> Part of the rule
          couldn&apos;t be confidently understood, so cosigno fell back to the stricter reading —
          it never guesses in the permissive direction.
        </p>
      </div>
    );
  }
  if (res.evaluated === 0) {
    return (
      <div className="flex items-start gap-3 rounded-card bg-surface/70 p-4 shadow-soft">
        <ShieldCheck size={18} className="mt-0.5 shrink-0 text-signal" aria-hidden="true" />
        <p className="text-sm">
          <span className="font-extrabold">Nothing to replay yet.</span> There&apos;s no past work
          to test this rule against — it can still be enabled, and it applies from the next
          thing cosigno tries.
        </p>
      </div>
    );
  }
  const share = res.tightened / res.evaluated;
  if (share > 0.5 && res.evaluated >= 4) {
    return (
      <div className="flex items-start gap-3 rounded-card bg-signal/10 p-4 ring-1 ring-inset ring-signal/30">
        <AlertTriangle size={18} className="mt-0.5 shrink-0 text-signal" aria-hidden="true" />
        <p className="text-sm">
          <span className="font-extrabold">This rule is broad.</span> It would have stopped{" "}
          {Math.round(share * 100)}% of your past work — that may be exactly what you want, but
          expect cosigno to pause for you a lot more often.
        </p>
      </div>
    );
  }
  return (
    <div className="flex items-start gap-3 rounded-card bg-surface/70 p-4 shadow-soft">
      {res.tightened === 0 ? (
        <>
          <ShieldCheck size={18} className="mt-0.5 shrink-0 text-signal" aria-hidden="true" />
          <p className="text-sm">
            <span className="font-extrabold">Safe to enable.</span> Nothing you&apos;ve done so far
            would have been affected — this rule guards against something that hasn&apos;t
            happened yet.
          </p>
        </>
      ) : (
        <>
          <CheckCircle2 size={18} className="mt-0.5 shrink-0 text-signal" aria-hidden="true" />
          <p className="text-sm">
            <span className="font-extrabold">Looks safe to enable.</span> It would have stopped{" "}
            {res.tightened} specific action{res.tightened === 1 ? "" : "s"} and left the rest of
            your work untouched.
          </p>
        </>
      )}
    </div>
  );
}
