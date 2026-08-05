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
import type { MissionRecord, MissionSourceRecord, MissionStepRecord } from "@/lib/types";
import { OPERATOR_PROFILES } from "@/lib/missions/operators";
import { useToast } from "@/components/Toast";
import { DecisionInbox } from "@/components/app/DecisionInbox";
import { narrateMission, type StepPhase, type WorkApp } from "@/lib/missions/narrate";
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

const STATE_LABEL: Record<MissionRecord["state"], string> = {
  queued: "Planning",
  running: "Working",
  awaiting_input: "Waiting for you",
  awaiting_approval: "Waiting for you",
  retrying: "Working",
  verifying: "Verifying",
  paused: "Paused",
  completed: "Completed",
  partial: "Needs attention",
  failed: "Failed",
  stopped: "Stopped",
  blocked: "Needs attention",
};

const STATE_TONE: Record<string, string> = {
  Planning: "bg-cream-deep text-ink-soft",
  Working: "bg-ink text-cream",
  "Waiting for you": "bg-signal text-ink",
  Verifying: "bg-ink text-cream",
  Paused: "bg-cream-deep text-ink-soft",
  Completed: "bg-signal/20 text-ink",
  Failed: "ring-1 ring-inset ring-ink/40 text-ink",
  Stopped: "bg-cream-deep text-ink-soft",
  "Needs attention": "ring-1 ring-inset ring-ink/40 text-ink",
};

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
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const load = useCallback(async () => {
    try {
      const d = await jsonFetch(`/api/missions/${missionId}`);
      setMission(d.mission);
      setSteps(d.steps ?? []);
      setSources(d.sources ?? []);
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

  const label = STATE_LABEL[mission.state];
  const usesBrowser = steps.some((s) => s.tool.startsWith("laptop.") || s.tool.startsWith("browser."));
  // Only the cards this mission is actually parked on.
  // The whole translation from engine state to human language lives in
  // narrateMission — this component only lays it out.
  const narration = narrateMission(mission, steps);
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
          <span className={`rounded-pill px-3 py-1 text-xs font-bold ${STATE_TONE[label]}`}>{label}</span>
          {!TERMINAL.has(mission.state) &&
            (mission.state === "paused" ? (
              <button
                onClick={() => control("resume")}
                disabled={busy !== null}
                className="inline-flex items-center gap-1.5 rounded-btn bg-ink px-3.5 py-2 text-xs font-bold text-cream disabled:bg-cream-deep disabled:text-ink-soft disabled:shadow-none disabled:cursor-not-allowed"
              >
                <Play size={12} /> Resume
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
                  o === mission.pending_question?.recommended ? "bg-signal text-ink" : "ring-1 ring-inset ring-ink/30 hover:bg-cream-deep"
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
                  {narration.nowWorking.app.name && (
                    <p className="text-[11px] font-bold text-ink-soft">
                      in {narration.nowWorking.app.name}
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

          {/* THE FEED — one continuous story, oldest first. */}
          <div className="rounded-card border border-line/70 bg-surface p-4 shadow-soft">
            <ol className="flex flex-col">
              {narration.feed.map((e, i) => {
                const last = i === narration.feed.length - 1;
                const pending = e.phase === "upcoming";
                return (
                  <li key={e.id} className="flex gap-3">
                    {/* the thread running down the feed */}
                    <div className="flex flex-col items-center">
                      <WorkAppMark app={e.app} phase={e.phase} small />
                      {!last && <span className="w-px flex-1 bg-line" aria-hidden="true" />}
                    </div>

                    <div className={`min-w-0 flex-1 animate-rise-in ${last ? "pb-0" : "pb-4"}`}>
                      <div className="flex flex-wrap items-baseline gap-x-2">
                        {e.app.name && (
                          <span className="text-[11px] font-extrabold">{e.app.name}</span>
                        )}
                        {e.at && (
                          <span className="text-[10px] tabular-nums text-ink-soft">
                            {clockTime(e.at)}
                          </span>
                        )}
                      </div>
                      <p
                        className={`text-xs ${
                          pending
                            ? "font-semibold text-ink-soft"
                            : e.phase === "skipped"
                              ? "font-semibold text-ink-soft line-through"
                              : "font-bold"
                        }`}
                      >
                        {e.headline}
                      </p>
                      {e.detail && <p className="mt-0.5 text-[11px] text-ink-soft">{e.detail}</p>}
                      {e.blockedReason && (
                        <p className="mt-0.5 text-[11px] font-semibold">{e.blockedReason}</p>
                      )}
                      {/* The proof, one click away — only ever a link to
                          something that really exists. */}
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
                    </div>
                  </li>
                );
              })}
            </ol>
          </div>
        </section>

        {/* right panel: plan, sources, results, usage */}
        <div className="flex flex-col gap-4">
          <section className="rounded-card border border-line/70 bg-surface p-4 shadow-soft">
            <h2 className="text-xs font-extrabold uppercase tracking-widest text-ink-soft">Progress</h2>
            <p className="mt-1.5 text-sm font-bold">{narration.status}</p>
            <div className="mt-2 h-1.5 overflow-hidden rounded-pill bg-cream-deep">
              <div
                className="h-full rounded-pill bg-signal transition-[width]"
                style={{ width: `${steps.length ? Math.round((done / steps.length) * 100) : 0}%` }}
              />
            </div>
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

          <section className="rounded-card border border-line/70 bg-surface p-4 shadow-soft">
            <h2 className="text-xs font-extrabold uppercase tracking-widest text-ink-soft">Effort</h2>
            {/* Counters the engine keeps for budgeting. Kept because "how much
                did this cost me" is a real question — but phrased as work done,
                not as internal call counts. */}
            <p className="mt-1.5 text-xs font-semibold text-ink-soft">
              {mission.tool_calls} action{mission.tool_calls === 1 ? "" : "s"} taken
              {mission.browser_actions > 0
                ? ` · ${mission.browser_actions} page${mission.browser_actions === 1 ? "" : "s"} read`
                : ""}
            </p>
            {receipt !== null && (
              <p className="mt-1 text-[11px] text-ink-soft">
                receipt: {(receipt.completed_steps as unknown[])?.length ?? 0} steps ·{" "}
                {(receipt.deliverables as unknown[])?.length ?? 0} deliverable
                {((receipt.deliverables as unknown[])?.length ?? 0) === 1 ? "" : "s"}
              </p>
            )}
          </section>
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
