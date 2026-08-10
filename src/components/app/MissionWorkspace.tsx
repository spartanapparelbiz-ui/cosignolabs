"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  CheckCircle2,
  ChevronDown,
  Circle,
  CircleDot,
  FileText,
  Globe,
  HelpCircle,
  ExternalLink,
  Link2,
  Loader2,
  MinusCircle,
  OctagonX,
  Pause,
  PauseCircle,
  Play,
  ShieldQuestion,
  Square,
  XCircle,
} from "lucide-react";
import type { ActionRecord, MissionRecord, MissionSourceRecord, MissionStepRecord } from "@/lib/types";
import { OPERATOR_PROFILES } from "@/lib/missions/operators";
import { useToast } from "@/components/Toast";
import { DecisionInbox } from "@/components/app/DecisionInbox";
import { narrateMission, type StepPhase, type WorkApp } from "@/lib/missions/narrate";
import { heroResult } from "@/lib/missions/today";
import { missionStatus, STATUS_TONE } from "@/lib/status";
import { INCREASE_STEPS, type BudgetState } from "@/lib/missions/budget";
import { ConnectorLogo } from "@/components/integrations/ConnectorLogo";
import { MissionReplay } from "@/components/app/mission/MissionReplay";
import { OperatorGraph } from "@/components/app/mission/OperatorGraph";
import { ProgressBar } from "@/components/ui/ProgressBar";

/**
 * The mission workspace: the goal, what cosigno has finished, what it is doing
 * right now, what is left, and — when it has stopped — why, in the words a
 * person would use.
 *
 * The engine's vocabulary stays out of here entirely. Steps, tools, operators,
 * plan versions, and the approval contract exist to make cosigno trustworthy;
 * none of them help anyone understand what is happening. narrateMission does
 * the whole translation, and this component only lays the result out.
 *
 * Every value is read from THIS mission's persisted records only.
 */

const MISSION_ACTIVE = new Set(["queued", "running", "retrying", "verifying"]);
const TERMINAL = new Set(["completed", "partial", "failed", "stopped"]);

async function jsonFetch(url: string, init?: RequestInit) {
  const res = await fetch(url, {
    ...init,
    headers: { "Content-Type": "application/json", ...init?.headers },
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.message || body.error || "something went wrong.");
  return body;
}

function elapsed(iso: string): string {
  const mins = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
  if (mins < 60) return `${mins} min`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ${mins % 60}m`;
  return `${Math.floor(hrs / 24)}d`;
}

export function MissionWorkspace({ missionId }: { missionId: string }) {
  const toast = useToast();
  const [mission, setMission] = useState<MissionRecord | null>(null);
  const [steps, setSteps] = useState<MissionStepRecord[]>([]);
  const [sources, setSources] = useState<MissionSourceRecord[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [budget, setBudget] = useState<BudgetState | null>(null);
  // The mission's decision records, fetched once it is over — the replay
  // needs their boundary/decision timestamps, and a live mission shows its
  // decisions inline instead.
  const [replayActions, setReplayActions] = useState<ActionRecord[] | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const load = useCallback(async () => {
    try {
      const d = await jsonFetch(`/api/missions/${missionId}`);
      setMission(d.mission);
      setSteps(d.steps ?? []);
      setSources(d.sources ?? []);
      setBudget(d.budget ?? null);
      setError(null);
      return d.mission as MissionRecord;
    } catch (e) {
      setError(e instanceof Error ? e.message : "couldn't load this mission.");
      return null;
    }
  }, [missionId]);

  // Keep the engine moving while the mission is active (cron does the same
  // job when nobody is looking).
  useEffect(() => {
    load();
    pollRef.current = setInterval(async () => {
      // Hidden tab: skip the tick entirely — the cron keeps the engine moving.
      if (document.visibilityState === "hidden") return;
      const m = await load();
      if (!m || !MISSION_ACTIVE.has(m.state)) return;
      try {
        await jsonFetch(`/api/missions/${missionId}/advance`, { method: "POST" });
      } catch {
        /* transient — next tick retries */
      }
    }, 4000);
    const onVisible = () => {
      if (document.visibilityState === "visible") load();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [load, missionId]);

  // Once the mission is over, fetch its decision records once for the replay.
  // Live missions never do this — their decisions are on screen already, and
  // a replay of something still happening is just the page, slower.
  const terminal = mission !== null && TERMINAL.has(mission.state);
  const sessionId = mission?.session_id ?? null;
  useEffect(() => {
    if (!terminal || !sessionId || replayActions !== null) return;
    let alive = true;
    jsonFetch(`/api/actions?session=${encodeURIComponent(sessionId)}&limit=100`)
      .then((d) => alive && setReplayActions((d.actions ?? []) as ActionRecord[]))
      .catch(() => alive && setReplayActions([]));
    return () => {
      alive = false;
    };
  }, [terminal, sessionId, replayActions]);

  async function control(op: "pause" | "resume" | "stop") {
    setBusy(op);
    try {
      await jsonFetch(`/api/missions/${missionId}/control`, { method: "POST", body: JSON.stringify({ op }) });
      toast(
        "success",
        op === "pause" ? "paused — no new work will start." : op === "resume" ? "resumed." : "stopped — waiting steps canceled, pending cards vetoed."
      );
      await load();
    } catch (e) {
      toast("error", e instanceof Error ? e.message : "that didn't work.");
    } finally {
      setBusy(null);
    }
  }

  /** Let this mission change more things, and pick up where it stopped. */
  async function addBudget(add: number) {
    setBusy(`budget:${add}`);
    try {
      const d = await jsonFetch(`/api/missions/${missionId}/budget`, {
        method: "POST",
        body: JSON.stringify({ add }),
      });
      setBudget(d.budget ?? null);
      toast("success", `${add} more actions approved — carrying on.`);
      await load();
    } catch (e) {
      toast("error", e instanceof Error ? e.message : "that didn't work.");
    } finally {
      setBusy(null);
    }
  }

  async function answer(value: string) {
    setBusy("answer");
    try {
      await jsonFetch(`/api/missions/${missionId}/answer`, { method: "POST", body: JSON.stringify({ answer: value }) });
      await load();
    } catch (e) {
      toast("error", e instanceof Error ? e.message : "the answer didn't go through.");
    } finally {
      setBusy(null);
    }
  }

  if (error) {
    return (
      <div className="rounded-card bg-surface/60 p-6 text-center shadow-soft">
        <p className="text-sm font-semibold text-ink-soft">{error}</p>
        <Link href="/app/missions" className="mt-3 inline-block rounded-btn px-4 py-2 text-sm font-bold ring-1 ring-inset ring-ink hover:bg-cream-deep">
          all missions
        </Link>
      </div>
    );
  }
  if (!mission) {
    return <div className="h-64 animate-pulse rounded-card bg-cream-deep" aria-hidden="true" aria-busy="true" />;
  }

  const label = missionStatus(mission.state);
  const usesBrowser = steps.some((s) => s.tool.startsWith("laptop.") || s.tool.startsWith("browser."));
  // Only the cards this mission is actually parked on.
  // The whole translation from engine state to human language lives in
  // narrateMission — this component only lays it out.
  const narration = narrateMission(mission, steps);
  // The one sentence this mission is remembered by, and which apps did the
  // work. Both read from what was actually recorded.
  const hero = heroResult(mission, steps);
  const appsUsed = Array.from(
    new Map(
      narration.feed
        .filter((e) => e.phase === "done" && e.app.name)
        .map((e) => [e.app.name!, e.app])
    ).values()
  );
  const awaitingActionIds = steps
    .filter((s) => s.state === "awaiting_approval" && s.action_id)
    .map((s) => s.action_id as string);
  const done = steps.filter((s) => ["completed", "skipped"].includes(s.state)).length;
  const deliverables = steps.filter((s) => typeof s.output?.file_id === "string");
  const receipt = mission.receipt as Record<string, unknown> | null;

  return (
    <div className="flex flex-col gap-5">
      {/* ------------------------------ header ------------------------------ */}
      <div className="flex flex-wrap items-start gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-xs font-bold text-ink-soft">
            <Link href="/app/missions" className="hover:text-ink">missions</Link> / this mission
          </p>
          <h1 className="mt-1 font-display text-xl font-bold sm:text-2xl">{mission.goal}</h1>
          <p className="mt-1 text-xs font-semibold text-ink-soft">
            started {elapsed(mission.created_at)} ago
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <span className={`rounded-pill px-3 py-1 text-xs font-bold ${STATUS_TONE[label]}`}>{label}</span>
          {!TERMINAL.has(mission.state) &&
            (mission.state === "paused" ? (
              // Resume can't move a mission that stopped for running out of
              // changes — only more budget can. Offering the button anyway
              // would be a control that does nothing when pressed.
              <button
                onClick={() => (budget?.exhausted ? addBudget(INCREASE_STEPS[0]) : control("resume"))}
                disabled={busy !== null}
                className="inline-flex items-center gap-1.5 rounded-btn bg-ink px-3.5 py-2 text-xs font-bold text-cream disabled:bg-cream-deep disabled:text-ink-soft disabled:shadow-none disabled:cursor-not-allowed"
              >
                <Play size={12} />
                {budget?.exhausted ? `Allow ${INCREASE_STEPS[0]} more` : "Resume"}
              </button>
            ) : (
              <button
                onClick={() => control("pause")}
                disabled={busy !== null}
                className="inline-flex items-center gap-1.5 rounded-btn px-3.5 py-2 text-xs font-bold ring-1 ring-inset ring-ink/30 hover:bg-cream-deep disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <Pause size={12} /> Pause
              </button>
            ))}
          {!TERMINAL.has(mission.state) && (
            <button
              onClick={() => control("stop")}
              disabled={busy !== null}
              className="inline-flex items-center gap-1.5 rounded-btn px-3.5 py-2 text-xs font-bold ring-1 ring-inset ring-ink hover:bg-cream-deep disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Square size={12} /> Stop
            </button>
          )}
        </div>
      </div>

      {usesBrowser && (
        <Link
          href={`/app/browser/${mission.id}`}
          className="inline-flex w-fit items-center gap-1.5 rounded-btn px-3.5 py-2 text-xs font-bold ring-1 ring-inset ring-ink/30 hover:bg-cream-deep"
        >
          <Globe size={13} aria-hidden="true" /> open the browser view
        </Link>
      )}

      {/* Ran out of changes. Not an error and not a failure — cosigno did
          exactly what it was told and stopped. The three answers are the three
          things a person actually wants here: a bit more, a lot more, or
          that's enough. */}
      {budget?.exhausted && mission.state === "paused" && (
        <div className="rounded-card bg-signal/10 p-4 ring-1 ring-inset ring-signal/30">
          <p className="text-sm font-extrabold">
            this mission reached its execution limit — {budget.used} of {budget.limit} action
            {budget.limit === 1 ? "" : "s"} used.
          </p>
          <p className="mt-0.5 text-xs text-ink-soft">
            it hasn&apos;t started anything else. how much further should it go?
          </p>
          <div className="mt-2.5 flex flex-wrap gap-2">
            {INCREASE_STEPS.map((n) => (
              <button
                key={n}
                onClick={() => addBudget(n)}
                disabled={busy !== null}
                className={`rounded-btn px-3.5 py-1.5 text-xs font-bold disabled:bg-cream-deep disabled:text-ink-soft disabled:shadow-none disabled:cursor-not-allowed ${
                  n === INCREASE_STEPS[0]
                    ? "bg-signal text-on-signal"
                    : "ring-1 ring-inset ring-ink/30 hover:bg-cream-deep"
                }`}
              >
                +{n} actions
              </button>
            ))}
            <button
              onClick={() => control("stop")}
              disabled={busy !== null}
              className="rounded-btn px-3.5 py-1.5 text-xs font-bold ring-1 ring-inset ring-ink hover:bg-cream-deep disabled:opacity-50 disabled:cursor-not-allowed"
            >
              that&apos;s enough — finish here
            </button>
          </div>
        </div>
      )}

      {/* question needing the user */}
      {mission.pending_question && (
        <div className="rounded-card bg-signal/10 p-4 ring-1 ring-inset ring-signal/30">
          <p className="text-sm font-extrabold">{mission.pending_question.question}</p>
          <p className="mt-0.5 text-xs text-ink-soft">
            why: {mission.pending_question.why} · effect: {mission.pending_question.effect}
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            {mission.pending_question.options.map((o) => (
              <button
                key={o}
                onClick={() => answer(o)}
                disabled={busy === "answer"}
                className={`rounded-btn px-3.5 py-1.5 text-xs font-bold disabled:bg-cream-deep disabled:text-ink-soft disabled:shadow-none disabled:cursor-not-allowed ${
                  o === mission.pending_question?.recommended ? "bg-signal text-on-signal" : "ring-1 ring-inset ring-ink/30 hover:bg-cream-deep"
                }`}
              >
                {o}
                {o === mission.pending_question?.recommended && " (recommended)"}
              </button>
            ))}
          </div>
        </div>
      )}

      {mission.state === "awaiting_approval" && (
        <p className="rounded-btn bg-cream-deep px-3 py-2 text-xs font-semibold">
          a consequential step is waiting for your signature. the mission resumes
          automatically after you decide.
        </p>
      )}

      {/* The decision itself, on the mission that raised it. Scoped to THIS
          mission's cards, so approving here can never sign off something
          unrelated that happened to be sitting in the shared queue. */}
      {awaitingActionIds.length > 0 && (
        <DecisionInbox only={awaitingActionIds} compact emptyFallback={null} />
      )}

      {/* ------------------- timeline + right panel ------------------- */}
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[1.5fr_1fr]">
        {/* ------------------------- the work feed ------------------------- */}
        <section className="flex flex-col gap-3">
          {/* THE RECEIPT — what this actually achieved, once it is over. One
              card, the hero sentence first, then the evidence that backs it.
              Only shown when the work has settled: a receipt for something
              still running would be a claim about an unfinished outcome. */}
          {narration.finished && (
            <div className="rounded-card border border-signal/40 bg-surface p-4 shadow-soft">
              <p className="text-[10px] font-extrabold uppercase tracking-widest text-ink-soft">
                {mission.state === "completed" ? "Done" : "Result"}
              </p>
              <p className="mt-1 font-display text-lg font-bold leading-snug">
                {hero ?? narration.status}
              </p>
              {hero && (
                <p className="mt-0.5 text-[11px] font-semibold text-ink-soft">
                  {narration.status}
                </p>
              )}
              {appsUsed.length > 0 && (
                <div className="mt-3 flex flex-wrap items-center gap-1.5">
                  {appsUsed.map((a) => (
                    <span
                      key={a.name}
                      className="inline-flex items-center gap-1.5 rounded-pill bg-cream-deep px-2 py-1 text-[11px] font-bold"
                    >
                      {a.providerKey && (
                        <ConnectorLogo kind="app" providerKey={a.providerKey} displayName={a.name ?? ""} size={14} />
                      )}
                      {a.name}
                    </span>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* NOW WORKING — always pinned, never empty. When nothing is running
              it says so plainly rather than showing a blank panel. */}
          <div className="rounded-card border border-line/70 bg-surface p-4 shadow-soft">
            <p className="text-[10px] font-extrabold uppercase tracking-widest text-ink-soft">
              Now working
            </p>
            {narration.nowWorking ? (
              <div className="mt-2 flex items-start gap-3">
                <WorkAppMark app={narration.nowWorking.app} />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-extrabold leading-snug">
                    {narration.nowWorking.headline}
                  </p>
                  {(narration.nowWorking.app.department ?? narration.nowWorking.app.name) && (
                    <p className="text-[11px] font-bold text-ink-soft">
                      {narration.nowWorking.app.department ?? narration.nowWorking.app.name}
                      {narration.nowWorking.app.department && narration.nowWorking.app.name
                        ? ` · ${narration.nowWorking.app.name}`
                        : ""}
                    </p>
                  )}
                  {narration.nowWorking.at && (
                    <p className="mt-0.5 text-[11px] text-ink-soft">
                      started {elapsed(narration.nowWorking.at)} ago
                    </p>
                  )}
                </div>
                {narration.nowWorking.phase === "current" && (
                  <Loader2 size={16} className="mt-0.5 shrink-0 animate-spin text-ink" aria-hidden="true" />
                )}
              </div>
            ) : (
              <p className="mt-2 text-sm font-bold">
                {narration.finished ? "Everything finished." : "Nothing running right now."}
              </p>
            )}

            {/* Why it stopped, in the words a person would use. */}
            {narration.pausedBecause && (
              <p className="mt-3 flex items-start gap-2 rounded-btn bg-signal/10 px-3 py-2 text-xs font-semibold ring-1 ring-inset ring-signal/30">
                <PauseCircle size={14} className="mt-px shrink-0 text-signal" aria-hidden="true" />
                <span>{narration.pausedBecause}</span>
              </p>
            )}

            {/* Exactly one next thing. Five future items is a plan, and nobody
                reads a plan — they want to know what follows this. */}
            {!narration.finished && narration.upNext && (
              <p className="mt-3 border-t border-line/60 pt-2 text-[11px] text-ink-soft">
                <span className="font-bold text-ink">Next:</span> {narration.upNext.headline}
                {narration.upNext.app.name ? ` in ${narration.upNext.app.name}` : ""}
              </p>
            )}
          </div>

          {/* THE PLAN, as the graph it actually is.
              A numbered list renders "these three run at once" and "these
              three run in order" identically, and those are different plans
              with different durations. The graph is where "why is this taking
              so long" has a visible answer — and it is read from the steps'
              own depends_on, never inferred. */}
          {steps.length > 1 && (
            <div className="rounded-card border border-line/70 bg-surface p-4 shadow-soft">
              <OperatorGraph steps={steps} />
            </div>
          )}

          {/* THE FEED — accomplishments, oldest first, grouped by who did them. */}
          <div className="rounded-card border border-line/70 bg-surface p-4 shadow-soft">
            <ol className="flex flex-col">
              {narration.groups.map((g, gi) => {
                const lastGroup = gi === narration.groups.length - 1;
                const pending = g.entries[0].phase === "upcoming";
                return (
                  <li key={g.key} className="flex gap-3">
                    <div className="flex flex-col items-center">
                      <WorkAppMark app={g.app} phase={g.entries[0].phase} small />
                      {!lastGroup && <span className="w-px flex-1 bg-line" aria-hidden="true" />}
                    </div>

                    <div className={`min-w-0 flex-1 ${lastGroup ? "pb-0" : "pb-4"}`}>
                      {/* Who did it — the department leads, the app stays
                          visible so nothing is hidden behind a friendly name. */}
                      <p className={`text-[11px] font-extrabold ${pending ? "text-ink-soft" : ""}`}>
                        {g.app.department ?? g.app.name ?? "cosigno"}
                        {g.app.name && g.app.department && (
                          <span className="ml-1.5 font-semibold text-ink-soft">· {g.app.name}</span>
                        )}
                      </p>

                      <ul className="mt-1 flex flex-col gap-2">
                        {g.entries.map((e) => (
                          <li key={e.id} className="animate-rise-in">
                            <div className="flex items-baseline gap-2">
                              {/* The outcome first. Metadata never precedes
                                  the result. */}
                              <p
                                className={`min-w-0 flex-1 text-xs ${
                                  e.phase === "upcoming"
                                    ? "font-semibold text-ink-soft"
                                    : e.phase === "skipped"
                                      ? "font-semibold text-ink-soft line-through"
                                      : "font-bold"
                                }`}
                              >
                                {e.headline}
                              </p>
                              {e.at && (
                                <span className="shrink-0 text-[10px] tabular-nums text-ink-soft">
                                  {clockTime(e.at)}
                                </span>
                              )}
                            </div>
                            {e.detail && (
                              <p className="mt-0.5 text-[11px] text-ink-soft">{e.detail}</p>
                            )}
                            {e.blockedReason && (
                              <p className="mt-0.5 text-[11px] font-semibold">{e.blockedReason}</p>
                            )}
                            {e.proof &&
                              (e.proof.external ? (
                                <a
                                  href={e.proof.href}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="mt-1 inline-flex items-center gap-1 rounded-btn bg-cream-deep px-2 py-1 text-[11px] font-bold transition-colors hover:bg-cream-deep/70"
                                >
                                  {e.proof.label} <ExternalLink size={10} aria-hidden="true" />
                                </a>
                              ) : (
                                <Link
                                  href={e.proof.href}
                                  className="mt-1 inline-flex items-center gap-1 rounded-btn bg-cream-deep px-2 py-1 text-[11px] font-bold transition-colors hover:bg-cream-deep/70"
                                >
                                  {e.proof.label}
                                </Link>
                              ))}
                          </li>
                        ))}
                      </ul>
                    </div>
                  </li>
                );
              })}
            </ol>
          </div>

          {/* THE REPLAY — recorded history, scrubbable, for finished missions.
              Outcomes hide where time went; the replay shows that the two-day
              mission was a minute of work and one long wait on a decision. */}
          {terminal && replayActions !== null && (
            <MissionReplay mission={mission} steps={steps} actions={replayActions} />
          )}
        </section>

        {/* right panel: plan, sources, results, usage */}
        <div className="flex flex-col gap-4">
          <section className="rounded-card border border-line/70 bg-surface p-4 shadow-soft">
            <h2 className="text-xs font-extrabold uppercase tracking-widest text-ink-soft">Progress</h2>
            <p className="mt-1.5 text-sm font-bold">{narration.status}</p>
            {steps.length > 0 && (
              <>
                <div className="mt-2.5">
                  {/* Counted from step states — the shared bar, so mission
                      progress here and on home can't drift into two different
                      readings of the same work. */}
                  <ProgressBar
                    value={done / steps.length}
                    label={`${done} of ${steps.length} steps completed`}
                  />
                </div>
                <p className="mt-1.5 font-mono text-[10px] font-bold tabular-nums text-ink-soft">
                  {done}/{steps.length} steps · {Math.round((done / steps.length) * 100)}%
                </p>
              </>
            )}
          </section>

          {sources.length > 0 && (
            <section className="rounded-card border border-line/70 bg-surface p-4 shadow-soft">
              <h2 className="text-xs font-extrabold uppercase tracking-widest text-ink-soft">Sources you provided</h2>
              <ul className="mt-2 flex flex-col gap-1.5">
                {sources.map((src) => (
                  <li key={src.id} className="flex items-start gap-2 text-xs">
                    <span className="mt-0.5 shrink-0 text-ink-soft">
                      {src.kind === "link" ? <Link2 size={12} /> : <FileText size={12} />}
                    </span>
                    <span className="min-w-0">
                      <span className="font-bold">{src.name}</span>
                      <span className="block text-[11px] text-ink-soft">
                        {src.status === "ready" ? "read as context" : "couldn't be read — not used"}
                      </span>
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {deliverables.length > 0 && (
            <section className="rounded-card border border-line/70 bg-surface p-4 shadow-soft">
              <h2 className="text-xs font-extrabold uppercase tracking-widest text-ink-soft">Results</h2>
              <ul className="mt-2 flex flex-col gap-1.5">
                {deliverables.map((s) => (
                  <li key={s.id} className="text-xs font-semibold">
                    <Link href="/app/files" className="underline underline-offset-2">
                      {String(s.output?.file_name ?? "deliverable")}
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {/* What this mission has DONE, against what it's allowed to do.
              Thinking, reading and drafting are free and never appear here — a
              counter that ticked up while cosigno was reading would be
              measuring effort, and effort isn't the thing anyone worries
              about. */}
          <section className="rounded-card border border-line/70 bg-surface p-4 shadow-soft">
            <h2 className="text-xs font-extrabold uppercase tracking-widest text-ink-soft">
              Execution budget
            </h2>
            {budget === null ? (
              <p className="mt-1.5 text-xs text-ink-soft">counting…</p>
            ) : budget.unlimited ? (
              <>
                <p className="mt-1.5 text-2xl font-extrabold tabular-nums">{budget.used}</p>
                <p className="mt-0.5 text-xs font-bold text-ink-soft">
                  action{budget.used === 1 ? "" : "s"} used · unlimited
                </p>
                <p className="mt-2 text-[11px] leading-snug text-ink-soft">
                  no action limit. every action still follows your permissions.
                </p>
              </>
            ) : (
              <>
                <p className="mt-1.5 text-2xl font-extrabold tabular-nums">
                  {budget.used}
                  <span className="text-base font-bold text-ink-soft"> / {budget.limit}</span>
                </p>
                <p className="mt-0.5 text-xs font-bold text-ink-soft">actions used</p>
                <div
                  className="mt-2 h-1.5 overflow-hidden rounded-pill bg-cream-deep"
                  role="progressbar"
                  aria-valuenow={budget.used}
                  aria-valuemin={0}
                  aria-valuemax={budget.limit}
                  aria-label="actions used against this mission's execution budget"
                >
                  <div
                    className="h-full rounded-pill bg-ink transition-all duration-base ease-brand-out"
                    style={{ width: `${Math.min(100, (budget.used / Math.max(1, budget.limit)) * 100)}%` }}
                  />
                </div>
                {budget.committed > budget.used && (
                  <p className="mt-2 text-[11px] text-ink-soft">
                    {budget.committed - budget.used} waiting on you, already counted.
                  </p>
                )}
              </>
            )}
            <p className="mt-2 text-[11px] leading-snug text-ink-soft">
              {budget && budget.kinds.length > 0
                ? budget.kinds.join(" · ").toLowerCase()
                : "reading, searching and drafting don't count."}
            </p>
          </section>

          {/* THE EXECUTION SUMMARY — what this mission actually did, in the
              same unit the limit was set in. No money, no token counts, no
              provider costs: the question a receipt answers is "what did this
              do", not "what did this cost us to run". */}
          {receipt !== null && (
            <section className="rounded-card border border-line/70 bg-surface p-4 shadow-soft">
              <h2 className="text-xs font-extrabold uppercase tracking-widest text-ink-soft">
                Execution summary
              </h2>
              <dl className="mt-2.5 flex flex-col gap-1.5">
                {[
                  {
                    k: "steps automated",
                    v: `${(receipt.completed_steps as unknown[])?.length ?? 0}`,
                  },
                  {
                    k: "actions",
                    v: `${(receipt.changes as { made?: number } | null)?.made ?? budget?.used ?? 0}`,
                  },
                  {
                    k: "apps",
                    v: Array.isArray(receipt.apps) ? `${(receipt.apps as string[]).length}` : "0",
                  },
                  { k: "approvals", v: `${(receipt.approvals as number) ?? 0}` },
                  {
                    k: "deliverables",
                    v: `${(receipt.deliverables as unknown[])?.length ?? 0}`,
                  },
                ].map((r) => (
                  <div key={r.k} className="flex items-baseline justify-between gap-3">
                    <dt className="text-xs text-ink-soft">{r.k}</dt>
                    <dd className="text-sm font-extrabold tabular-nums">{r.v}</dd>
                  </div>
                ))}
              </dl>
              {Array.isArray(receipt.apps) && (receipt.apps as string[]).length > 0 && (
                <p className="mt-2 border-t border-line/60 pt-2 text-[11px] text-ink-soft">
                  {(receipt.apps as string[]).join(" · ")}
                </p>
              )}
            </section>
          )}
        </div>
      </div>
    </div>
  );
}

/**
 * The app a piece of work happened in, as its logo — so the feed reads as
 * "GitHub did this, then Gmail did that" at a glance, from across a room.
 *
 * Work cosigno did by itself gets a neutral mark rather than a borrowed logo:
 * attributing cosigno's own bookkeeping to GitHub would be a small lie that
 * makes the whole feed untrustworthy.
 */
function WorkAppMark({
  app,
  phase,
  small = false,
}: {
  app: WorkApp;
  phase?: StepPhase;
  small?: boolean;
}) {
  const size = small ? 22 : 30;
  const done = phase === "done";
  const pending = phase === "upcoming";

  if (app.providerKey) {
    return (
      <span className={pending ? "opacity-40" : ""}>
        <ConnectorLogo kind="app" providerKey={app.providerKey} displayName={app.name ?? ""} size={size} />
      </span>
    );
  }
  return (
    <span
      className={`flex shrink-0 items-center justify-center rounded-btn ${
        pending ? "bg-cream-deep/60 text-ink-soft/50" : done ? "bg-signal/15 text-signal" : "bg-cream-deep text-ink-soft"
      }`}
      style={{ width: size, height: size }}
      aria-hidden="true"
    >
      {done ? <CheckCircle2 size={small ? 12 : 15} /> : <Circle size={small ? 12 : 15} />}
    </span>
  );
}

/** Wall-clock time, the way the feed reads it: 10:41. */
function clockTime(iso: string): string {
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return "";
  return new Date(t).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}
