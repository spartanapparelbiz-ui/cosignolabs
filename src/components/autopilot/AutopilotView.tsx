"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  Activity,
  AlertTriangle,
  ArrowRight,
  Check,
  ChevronDown,
  ChevronRight,
  Search,
  Sparkles,
  TrendingDown,
  TrendingUp,
  X,
} from "lucide-react";
import { useToast } from "@/components/Toast";
import type {
  AskAnswer,
  AutopilotOverview,
  BusinessHealth,
  CategoryHealth,
  Recommendation,
  SignalView,
} from "@/lib/autopilot/types";

/**
 * The Autopilot page — Cosigno's read on the business, organized around the
 * four questions: what changed, what needs attention, what's going well,
 * and what should happen next. Conclusions first, evidence attached, and
 * every action routes through the Operator's approval door. Restrained by
 * design: ink on cream, signal orange only where it earns its place.
 */

async function jsonFetch(url: string, init?: RequestInit) {
  const res = await fetch(url, {
    ...init,
    headers: { "Content-Type": "application/json", ...init?.headers },
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.message || body.error || "something went wrong.");
  return body;
}

const CARD = "rounded-card border border-line/70 bg-surface p-5 shadow-soft";
const SECTION_TITLE = "text-xs font-extrabold uppercase tracking-widest text-ink-soft";

/* --------- severity + health presentation (restrained, no rainbow) --------- */

const SEVERITY_CHIP: Record<SignalView["severity"], { label: string; cls: string }> = {
  critical: { label: "Critical", cls: "bg-ink text-cream" },
  important: { label: "Important", cls: "bg-signal/15 text-ink" },
  opportunity: { label: "Opportunity", cls: "ring-1 ring-inset ring-signal/60 text-ink" },
  info: { label: "Information", cls: "bg-cream-deep text-ink-soft" },
};

const HEALTH_LABEL: Record<CategoryHealth["status"], string> = {
  strong: "Strong",
  healthy: "Healthy",
  stable: "Stable",
  improving: "Improving",
  needs_attention: "Needs attention",
  at_risk: "At risk",
  no_data: "Not enough data",
};

function healthTone(status: CategoryHealth["status"]): string {
  if (status === "needs_attention" || status === "at_risk") return "text-signal";
  if (status === "no_data") return "text-ink-soft";
  return "text-ink";
}

function confidenceLabel(c: "high" | "medium" | "low"): string {
  return c === "high" ? "High confidence" : c === "medium" ? "Medium confidence" : "Low confidence";
}

/* ------------------------------------------------------------------ view */

export function AutopilotView() {
  const toast = useToast();
  const [overview, setOverview] = useState<AutopilotOverview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [question, setQuestion] = useState("");
  const [asking, setAsking] = useState(false);
  const [answer, setAnswer] = useState<AskAnswer | null>(null);
  const askRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const d = await jsonFetch("/api/autopilot");
        if (cancelled) return;
        setOverview(d.overview);
        // Mark this visit AFTER the overview rendered, so "new" badges show
        // once and the next visit frames what changed since now.
        jsonFetch("/api/autopilot/seen", { method: "POST" }).catch(() => null);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "something went wrong.");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const ignoreSignal = useCallback(
    async (key: string) => {
      setBusyKey(key);
      try {
        await jsonFetch(`/api/autopilot/signals/${encodeURIComponent(key)}`, {
          method: "POST",
          body: JSON.stringify({ status: "ignored" }),
        });
        setOverview((o) =>
          o && o.data_source === "live"
            ? {
                ...o,
                attention: o.attention.filter((s) => s.key !== key),
                opportunities: o.opportunities.filter((s) => s.key !== key),
                signals: o.signals.map((s) => (s.key === key ? { ...s, status: "ignored" } : s)),
              }
            : o
        );
      } catch (e) {
        toast("error", e instanceof Error ? e.message : "couldn't ignore that.");
      } finally {
        setBusyKey(null);
      }
    },
    [toast]
  );

  const takeAction = useCallback(
    async (command: string, signalKey?: string) => {
      const busy = signalKey ?? command;
      setBusyKey(busy);
      try {
        await jsonFetch("/api/autopilot/act", {
          method: "POST",
          body: JSON.stringify({ command, ...(signalKey ? { signal_key: signalKey } : {}) }),
        });
        toast("success", "prepared — nothing runs until you approve it.");
        if (signalKey) {
          setOverview((o) =>
            o && o.data_source === "live"
              ? {
                  ...o,
                  signals: o.signals.map((s) =>
                    s.key === signalKey ? { ...s, status: "actioned" } : s
                  ),
                }
              : o
          );
        }
      } catch (e) {
        toast("error", e instanceof Error ? e.message : "couldn't prepare that.");
      } finally {
        setBusyKey(null);
      }
    },
    [toast]
  );

  const ask = useCallback(
    async (q: string) => {
      if (!q.trim() || asking) return;
      setAsking(true);
      setAnswer(null);
      try {
        const d = await jsonFetch("/api/autopilot/ask", {
          method: "POST",
          body: JSON.stringify({ question: q.trim() }),
        });
        setAnswer(d.answer);
      } catch (e) {
        toast("error", e instanceof Error ? e.message : "couldn't answer that.");
      } finally {
        setAsking(false);
      }
    },
    [asking, toast]
  );

  const askAbout = useCallback((s: SignalView) => {
    setQuestion(`Tell me more: ${s.title.toLowerCase()}`);
    setAnswer(null);
    askRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
  }, []);

  if (error) {
    return (
      <div className="mx-auto w-full max-w-none px-6 lg:px-10 py-8">
        <div className={`${CARD} text-center`}>
          <p className="text-sm font-extrabold">Autopilot couldn&apos;t load</p>
          <p className="mt-1 text-sm text-ink-soft">{error}</p>
        </div>
      </div>
    );
  }

  if (!overview) {
    return (
      <div className="mx-auto w-full max-w-none px-6 lg:px-10 py-8" aria-busy="true">
        <div className="h-40 animate-pulse rounded-card bg-cream-deep" />
        <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-2">
          <div className="h-64 animate-pulse rounded-card bg-cream-deep" />
          <div className="h-64 animate-pulse rounded-card bg-cream-deep" />
        </div>
      </div>
    );
  }

  const o = overview;

  /* Nothing is reporting business data. Autopilot says that plainly and shows
     nothing else — no scores, no forecast, no recommendations. An empty
     account is allowed to look empty. */
  if (o.data_source === "none") {
    return (
      <div className="mx-auto w-full max-w-none px-6 lg:px-10 py-8">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="font-display text-2xl font-bold sm:text-3xl">Autopilot</h1>
          <Link
            href="/app/connections"
            className="ml-auto text-xs font-bold text-ink-soft hover:text-ink"
          >
            manage connections
          </Link>
        </div>
        <div className={`${CARD} mt-5`}>
          <p className="text-sm font-extrabold">Autopilot has nothing to read yet</p>
          <p className="mt-1 text-sm text-ink-soft">
            Nothing is reporting your business numbers. When a connected tool starts
            sending them, what changed, what needs attention, and what to do next will
            appear here — built from your data and nobody else&apos;s.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-none px-6 lg:px-10 py-8">
      {/* ---------- header ---------- */}
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="font-display text-2xl font-bold sm:text-3xl">Autopilot</h1>
        <Link
          href="/app/connections"
          className="ml-auto text-xs font-bold text-ink-soft hover:text-ink"
        >
          manage connections
        </Link>
      </div>

      {/* ---------- daily brief ---------- */}
      <section className={`${CARD} mt-5 p-6`}>
        <p className="font-display text-xl font-bold">{o.brief.greeting}</p>
        <p className="mt-0.5 text-sm text-ink-soft">Here is what changed.</p>
        <dl className="mt-4 grid grid-cols-1 gap-x-8 gap-y-3 sm:grid-cols-2">
          {o.brief.lines.map((l) => (
            <div key={l.label + l.text} className="flex items-baseline justify-between gap-4 border-b border-line/50 pb-2">
              <dt className="shrink-0 text-xs font-extrabold uppercase tracking-wide text-ink-soft">
                {l.label}
              </dt>
              <dd className={`text-right text-sm ${l.kind === "priority" ? "font-extrabold" : "font-semibold"}`}>
                {l.text}
              </dd>
            </div>
          ))}
        </dl>
      </section>

      {/* ---------- business health ---------- */}
      <section className="mt-8">
        <h2 className={SECTION_TITLE}>Business health</h2>
        <HealthPanel health={o.health} />
      </section>

      {/* ---------- what changed ---------- */}
      <section className="mt-8">
        <h2 className={SECTION_TITLE}>What changed</h2>
        <div className={`${CARD} mt-3`}>
          {o.changes.length === 0 ? (
            <p className="text-sm text-ink-soft">Nothing meaningful moved since you last looked.</p>
          ) : (
            <ul className="flex flex-col gap-2.5">
              {o.changes.map((c) => (
                <li key={c.key} className="flex items-start gap-2.5">
                  {c.tone === "positive" ? (
                    <TrendingUp size={16} className="mt-0.5 shrink-0 text-ink" />
                  ) : c.tone === "negative" ? (
                    <TrendingDown size={16} className="mt-0.5 shrink-0 text-signal" />
                  ) : (
                    <Activity size={16} className="mt-0.5 shrink-0 text-ink-soft" />
                  )}
                  <span className="text-sm font-semibold">{c.text}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>

      {/* ---------- needs attention + going well ---------- */}
      <div className="mt-8 grid grid-cols-1 gap-8 lg:grid-cols-[1.4fr_1fr]">
        <section>
          <h2 className={SECTION_TITLE}>Needs your attention</h2>
          <div className="mt-3 flex flex-col gap-3">
            {o.attention.length === 0 ? (
              <div className={`${CARD} text-center`}>
                <p className="text-sm font-extrabold">Nothing needs your attention</p>
                <p className="mt-1 text-sm text-ink-soft">Autopilot will surface it here first.</p>
              </div>
            ) : (
              o.attention.map((s) => (
                <AttentionCard
                  key={s.key}
                  signal={s}
                  busy={busyKey === s.key}
                  onAct={() => s.action && takeAction(s.action.command, s.key)}
                  onIgnore={() => ignoreSignal(s.key)}
                  onAsk={() => askAbout(s)}
                />
              ))
            )}
          </div>
        </section>

        <section>
          <h2 className={SECTION_TITLE}>Going well</h2>
          <div className="mt-3 flex flex-col gap-3">
            {o.opportunities.length === 0 ? (
              <div className={`${CARD} text-center`}>
                <p className="text-sm text-ink-soft">Positive signals will appear here.</p>
              </div>
            ) : (
              o.opportunities.map((s) => (
                <div key={s.key} className={CARD}>
                  <div className="flex items-start justify-between gap-3">
                    <p className="text-sm font-extrabold leading-snug">{s.title}</p>
                    <span className={`shrink-0 rounded-pill px-2.5 py-0.5 text-[11px] font-bold ${SEVERITY_CHIP[s.severity].cls}`}>
                      {SEVERITY_CHIP[s.severity].label}
                    </span>
                  </div>
                  <p className="mt-1.5 text-sm text-ink-soft">{s.body}</p>
                  {s.action && (
                    <button
                      onClick={() => takeAction(s.action!.command, s.key)}
                      disabled={busyKey === s.key}
                      className="mt-3 inline-flex items-center gap-1 rounded-btn px-3.5 py-1.5 text-sm font-bold ring-1 ring-inset ring-ink transition-colors hover:bg-cream-deep disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {s.action.label} <ChevronRight size={14} />
                    </button>
                  )}
                </div>
              ))
            )}
          </div>
        </section>
      </div>

      {/* ---------- forecast + recommendations ---------- */}
      <div className="mt-8 grid grid-cols-1 gap-8 lg:grid-cols-2">
        <section>
          <h2 className={SECTION_TITLE}>Forecast</h2>
          <div className={`${CARD} mt-3`}>
            <div className="flex flex-wrap items-baseline gap-x-6 gap-y-2">
              <div>
                <p className="text-xs font-bold uppercase tracking-wide text-ink-soft">This month, projected</p>
                <p className="font-display text-3xl font-bold">
                  ${o.forecast.projection.toLocaleString("en-US")}
                </p>
              </div>
              <div>
                <p className="text-xs font-bold uppercase tracking-wide text-ink-soft">Target</p>
                <p className="text-xl font-extrabold">${o.forecast.target.toLocaleString("en-US")}</p>
              </div>
              <span
                className={`rounded-pill px-2.5 py-0.5 text-[11px] font-bold ${
                  o.forecast.on_track ? "bg-cream-deep text-ink" : "bg-signal/15 text-ink"
                }`}
              >
                {o.forecast.on_track
                  ? "On track"
                  : `Tracking $${Math.abs(o.forecast.gap).toLocaleString("en-US")} short`}
              </span>
            </div>
            <p className="mt-3 text-sm text-ink-soft">{o.forecast.note}</p>
            {o.forecast.causes.length > 0 && (
              <div className="mt-3">
                <p className="text-xs font-extrabold uppercase tracking-wide text-ink-soft">Main causes</p>
                <ul className="mt-1.5 flex flex-col gap-1">
                  {o.forecast.causes.map((c) => (
                    <li key={c} className="flex items-start gap-2 text-sm font-semibold">
                      <AlertTriangle size={14} className="mt-0.5 shrink-0 text-ink-soft" />
                      {c}
                    </li>
                  ))}
                </ul>
              </div>
            )}
            <p className="mt-3 text-[11px] font-semibold text-ink-soft">
              {confidenceLabel(o.forecast.confidence)} · estimate, not a guarantee
            </p>
          </div>
        </section>

        <section>
          <h2 className={SECTION_TITLE}>What should we do next</h2>
          <div className="mt-3 flex flex-col gap-3">
            {o.recommendations.length === 0 ? (
              <div className={`${CARD} text-center`}>
                <p className="text-sm text-ink-soft">No recommendations right now — steady as she goes.</p>
              </div>
            ) : (
              o.recommendations.map((r) => (
                <RecommendationCard
                  key={r.key}
                  rec={r}
                  busy={busyKey === r.action.command}
                  onAct={() => takeAction(r.action.command)}
                />
              ))
            )}
          </div>
        </section>
      </div>

      {/* ---------- signals ---------- */}
      <section className="mt-8">
        <h2 className={SECTION_TITLE}>Signals</h2>
        <div className="mt-3 flex flex-col gap-2">
          {o.signals.map((s) => (
            <div
              key={s.key}
              className={`${CARD} py-3.5 ${s.status === "ignored" ? "opacity-55" : ""}`}
            >
              <div className="flex flex-wrap items-center gap-2.5">
                <span className={`rounded-pill px-2.5 py-0.5 text-[11px] font-bold ${SEVERITY_CHIP[s.severity].cls}`}>
                  {SEVERITY_CHIP[s.severity].label}
                </span>
                <p className="min-w-0 flex-1 text-sm font-extrabold">{s.title}</p>
                {s.status === "new" && (
                  <span className="rounded-pill bg-signal px-2 py-0.5 text-[10px] font-black uppercase tracking-wide text-ink">
                    New
                  </span>
                )}
                {s.status === "ignored" && (
                  <span className="text-[11px] font-bold text-ink-soft">ignored</span>
                )}
                {s.status === "actioned" && (
                  <span className="inline-flex items-center gap-1 text-[11px] font-bold text-ink-soft">
                    <Check size={12} /> acted on
                  </span>
                )}
              </div>
              <p className="mt-1.5 text-sm text-ink-soft">{s.body}</p>
              {s.metrics.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-x-5 gap-y-1">
                  {s.metrics.map((m) => (
                    <span key={m.label} className="text-xs font-semibold text-ink-soft">
                      {m.label}: <span className="font-extrabold text-ink">{m.value}</span>
                    </span>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      </section>

      {/* ---------- business map ---------- */}
      <section className="mt-8">
        <h2 className={SECTION_TITLE}>Business map</h2>
        <div className={`${CARD} mt-3`}>
          <div className="flex flex-col items-stretch gap-2 sm:flex-row sm:items-center">
            {o.map.funnel.map((f, i) => (
              <div key={f.key} className="flex flex-1 items-center gap-2">
                <div className="flex-1 rounded-card bg-cream-deep px-3.5 py-3 text-center">
                  <p className="text-xs font-extrabold uppercase tracking-wide text-ink-soft">{f.label}</p>
                  <p className="mt-0.5 text-sm font-extrabold">{f.value}</p>
                  {f.change && (
                    <p className={`mt-0.5 inline-flex items-center gap-1 text-[11px] font-bold ${f.trend === "down" ? "text-signal" : "text-ink-soft"}`}>
                      {f.trend === "up" ? <TrendingUp size={12} /> : f.trend === "down" ? <TrendingDown size={12} /> : null}
                      {f.change}
                    </p>
                  )}
                </div>
                {i < o.map.funnel.length - 1 && (
                  <ArrowRight size={16} className="hidden shrink-0 text-ink-soft sm:block" />
                )}
              </div>
            ))}
          </div>
          <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {o.map.areas.map((a) => (
              <div key={a.key} className="rounded-card border border-line/60 p-4">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-sm font-extrabold">{a.label}</p>
                  <span className={`text-xs font-bold ${healthTone(a.status)}`}>
                    {HEALTH_LABEL[a.status]}
                  </span>
                </div>
                <p className="mt-1 text-xs text-ink-soft">{a.summary}</p>
                {a.systems.length > 0 && (
                  <p className="mt-2 text-[11px] font-semibold text-ink-soft">
                    {a.systems.join(" · ")}
                  </p>
                )}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ---------- ask cosigno ---------- */}
      <section className="mt-8" ref={askRef}>
        <h2 className={SECTION_TITLE}>Ask about your business</h2>
        <div className={`${CARD} mt-3`}>
          <form
            className="flex items-center gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              ask(question);
            }}
          >
            <Search size={16} className="shrink-0 text-ink-soft" />
            <input
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              placeholder="Why did revenue drop? Where are we wasting money?"
              className="min-w-0 flex-1 bg-transparent text-sm font-semibold outline-none placeholder:text-ink-soft/70"
              maxLength={500}
              aria-label="ask about your business"
            />
            <button
              type="submit"
              disabled={asking || !question.trim()}
              className="shrink-0 rounded-btn bg-ink px-4 py-1.5 text-sm font-bold text-cream disabled:bg-cream-deep disabled:text-ink-soft disabled:shadow-none disabled:cursor-not-allowed"
            >
              {asking ? "Thinking…" : "Ask"}
            </button>
          </form>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {[
              "Why did revenue drop?",
              "Where are we wasting money?",
              "Are we likely to miss our revenue target?",
              "What should I focus on this week?",
            ].map((q) => (
              <button
                key={q}
                onClick={() => {
                  setQuestion(q);
                  ask(q);
                }}
                className="rounded-pill bg-cream-deep px-3 py-1 text-xs font-bold text-ink-soft transition-colors hover:text-ink"
              >
                {q}
              </button>
            ))}
          </div>
          {answer && (
            <div className="mt-4 border-t border-line/60 pt-4">
              <p className="text-sm font-extrabold leading-relaxed">{answer.answer}</p>
              {answer.evidence.length > 0 && (
                <ul className="mt-2.5 flex flex-col gap-1">
                  {answer.evidence.map((e) => (
                    <li key={e} className="flex items-start gap-2 text-sm text-ink-soft">
                      <Sparkles size={13} className="mt-0.5 shrink-0" />
                      {e}
                    </li>
                  ))}
                </ul>
              )}
              {answer.metrics.length > 0 && (
                <div className="mt-2.5 flex flex-wrap gap-x-5 gap-y-1">
                  {answer.metrics.map((m) => (
                    <span key={m.label} className="text-xs font-semibold text-ink-soft">
                      {m.label}: <span className="font-extrabold text-ink">{m.value}</span>
                    </span>
                  ))}
                </div>
              )}
              <p className="mt-2.5 text-[11px] font-semibold text-ink-soft">
                {confidenceLabel(answer.confidence)} · Next step: {answer.next_step}
              </p>
              {answer.action && (
                <button
                  onClick={() => takeAction(answer.action!.command)}
                  disabled={busyKey === answer.action.command}
                  className="mt-3 inline-flex items-center gap-1 rounded-btn bg-signal px-4 py-2 text-sm font-extrabold text-ink shadow-soft transition-transform active:scale-95 disabled:bg-cream-deep disabled:text-ink-soft disabled:shadow-none disabled:cursor-not-allowed"
                >
                  {answer.action.label} <ChevronRight size={14} />
                </button>
              )}
            </div>
          )}
        </div>
      </section>
    </div>
  );
}

/* ---------------------------------------------------------- subcomponents */

function HealthPanel({ health }: { health: BusinessHealth }) {
  const [open, setOpen] = useState<string | null>(null);
  return (
    <div className={`${CARD} mt-3`}>
      <div className="flex items-baseline gap-3">
        <p className="font-display text-4xl font-bold">
          {health.score === null ? "—" : health.score}
          <span className="text-lg font-bold text-ink-soft"> / 100</span>
        </p>
        <p className="text-sm font-extrabold">{health.label}</p>
      </div>
      <div className="mt-4 grid grid-cols-1 gap-x-6 sm:grid-cols-2 lg:grid-cols-3">
        {health.categories.map((c) => {
          const isOpen = open === c.key;
          return (
            <div key={c.key} className="border-b border-line/50">
              <button
                onClick={() => setOpen(isOpen ? null : c.key)}
                aria-expanded={isOpen}
                className="flex w-full items-center justify-between gap-2 py-2.5 text-left"
              >
                <span className="text-sm font-extrabold">{c.label}</span>
                <span className="flex items-center gap-1.5">
                  <span className={`text-xs font-bold ${healthTone(c.status)}`}>
                    {HEALTH_LABEL[c.status]}
                  </span>
                  <ChevronDown
                    size={14}
                    className={`text-ink-soft transition-transform ${isOpen ? "rotate-180" : ""}`}
                  />
                </span>
              </button>
              {isOpen && (
                <div className="pb-3">
                  <p className="text-xs text-ink-soft">{c.summary}</p>
                  {c.evidence.length > 0 && (
                    <div className="mt-1.5 flex flex-wrap gap-x-4 gap-y-0.5">
                      {c.evidence.map((e) => (
                        <span key={e.label} className="text-[11px] font-semibold text-ink-soft">
                          {e.label}: <span className="font-extrabold text-ink">{e.value}</span>
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function AttentionCard({
  signal: s,
  busy,
  onAct,
  onIgnore,
  onAsk,
}: {
  signal: SignalView;
  busy: boolean;
  onAct: () => void;
  onIgnore: () => void;
  onAsk: () => void;
}) {
  return (
    <div className={`${CARD} ${s.severity === "critical" ? "border-ink/40" : "border-signal/40"}`}>
      <div className="flex items-start justify-between gap-3">
        <p className="text-base font-extrabold leading-snug">{s.title}</p>
        <span className={`shrink-0 rounded-pill px-2.5 py-0.5 text-[11px] font-bold ${SEVERITY_CHIP[s.severity].cls}`}>
          {SEVERITY_CHIP[s.severity].label}
        </span>
      </div>
      <p className="mt-1.5 text-sm text-ink-soft">{s.body}</p>
      <p className="mt-2 text-sm">
        <span className="font-extrabold">Why it matters: </span>
        <span className="text-ink-soft">{s.why}</span>
      </p>
      <p className="mt-1 text-sm">
        <span className="font-extrabold">Estimated impact: </span>
        <span className="text-ink-soft">{s.impact}</span>
      </p>
      {s.action && (
        <p className="mt-1 text-sm">
          <span className="font-extrabold">Recommended: </span>
          <span className="text-ink-soft">{s.action.label}</span>
        </p>
      )}
      <p className="mt-2 text-[11px] font-semibold text-ink-soft">{confidenceLabel(s.confidence)}</p>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        {s.action && (
          <button
            onClick={onAct}
            disabled={busy}
            className="inline-flex items-center gap-1 rounded-btn bg-signal px-4 py-2 text-sm font-extrabold text-ink shadow-soft transition-transform active:scale-95 disabled:bg-cream-deep disabled:text-ink-soft disabled:shadow-none disabled:cursor-not-allowed"
          >
            {busy ? "Preparing…" : "Review action"} <ChevronRight size={14} />
          </button>
        )}
        <button
          onClick={onIgnore}
          disabled={busy}
          className="inline-flex items-center gap-1 rounded-btn px-3.5 py-2 text-sm font-bold text-ink-soft transition-colors hover:bg-cream-deep hover:text-ink disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <X size={14} /> Ignore
        </button>
        <button
          onClick={onAsk}
          className="inline-flex items-center gap-1 rounded-btn px-3.5 py-2 text-sm font-bold text-ink-soft transition-colors hover:bg-cream-deep hover:text-ink"
        >
          Ask Cosigno
        </button>
      </div>
    </div>
  );
}

function RecommendationCard({
  rec,
  busy,
  onAct,
}: {
  rec: Recommendation;
  busy: boolean;
  onAct: () => void;
}) {
  return (
    <div className={CARD}>
      <p className="text-sm font-extrabold">{rec.title}</p>
      <p className="mt-1 text-sm text-ink-soft">{rec.reason}</p>
      <p className="mt-1 text-xs font-semibold text-ink-soft">{rec.impact}</p>
      <div className="mt-3 flex items-center justify-between gap-3">
        <span className="text-[11px] font-semibold text-ink-soft">{confidenceLabel(rec.confidence)}</span>
        <button
          onClick={onAct}
          disabled={busy}
          className="inline-flex items-center gap-1 rounded-btn px-3.5 py-1.5 text-sm font-bold ring-1 ring-inset ring-ink transition-colors hover:bg-cream-deep disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {busy ? "Preparing…" : "Take action"} <ChevronRight size={14} />
        </button>
      </div>
    </div>
  );
}
