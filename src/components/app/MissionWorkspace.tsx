"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  CheckCircle2,
  ChevronDown,
  Circle,
  FileText,
  Globe,
  ExternalLink,
  Link2,
  Loader2,
  Pause,
  Play,
  Square,
} from "lucide-react";
import type { MissionRecord, MissionSourceRecord, MissionStepRecord } from "@/lib/types";
import { OPERATOR_PROFILES } from "@/lib/missions/operators";
import { useToast } from "@/components/Toast";
import { DecisionInbox } from "@/components/app/DecisionInbox";
import { narrateMission, type StepPhase, type WorkApp } from "@/lib/missions/narrate";
import { heroResult } from "@/lib/missions/today";
import { missionStatus, STATUS_TONE } from "@/lib/status";
import { badge, btn, card, dot, field } from "@/components/ui/styles";
import { INCREASE_STEPS, type BudgetState } from "@/lib/missions/budget";
import { ConnectorLogo } from "@/components/integrations/ConnectorLogo";

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
  if (!res.ok) throw new Error(body.message || body.error || "Something went wrong.");
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
      setError(e instanceof Error ? e.message : "Couldn't load this mission.");
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

  async function control(op: "pause" | "resume" | "stop") {
    setBusy(op);
    try {
      await jsonFetch(`/api/missions/${missionId}/control`, { method: "POST", body: JSON.stringify({ op }) });
      toast(
        "success",
        op === "pause" ? "paused — no new work will start." : op === "resume" ? "resumed." : "Stopped — waiting steps canceled, pending cards vetoed."
      );
      await load();
    } catch (e) {
      toast("error", e instanceof Error ? e.message : "That didn't work.");
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
      toast("error", e instanceof Error ? e.message : "That didn't work.");
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
      toast("error", e instanceof Error ? e.message : "The answer didn't go through.");
    } finally {
      setBusy(null);
    }
  }

  if (error) {
    return (
      <div className="px-6 py-16 text-center">
        <p className="t-body">{error}</p>
        <Link href="/app/missions" className="mt-3 inline-block rounded-btn px-4 py-2 text-sm font-semibold ring-1 ring-inset ring-ink hover:bg-cream-deep">
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
      <div className="flex flex-wrap items-start gap-4">
        <div className="min-w-0 flex-1">
          <Link href="/app/missions" className="t-caption inline-flex items-center gap-1.5 transition-colors duration-fast hover:text-ink">
            <ChevronDown size={13} strokeWidth={2} className="rotate-90" aria-hidden="true" />
            Missions
          </Link>
          <h1 className="t-display mt-2 text-[1.5rem] sm:text-[1.875rem]">{mission.goal}</h1>
          <p className="t-caption mt-1.5">Started {elapsed(mission.created_at)} ago</p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <span className={badge(STATUS_TONE[label])}>
            <span className={dot(STATUS_TONE[label])} aria-hidden="true" />
            {label}
          </span>
          {!TERMINAL.has(mission.state) &&
            (mission.state === "paused" ? (
              // Resume can't move a mission that stopped for running out of
              // changes — only more budget can. Offering the button anyway
              // would be a control that does nothing when pressed.
              <button
                onClick={() => (budget?.exhausted ? addBudget(INCREASE_STEPS[0]) : control("resume"))}
                disabled={busy !== null}
                className={btn("primary", "sm")}
              >
                <Play size={12} strokeWidth={1.9} />
                {budget?.exhausted ? `Allow ${INCREASE_STEPS[0]} more` : "Resume"}
              </button>
            ) : (
              <button
                onClick={() => control("pause")}
                disabled={busy !== null}
                className={btn("ghost", "sm")}
              >
                <Pause size={12} strokeWidth={1.9} /> Pause
              </button>
            ))}
          {!TERMINAL.has(mission.state) && (
            <button
              onClick={() => control("stop")}
              disabled={busy !== null}
              className={btn("ghost", "sm")}
            >
              <Square size={12} strokeWidth={1.9} /> Stop
            </button>
          )}
        </div>
      </div>

      {usesBrowser && (
        <Link
          href={`/app/browser/${mission.id}`}
          className={btn("secondary", "sm", "w-fit")}
        >
          <Globe size={13} strokeWidth={1.9} aria-hidden="true" /> Watch the browser
        </Link>
      )}

      {/* Ran out of changes. Not an error and not a failure — cosigno did
          exactly what it was told and stopped. The three answers are the three
          things a person actually wants here: a bit more, a lot more, or
          that's enough. */}
      {budget?.exhausted && mission.state === "paused" && (
        <div className="border-l-2 border-signal pl-3.5">
          <p className="t-body">
            This mission reached its limit — {budget.used} of {budget.limit} action
            {budget.limit === 1 ? "" : "s"} used. It hasn&apos;t started anything else.
          </p>
          <div className="mt-3 flex flex-wrap gap-1.5">
            {INCREASE_STEPS.map((n) => (
              <button
                key={n}
                onClick={() => addBudget(n)}
                disabled={busy !== null}
                className={btn(n === INCREASE_STEPS[0] ? "primary" : "ghost", "sm")}
              >
                +{n} actions
              </button>
            ))}
            <button
              onClick={() => control("stop")}
              disabled={busy !== null}
              className="rounded-btn px-3.5 py-1.5 text-xs font-semibold ring-1 ring-inset ring-ink hover:bg-cream-deep disabled:opacity-50 disabled:cursor-not-allowed"
            >
              that&apos;s enough — finish here
            </button>
          </div>
        </div>
      )}

      {/* question needing the user */}
      {mission.pending_question && (
        <div className={`${card()} animate-card-in p-5`}>
          <p className="t-title">{mission.pending_question.question}</p>
          <p className="t-caption mt-1">
            {mission.pending_question.why} · {mission.pending_question.effect}
          </p>
          <div className="mt-4 flex flex-wrap gap-1.5">
            {mission.pending_question.options.map((o) => (
              <button
                key={o}
                onClick={() => answer(o)}
                disabled={busy === "answer"}
                className={btn(o === mission.pending_question?.recommended ? "primary" : "ghost", "sm")}
              >
                {o}
              </button>
            ))}
          </div>
        </div>
      )}

      {mission.state === "awaiting_approval" && (
        <p className="t-caption">
          One step is waiting for your signature. The mission carries on the moment you
          decide.
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
            <div className={`${card()} animate-card-in p-5`}>
              <p className="t-eyebrow">{mission.state === "completed" ? "Done" : "Result"}</p>
              <p className="mt-2 font-display text-[1.25rem] font-semibold leading-snug">
                {hero ?? narration.status}
              </p>
              {hero && <p className="t-caption mt-1">{narration.status}</p>}
              {appsUsed.length > 0 && (
                <div className="mt-4 flex flex-wrap items-center gap-2">
                  {appsUsed.map((a) => (
                    <span key={a.name} className={badge("neutral")}>
                      {a.providerKey && (
                        <ConnectorLogo kind="app" providerKey={a.providerKey} displayName={a.name ?? ""} size={12} />
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
          <div className={`${card()} p-5`}>
            <p className="t-eyebrow">Now working</p>
            {narration.nowWorking ? (
              <div className="mt-2 flex items-start gap-3">
                <WorkAppMark app={narration.nowWorking.app} />
                <div className="min-w-0 flex-1">
                  <p className="text-[1rem] leading-snug">
                    {narration.nowWorking.headline}
                  </p>
                  {(narration.nowWorking.app.department ?? narration.nowWorking.app.name) && (
                    <p className="t-caption">
                      {narration.nowWorking.app.department ?? narration.nowWorking.app.name}
                      {narration.nowWorking.app.department && narration.nowWorking.app.name
                        ? ` · ${narration.nowWorking.app.name}`
                        : ""}
                    </p>
                  )}
                  {narration.nowWorking.at && (
                    <p className="t-caption mt-0.5">started {elapsed(narration.nowWorking.at)} ago</p>
                  )}
                </div>
                {narration.nowWorking.phase === "current" && (
                  <Loader2 size={16} className="mt-0.5 shrink-0 animate-spin text-ink" aria-hidden="true" />
                )}
              </div>
            ) : (
              <p className="t-body mt-2">
                {narration.finished ? "Everything finished." : "Nothing running right now."}
              </p>
            )}

            {/* Why it stopped, in the words a person would use. */}
            {narration.pausedBecause && (
              <p className="t-body mt-4 flex items-start gap-2 border-l-2 border-signal pl-3">
                <span>{narration.pausedBecause}</span>
              </p>
            )}

            {/* Exactly one next thing. Five future items is a plan, and nobody
                reads a plan — they want to know what follows this. */}
            {!narration.finished && narration.upNext && (
              <p className="t-caption mt-4 border-t border-line/40 pt-3">
                <span className="text-ink">Next</span> — {narration.upNext.headline}
                {narration.upNext.app.name ? ` in ${narration.upNext.app.name}` : ""}
              </p>
            )}
          </div>

          {/* THE FEED — accomplishments, oldest first, grouped by who did them. */}
          <div className={`${card()} p-5`}>
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
                      <p className={`t-eyebrow ${pending ? "opacity-60" : ""}`}>
                        {g.app.department ?? g.app.name ?? "cosigno"}
                        {g.app.name && g.app.department && <span className="ml-1.5">· {g.app.name}</span>}
                      </p>

                      <ul className="mt-1 flex flex-col gap-2">
                        {g.entries.map((e) => (
                          <li key={e.id} className="animate-fade-through">
                            <div className="flex items-baseline gap-2">
                              {/* The outcome first. Metadata never precedes
                                  the result. */}
                              <p
                                className={`min-w-0 flex-1 text-[0.9375rem] ${
                                  e.phase === "upcoming"
                                    ? "text-ink-soft"
                                    : e.phase === "skipped"
                                      ? "text-ink-soft line-through"
                                      : ""
                                }`}
                              >
                                {e.headline}
                              </p>
                              {e.at && (
                                <span className="shrink-0 text-[0.75rem] tabular-nums text-ink-soft">
                                  {clockTime(e.at)}
                                </span>
                              )}
                            </div>
                            {e.detail && (
                              <p className="mt-0.5 text-[0.75rem] text-ink-soft">{e.detail}</p>
                            )}
                            {e.blockedReason && (
                              <p className="mt-0.5 text-[0.75rem] font-semibold">{e.blockedReason}</p>
                            )}
                            {e.proof &&
                              (e.proof.external ? (
                                <a
                                  href={e.proof.href}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className={btn("ghost", "sm", "mt-1.5")}
                                >
                                  {e.proof.label} <ExternalLink size={10} aria-hidden="true" />
                                </a>
                              ) : (
                                <Link
                                  href={e.proof.href}
                                  className={btn("ghost", "sm", "mt-1.5")}
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
        </section>

        {/* right panel: plan, sources, results, usage */}
        <div className="flex flex-col gap-4">
          <section className={`${card()} p-5`}>
            <h2 className="t-eyebrow">Progress</h2>
            <p className="t-body mt-2">{narration.status}</p>
            <div className="mt-3 h-1 overflow-hidden rounded-pill bg-ink/[0.08]">
              <div
                className="h-full rounded-pill bg-ink transition-[width] duration-slow ease-brand-out"
                style={{ width: `${steps.length ? Math.round((done / steps.length) * 100) : 0}%` }}
              />
            </div>
          </section>

          {sources.length > 0 && (
            <section className={`${card()} p-5`}>
              <h2 className="t-eyebrow">Sources you gave</h2>
              <ul className="mt-2 flex flex-col gap-1.5">
                {sources.map((src) => (
                  <li key={src.id} className="flex items-start gap-2.5">
                    <span className="mt-1 shrink-0 text-ink-soft">
                      {src.kind === "link" ? <Link2 size={12} strokeWidth={1.9} /> : <FileText size={12} strokeWidth={1.9} />}
                    </span>
                    <span className="min-w-0">
                      <span className="block text-[0.9375rem]">{src.name}</span>
                      <span className="t-caption block">
                        {src.status === "ready" ? "read as context" : "couldn't be read — not used"}
                      </span>
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {deliverables.length > 0 && (
            <section className={`${card()} p-5`}>
              <h2 className="t-eyebrow">Results</h2>
              <ul className="mt-2 flex flex-col gap-1.5">
                {deliverables.map((s) => (
                  <li key={s.id} className="text-[0.9375rem]">
                    <Link href="/app/files" className="underline underline-offset-2 hover:text-signal">
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
          <section className={`${card()} p-5`}>
            <h2 className="t-eyebrow">Actions</h2>
            {budget === null ? (
              <p className="t-caption mt-2">counting…</p>
            ) : budget.unlimited ? (
              <>
                <p className="mt-2 font-display text-[1.75rem] leading-none tabular-nums">{budget.used}</p>
                <p className="t-caption mt-2">
                  action{budget.used === 1 ? "" : "s"} used · no limit
                </p>
                <p className="t-caption mt-2">Every action still follows your permissions.</p>
              </>
            ) : (
              <>
                <p className="mt-2 font-display text-[1.75rem] leading-none tabular-nums">
                  {budget.used}
                  <span className="text-[1rem] text-ink-soft"> / {budget.limit}</span>
                </p>
                <div
                  className="mt-3 h-1 overflow-hidden rounded-pill bg-ink/[0.08]"
                  role="progressbar"
                  aria-valuenow={budget.used}
                  aria-valuemin={0}
                  aria-valuemax={budget.limit}
                  aria-label="actions used against this mission's execution budget"
                >
                  <div
                    className="h-full rounded-pill bg-ink transition-all duration-slow ease-brand-out"
                    style={{ width: `${Math.min(100, (budget.used / Math.max(1, budget.limit)) * 100)}%` }}
                  />
                </div>
                {budget.committed > budget.used && (
                  <p className="t-caption mt-2">
                    {budget.committed - budget.used} waiting on you, already counted.
                  </p>
                )}
              </>
            )}
            <p className="t-caption mt-3">
              {budget && budget.kinds.length > 0
                ? budget.kinds.join(" · ").toLowerCase()
                : "Reading, searching and drafting don't count."}
            </p>
          </section>

          {/* THE EXECUTION SUMMARY — what this mission actually did, in the
              same unit the limit was set in. No money, no token counts, no
              provider costs: the question a receipt answers is "what did this
              do", not "what did this cost us to run". */}
          {receipt !== null && (
            <section className={`${card()} p-5`}>
              <h2 className="t-eyebrow">What it did</h2>
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
                    <dt className="t-caption">{r.k}</dt>
                    <dd className="text-[0.9375rem] tabular-nums">{r.v}</dd>
                  </div>
                ))}
              </dl>
              {Array.isArray(receipt.apps) && (receipt.apps as string[]).length > 0 && (
                <p className="t-caption mt-3 border-t border-line/40 pt-3">
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
