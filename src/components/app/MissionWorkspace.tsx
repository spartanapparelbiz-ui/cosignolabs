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
  Link2,
  OctagonX,
  Pause,
  Play,
  Square,
  XCircle,
} from "lucide-react";
import type { MissionRecord, MissionSourceRecord, MissionStepRecord } from "@/lib/types";
import { OPERATOR_PROFILES } from "@/lib/missions/operators";
import { useToast } from "@/components/Toast";

/**
 * The isolated mission workspace: header (goal, plain status, created time,
 * pause/stop), the event timeline on the left (completed read-only work
 * collapses to compact rows; anything needing you stays expanded), and the
 * plan checklist + provided sources + results + usage on the right. Raw
 * payloads live behind "view payload" — never in the default reading path.
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

const STEP_ICON: Record<MissionStepRecord["state"], typeof Circle> = {
  ready: Circle,
  running: CircleDot,
  awaiting_input: HelpCircle,
  awaiting_approval: Circle,
  retrying: CircleDot,
  verifying: CircleDot,
  completed: CheckCircle2,
  failed: OctagonX,
  vetoed: XCircle,
  skipped: XCircle,
  canceled: XCircle,
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
  const [payloadOpen, setPayloadOpen] = useState<Set<string>>(new Set());
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

  function togglePayload(id: string) {
    setPayloadOpen((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
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
            started {elapsed(mission.created_at)} ago · plan v{mission.plan_version}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <span className={`rounded-pill px-3 py-1 text-xs font-bold ${STATE_TONE[label]}`}>{label}</span>
          {!TERMINAL.has(mission.state) &&
            (mission.state === "paused" ? (
              <button
                onClick={() => control("resume")}
                disabled={busy !== null}
                className="inline-flex items-center gap-1.5 rounded-btn bg-ink px-3.5 py-2 text-xs font-bold text-cream disabled:opacity-40"
              >
                <Play size={12} /> Resume
              </button>
            ) : (
              <button
                onClick={() => control("pause")}
                disabled={busy !== null}
                className="inline-flex items-center gap-1.5 rounded-btn px-3.5 py-2 text-xs font-bold ring-1 ring-inset ring-ink/30 hover:bg-cream-deep disabled:opacity-40"
              >
                <Pause size={12} /> Pause
              </button>
            ))}
          {!TERMINAL.has(mission.state) && (
            <button
              onClick={() => control("stop")}
              disabled={busy !== null}
              className="inline-flex items-center gap-1.5 rounded-btn px-3.5 py-2 text-xs font-bold ring-1 ring-inset ring-ink hover:bg-cream-deep disabled:opacity-40"
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
                className={`rounded-btn px-3.5 py-1.5 text-xs font-bold disabled:opacity-40 ${
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
          a consequential step is waiting for your signature —{" "}
          <Link href="/app/approvals" className="underline underline-offset-2">
            open approvals
          </Link>
          . the mission resumes automatically after you decide.
        </p>
      )}

      {/* ------------------- timeline + right panel ------------------- */}
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[1.5fr_1fr]">
        {/* timeline */}
        <section className="rounded-card border border-line/70 bg-surface p-4 shadow-soft">
          <h2 className="text-xs font-extrabold uppercase tracking-widest text-ink-soft">Timeline</h2>
          <ol className="mt-3 flex flex-col gap-1.5">
            {steps.map((s) => {
              const Icon = STEP_ICON[s.state];
              const compact = s.state === "completed" || s.state === "skipped";
              const summary = typeof s.output?.summary === "string" ? s.output.summary : null;
              const verif = s.verification as { ok?: boolean; detail?: string } | null;
              const hasPayload = s.output !== null && Object.keys(s.output ?? {}).length > 0;
              return (
                <li
                  key={s.id}
                  className={`rounded-btn px-2.5 ${compact ? "py-1.5" : "bg-cream/50 py-2.5"}`}
                >
                  <div className="flex items-start gap-2">
                    <Icon
                      size={15}
                      className={`mt-px shrink-0 ${
                        s.state === "completed"
                          ? "text-signal"
                          : ["running", "retrying", "verifying"].includes(s.state)
                            ? "animate-orb-pulse text-ink"
                            : "text-ink-soft"
                      }`}
                      aria-hidden="true"
                    />
                    <div className="min-w-0 flex-1">
                      <p className={`text-xs font-semibold ${["vetoed", "canceled"].includes(s.state) ? "text-ink-soft line-through" : ""}`}>
                        {s.idx + 1}. {s.purpose}
                      </p>
                      {/* compact rows keep one honest line; active rows show more */}
                      <p className="text-[11px] text-ink-soft">
                        {OPERATOR_PROFILES[s.operator]?.name ?? s.operator}
                        {summary ? ` · ${summary}` : s.error ? ` · ${s.error}` : ""}
                      </p>
                      {verif && (
                        <p className={`text-[11px] font-bold ${verif.ok ? "text-signal" : "text-ink"}`}>
                          {verif.ok ? "verified" : "verification failed"}: {verif.detail}
                        </p>
                      )}
                      {typeof s.output?.file_id === "string" && (
                        <Link href="/app/files" className="text-[11px] font-bold underline underline-offset-2">
                          open deliverable in files
                        </Link>
                      )}
                      {hasPayload && (
                        <>
                          <button
                            onClick={() => togglePayload(s.id)}
                            aria-expanded={payloadOpen.has(s.id)}
                            className="ml-0 mt-0.5 block text-[10px] font-bold lowercase text-ink-soft underline underline-offset-2"
                          >
                            {payloadOpen.has(s.id) ? "hide payload" : "view payload"}
                          </button>
                          {payloadOpen.has(s.id) && (
                            <pre className="mt-1 max-h-40 overflow-auto rounded-btn bg-cream-deep px-2 py-1.5 font-mono text-[10px] leading-relaxed">
                              {JSON.stringify(s.output, null, 2)}
                            </pre>
                          )}
                        </>
                      )}
                    </div>
                    <ChevronDown size={0} className="hidden" aria-hidden="true" />
                  </div>
                </li>
              );
            })}
          </ol>
        </section>

        {/* right panel: plan, sources, results, usage */}
        <div className="flex flex-col gap-4">
          <section className="rounded-card border border-line/70 bg-surface p-4 shadow-soft">
            <h2 className="text-xs font-extrabold uppercase tracking-widest text-ink-soft">Plan</h2>
            <p className="mt-1.5 text-sm font-bold">
              {done} of {steps.length} steps complete
            </p>
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
            <h2 className="text-xs font-extrabold uppercase tracking-widest text-ink-soft">Usage</h2>
            <p className="mt-1.5 text-xs font-semibold text-ink-soft">
              {mission.tool_calls} tool call{mission.tool_calls === 1 ? "" : "s"} ·{" "}
              {mission.browser_actions} browser action{mission.browser_actions === 1 ? "" : "s"}
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
