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
  Lock,
  OctagonX,
  Pause,
  Play,
  Rocket,
  Square,
  XCircle,
} from "lucide-react";
import type { MissionRecord, MissionSourceRecord, MissionStepRecord } from "@/lib/types";
import { OPERATOR_PROFILES } from "@/lib/missions/operators";
import { useToast } from "@/components/Toast";

/**
 * Durable missions — work that continues server-side after this tab closes.
 * While the page is open, the client keeps the engine moving by calling
 * /advance; away from the page, the cron tick does the same job. Everything
 * shown is read straight from the persisted mission + step records.
 */

const STATE_LABEL: Record<MissionRecord["state"], string> = {
  queued: "queued",
  running: "working",
  awaiting_input: "needs one answer",
  awaiting_approval: "waiting for your approval",
  retrying: "retrying a step",
  verifying: "verifying",
  paused: "paused",
  completed: "completed",
  partial: "partially completed",
  failed: "failed safely",
  stopped: "stopped",
  blocked: "blocked",
};

const STATE_STYLE: Record<MissionRecord["state"], string> = {
  queued: "bg-cream-deep text-ink",
  running: "bg-ink text-cream",
  awaiting_input: "bg-signal text-ink",
  awaiting_approval: "bg-signal text-ink",
  retrying: "ring-1 ring-inset ring-ink/40 text-ink",
  verifying: "bg-ink text-cream",
  paused: "bg-cream-deep text-ink-soft",
  completed: "bg-signal/20 text-ink",
  partial: "ring-1 ring-inset ring-ink/40 text-ink",
  failed: "ring-1 ring-inset ring-ink/40 text-ink",
  stopped: "bg-cream-deep text-ink-soft",
  blocked: "ring-1 ring-inset ring-signal text-signal",
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

const STEP_NOTE: Record<MissionStepRecord["state"], string> = {
  ready: "waiting for its turn.",
  running: "running now.",
  awaiting_input: "needs your answer below.",
  awaiting_approval: "waiting on your approval — see decisions.",
  retrying: "hit a problem — will retry.",
  verifying: "confirming the outcome.",
  completed: "finished.",
  failed: "didn't complete — nothing was left half-done.",
  vetoed: "you vetoed this — it never ran.",
  skipped: "skipped.",
  canceled: "canceled when the mission stopped.",
};

async function jsonFetch(url: string, init?: RequestInit) {
  const res = await fetch(url, {
    ...init,
    headers: { "Content-Type": "application/json", ...init?.headers },
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.message || body.error || "something went wrong.");
  return body;
}

const ACTIVE = new Set(["queued", "running", "retrying", "verifying"]);

interface CompilePreview {
  understood: { normalizedGoal: string; willDo: string[]; boundary: string };
  shape: string;
  blocked: boolean;
  plan: {
    successCriteria: string[];
    assumptions: string[];
    questions: { question: string; recommended?: string }[];
    steps: { idx: number; purpose: string; operator: string; tool: string }[];
    expectedDeliverables: string[];
    approvalCheckpoints: string[];
    unsupported: string[];
  };
}

/** The open-ended goal composer: compile → review the plan → start. */
function GoalComposer({ onStarted }: { onStarted: (id: string) => void }) {
  const [goal, setGoal] = useState("");
  const [preview, setPreview] = useState<CompilePreview | null>(null);
  const [busy, setBusy] = useState(false);
  const toast = useToast();

  async function compile() {
    if (!goal.trim()) return;
    setBusy(true);
    try {
      const data = await jsonFetch("/api/missions/compile", {
        method: "POST",
        body: JSON.stringify({ goal: goal.trim() }),
      });
      setPreview(data);
    } catch (e) {
      toast("error", e instanceof Error ? e.message : "couldn't read that goal.");
    } finally {
      setBusy(false);
    }
  }

  async function start() {
    setBusy(true);
    try {
      const data = await jsonFetch("/api/missions", {
        method: "POST",
        body: JSON.stringify({ goal: goal.trim() }),
      });
      toast("success", "mission started from your goal.");
      setPreview(null);
      setGoal("");
      onStarted(data.mission.id);
    } catch (e) {
      toast("error", e instanceof Error ? e.message : "couldn't start that mission.");
    } finally {
      setBusy(false);
    }
  }

  const inputCls =
    "w-full rounded-btn bg-surface px-3 py-2.5 text-sm shadow-soft focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-signal";

  if (preview) {
    const p = preview.plan;
    return (
      <div className="flex flex-col gap-3 rounded-card bg-surface/60 p-4 shadow-soft">
        <div>
          <p className="text-[10px] font-extrabold lowercase tracking-widest text-ink-soft">i understood the goal</p>
          <p className="mt-0.5 text-sm font-extrabold">{preview.understood.normalizedGoal}</p>
        </div>
        <p className="rounded-btn bg-cream-deep px-3 py-2 text-xs font-semibold">
          cosigno created this plan from your goal using its currently available tools.
        </p>
        {preview.understood.willDo.length > 0 && (
          <div>
            <p className="text-[10px] font-extrabold lowercase tracking-widest text-ink-soft">i will help by</p>
            <ol className="mt-1 flex flex-col gap-1 text-xs">
              {preview.understood.willDo.map((w, i) => (
                <li key={i} className="font-semibold">{i + 1}. {w}</li>
              ))}
            </ol>
          </div>
        )}
        {p.approvalCheckpoints.length > 0 && (
          <p className="text-xs font-bold text-ink">boundary: {preview.understood.boundary}</p>
        )}
        {p.unsupported.length > 0 && (
          <div className="rounded-btn bg-signal/10 px-3 py-2 text-xs font-semibold ring-1 ring-inset ring-signal/30">
            {p.unsupported.map((u, i) => (
              <p key={i}>• {u}</p>
            ))}
          </div>
        )}
        {p.expectedDeliverables.length > 0 && (
          <p className="text-xs text-ink-soft">
            <span className="font-bold">you&apos;ll get:</span> {p.expectedDeliverables.join(", ")}
          </p>
        )}
        <div className="flex flex-wrap gap-2">
          {preview.blocked ? (
            <p className="text-xs font-bold text-ink-soft">this goal can&apos;t run as-is — see the note above.</p>
          ) : (
            <button
              onClick={start}
              disabled={busy}
              className="rounded-btn bg-signal px-4 py-2 text-sm font-extrabold text-ink disabled:opacity-40"
            >
              {busy ? "starting…" : "confirm & start"}
            </button>
          )}
          <button
            onClick={() => setPreview(null)}
            className="rounded-btn px-4 py-2 text-sm font-bold lowercase ring-1 ring-inset ring-ink hover:bg-cream-deep"
          >
            edit goal
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2 rounded-card bg-surface/60 p-4 shadow-soft">
      <p className="text-sm font-extrabold lowercase">give cosigno any goal</p>
      <p className="text-xs text-ink-soft">
        cosigno turns it into a real, validated plan using only the tools it
        actually has — then shows you before anything runs.
      </p>
      <div className="flex gap-2">
        <input
          value={goal}
          onChange={(e) => setGoal(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && compile()}
          maxLength={500}
          placeholder="e.g. compare the best laptops under $1,000"
          className={inputCls}
          aria-label="mission goal"
        />
        <button
          onClick={compile}
          disabled={busy || !goal.trim()}
          className="shrink-0 rounded-btn bg-ink px-4 py-2 text-sm font-bold text-cream disabled:opacity-40"
        >
          {busy ? "reading…" : "plan it"}
        </button>
      </div>
    </div>
  );
}

export function MissionRunner() {
  const [missions, setMissions] = useState<MissionRecord[] | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const [steps, setSteps] = useState<Record<string, MissionStepRecord[]>>({});
  const [sources, setSources] = useState<Record<string, MissionSourceRecord[]>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [bgActive, setBgActive] = useState<boolean | null>(null);
  const toast = useToast();
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const load = useCallback(async () => {
    try {
      const data = await jsonFetch("/api/missions");
      setMissions(data.missions ?? []);
      setError(null);
      return (data.missions ?? []) as MissionRecord[];
    } catch (e) {
      setError(e instanceof Error ? e.message : "couldn't load missions.");
      return [];
    }
  }, []);

  const loadSteps = useCallback(async (id: string) => {
    try {
      const data = await jsonFetch(`/api/missions/${id}`);
      setSteps((s) => ({ ...s, [id]: data.steps ?? [] }));
      setSources((s) => ({ ...s, [id]: data.sources ?? [] }));
      return data.mission as MissionRecord;
    } catch {
      return null;
    }
  }, []);

  useEffect(() => {
    load();
    fetch("/api/health/mission")
      .then((r) => (r.ok ? r.json() : null))
      .then((h) => h && setBgActive(Boolean(h.background_execution_active)))
      .catch(() => {});
  }, [load]);

  // While an ACTIVE mission is open, keep the engine moving (the cron tick
  // does the same job when nobody is looking). Keyed on the mission's
  // ACTIVE-ness, not the missions array identity, so the 4s tick's own
  // setMissions doesn't tear down and recreate the interval every cycle.
  // Hidden tabs skip the tick entirely — the cron picks up the slack.
  const openActive = Boolean(
    openId && missions?.some((m) => m.id === openId && ACTIVE.has(m.state))
  );
  useEffect(() => {
    if (pollRef.current) clearInterval(pollRef.current);
    if (!openId || !openActive) return;
    pollRef.current = setInterval(async () => {
      if (document.visibilityState === "hidden") return;
      try {
        const data = await jsonFetch(`/api/missions/${openId}/advance`, { method: "POST" });
        setSteps((s) => ({ ...s, [openId]: data.steps ?? [] }));
        setMissions((ms) => (ms ?? []).map((m) => (m.id === openId ? data.mission : m)));
      } catch {
        // rate-limited or transient — the next interval retries
      }
    }, 4000);
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [openId, openActive]);

  async function start() {
    setBusy("start");
    try {
      const data = await jsonFetch("/api/missions", {
        method: "POST",
        body: JSON.stringify({ template: "meeting_prep" }),
      });
      toast("success", "mission started — it keeps working even if you close this tab.");
      setSteps((s) => ({ ...s, [data.mission.id]: data.steps ?? [] }));
      await load();
      setOpenId(data.mission.id);
    } catch (e) {
      toast("error", e instanceof Error ? e.message : "couldn't start the mission.");
    } finally {
      setBusy(null);
    }
  }

  async function startLaptop() {
    setBusy("laptop");
    try {
      const data = await jsonFetch("/api/missions", {
        method: "POST",
        body: JSON.stringify({ template: "laptop_compare" }),
      });
      toast("success", "browser mission started — opening the browser view.");
      window.location.href = `/app/browser/${data.mission.id}`;
    } catch (e) {
      toast("error", e instanceof Error ? e.message : "couldn't start the mission.");
      setBusy(null);
    }
  }

  async function control(id: string, op: "pause" | "resume" | "stop") {
    setBusy(id);
    try {
      await jsonFetch(`/api/missions/${id}/control`, { method: "POST", body: JSON.stringify({ op }) });
      toast(
        "success",
        op === "pause" ? "paused — no new work will start." : op === "resume" ? "resumed." : "stopped — waiting steps were canceled and pending cards vetoed."
      );
      await load();
      await loadSteps(id);
    } catch (e) {
      toast("error", e instanceof Error ? e.message : "that didn't work.");
    } finally {
      setBusy(null);
    }
  }

  async function answer(id: string, value: string) {
    setBusy(id);
    try {
      const data = await jsonFetch(`/api/missions/${id}/answer`, {
        method: "POST",
        body: JSON.stringify({ answer: value }),
      });
      setSteps((s) => ({ ...s, [id]: data.steps ?? [] }));
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
        <button onClick={load} className="mt-3 rounded-btn px-4 py-2 text-sm font-bold lowercase ring-1 ring-inset ring-ink hover:bg-cream-deep">
          try again
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {bgActive === false && (
        <div className="flex items-start gap-2 rounded-card bg-signal/10 p-3 text-xs font-semibold ring-1 ring-inset ring-signal/30">
          <Square size={13} className="mt-0.5 shrink-0 text-signal" aria-hidden="true" />
          <span>
            background mission execution isn&apos;t configured — missions advance
            only while this page is open. <a href="/app/health" className="underline underline-offset-2">deployment health</a>.
          </span>
        </div>
      )}

      {/* open-ended goal → compiled mission */}
      <GoalComposer
        onStarted={async (id) => {
          await load();
          setOpenId(id);
          await loadSteps(id);
        }}
      />

      {/* start the reference (suggested) mission */}
      <div className="flex flex-wrap items-center gap-3 rounded-card bg-surface/60 p-4 shadow-soft">
        <Rocket size={18} className="shrink-0 text-ink-soft" aria-hidden="true" />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-extrabold lowercase">prepare everything for tomorrow&apos;s meeting</p>
          <p className="text-xs text-ink-soft">
            finds the event, reviews related mail and files, builds a brief +
            agenda, and drafts the follow-up. keeps working server-side even if
            you close this tab. uses your connected apps — or a clearly-marked
            sandbox until you connect them.
          </p>
        </div>
        <button
          onClick={start}
          disabled={busy === "start"}
          className="rounded-btn bg-signal px-4 py-2.5 text-sm font-extrabold text-ink shadow-soft transition-transform active:scale-95 disabled:opacity-40"
        >
          {busy === "start" ? "starting…" : "start mission"}
        </button>
      </div>

      {/* the browser-operator reference mission */}
      <div className="flex flex-wrap items-center gap-3 rounded-card bg-surface/60 p-4 shadow-soft">
        <Globe size={18} className="shrink-0 text-ink-soft" aria-hidden="true" />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-extrabold lowercase">compare three laptops under $1,000</p>
          <p className="text-xs text-ink-soft">
            cosigno opens real product pages, records what they actually show,
            compares three options, and stops at the recommended product page —
            watch every page it reads. entirely read-only: no purchase is ever
            attempted.
          </p>
        </div>
        <button
          onClick={startLaptop}
          disabled={busy === "laptop"}
          className="rounded-btn bg-signal px-4 py-2.5 text-sm font-extrabold text-ink shadow-soft transition-transform active:scale-95 disabled:opacity-40"
        >
          {busy === "laptop" ? "starting…" : "start mission"}
        </button>
      </div>

      {missions === null && (
        <div className="flex flex-col gap-3" aria-busy="true" aria-label="loading missions">
          {[0, 1].map((i) => (
            <div key={i} className="h-14 animate-pulse rounded-card bg-cream-deep" />
          ))}
        </div>
      )}

      {(missions ?? []).map((m) => {
        const open = openId === m.id;
        const mySteps = steps[m.id] ?? [];
        const done = mySteps.filter((s) => s.state === "completed").length;
        const usesBrowser = mySteps.some((s) => s.tool.startsWith("laptop.") || s.tool.startsWith("browser."));
        return (
          <div key={m.id} className="rounded-card bg-surface/60 shadow-soft">
            <button
              onClick={async () => {
                setOpenId(open ? null : m.id);
                if (!open) await loadSteps(m.id);
              }}
              aria-expanded={open}
              className="flex w-full items-center gap-2 px-4 py-3 text-left"
            >
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-extrabold">{m.goal}</span>
                <span className="mt-0.5 block text-[11px] text-ink-soft">
                  started {new Date(m.created_at).toLocaleString()} · plan v{m.plan_version}
                  {mySteps.length > 0 && ` · ${done} of ${mySteps.length} steps completed`}
                </span>
              </span>
              <span className={`shrink-0 rounded-pill px-2.5 py-0.5 text-[11px] font-bold lowercase ${STATE_STYLE[m.state]}`}>
                {STATE_LABEL[m.state]}
              </span>
              <ChevronDown size={15} className={`shrink-0 text-ink-soft transition-transform ${open ? "rotate-180" : ""}`} aria-hidden="true" />
            </button>

            {open && (
              <div className="flex flex-col gap-3 border-t border-line/60 px-4 py-3">
                <div className="flex flex-wrap gap-2">
                  <Link
                    href={`/app/missions/${m.id}`}
                    className="inline-flex w-fit items-center gap-1.5 rounded-btn px-3.5 py-2 text-xs font-bold ring-1 ring-inset ring-ink/30 hover:bg-cream-deep"
                  >
                    open the mission workspace
                  </Link>
                  {usesBrowser && (
                    <Link
                      href={`/app/browser/${m.id}`}
                      className="inline-flex w-fit items-center gap-1.5 rounded-btn px-3.5 py-2 text-xs font-bold ring-1 ring-inset ring-ink/30 hover:bg-cream-deep"
                    >
                      <Globe size={13} aria-hidden="true" /> open the browser view
                    </Link>
                  )}
                </div>

                {/* pending question */}
                {m.pending_question && (
                  <div className="rounded-btn bg-signal/10 p-3 ring-1 ring-inset ring-signal/30">
                    <p className="text-sm font-extrabold">{m.pending_question.question}</p>
                    <p className="mt-0.5 text-xs text-ink-soft">
                      why: {m.pending_question.why} · effect: {m.pending_question.effect}
                    </p>
                    <div className="mt-2 flex flex-wrap gap-2">
                      {m.pending_question.options.map((o) => (
                        <button
                          key={o}
                          onClick={() => answer(m.id, o)}
                          disabled={busy === m.id}
                          className={`min-h-[32px] rounded-btn px-3.5 py-1.5 text-xs font-bold disabled:opacity-40 ${
                            o === m.pending_question?.recommended
                              ? "bg-signal text-ink"
                              : "ring-1 ring-inset ring-ink/30 hover:bg-cream-deep"
                          }`}
                        >
                          {o}
                          {o === m.pending_question?.recommended && " (recommended)"}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {m.state === "awaiting_approval" && (
                  <p className="rounded-btn bg-cream-deep px-3 py-2 text-xs font-semibold">
                    a consequential step is waiting for your signature —{" "}
                    <Link href="/app/approvals" className="underline underline-offset-2">
                      open decisions
                    </Link>
                    . the mission resumes automatically after you decide.
                  </p>
                )}

                {/* sources the user provided (files + links), as real inputs */}
                {(sources[m.id] ?? []).length > 0 && (
                  <div className="rounded-btn bg-cream-deep/60 px-3 py-2.5">
                    <p className="text-[10px] font-extrabold uppercase tracking-widest text-ink-soft">
                      sources you provided
                    </p>
                    <ul className="mt-1.5 flex flex-col gap-1.5">
                      {(sources[m.id] ?? []).map((src) => {
                        const usable = src.status === "ready";
                        const usedBy = (steps[m.id] ?? []).filter((st) =>
                          st.sources.some((r) => r.name === src.name)
                        );
                        return (
                          <li key={src.id} className="flex items-start gap-2 text-xs">
                            <span className="mt-0.5 shrink-0 text-ink-soft">
                              {src.kind === "link" ? <Link2 size={13} /> : src.status === "login_required" ? <Lock size={13} /> : <FileText size={13} />}
                            </span>
                            <span className="min-w-0 flex-1">
                              <span className="font-bold">{src.name}</span>
                              <span className="block text-[11px] text-ink-soft">
                                {src.kind === "link" ? src.subtype || "link" : src.subtype}
                                {" · "}
                                {usable ? (src.kind === "link" ? "read" : "read as context") : "not used — couldn't be read"}
                                {src.injection_flag && " · flagged content (data only)"}
                              </span>
                              {usable && usedBy.length > 0 && (
                                <span className="block text-[11px] text-ink-soft/80">
                                  used in: {usedBy.map((st) => `step ${st.idx + 1}`).join(", ")}
                                </span>
                              )}
                            </span>
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                )}

                {/* steps */}
                <ol className="flex flex-col gap-2">
                  {mySteps.map((s) => {
                    const Icon = STEP_ICON[s.state];
                    const summary = typeof s.output?.summary === "string" ? s.output.summary : null;
                    const planNote = typeof s.output?.plan_note === "string" ? s.output.plan_note : null;
                    const verif = s.verification as { ok?: boolean; detail?: string; simulated?: boolean } | null;
                    return (
                      <li key={s.id} className="flex items-start gap-2 text-xs">
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
                        <span className="min-w-0 flex-1">
                          <span className={`font-semibold ${["vetoed", "canceled"].includes(s.state) ? "text-ink-soft line-through" : ""}`}>
                            {s.idx + 1}. {s.purpose}
                          </span>
                          <span className="block text-[11px] text-ink-soft">
                            {OPERATOR_PROFILES[s.operator]?.name ?? s.operator} ·{" "}
                            {summary ?? s.error ?? STEP_NOTE[s.state]}
                          </span>
                          {s.sources.length > 0 && (
                            <span className="block text-[11px] text-ink-soft/80">
                              sources: {s.sources.map((src) => `${src.name}${src.simulated ? " (sandbox)" : ""}`).join(" · ")}
                            </span>
                          )}
                          {verif && (
                            <span className={`block text-[11px] font-bold ${verif.ok ? "text-signal" : "text-ink"}`}>
                              {verif.ok ? "verified" : "verification failed"}: {verif.detail}
                            </span>
                          )}
                          {planNote && (
                            <span className="block text-[11px] font-semibold text-ink-soft">
                              plan updated: {planNote}
                            </span>
                          )}
                          {typeof s.output?.file_id === "string" && (
                            <Link href="/app/files" className="text-[11px] font-bold underline underline-offset-2">
                              open deliverable in files
                            </Link>
                          )}
                        </span>
                      </li>
                    );
                  })}
                </ol>

                {/* receipt */}
                {m.receipt !== null && (
                  <div className="rounded-btn bg-cream-deep px-3 py-2 text-xs">
                    <p className="font-extrabold lowercase">mission receipt</p>
                    <p className="mt-0.5 text-ink-soft">
                      {(m.receipt.completed_steps as unknown[])?.length ?? 0} steps completed ·{" "}
                      {(m.receipt.deliverables as unknown[])?.length ?? 0} deliverables ·{" "}
                      {(m.receipt.verifications as unknown[])?.length ?? 0} verifications · plan v
                      {String(m.receipt.plan_versions ?? m.plan_version)}
                    </p>
                  </div>
                )}

                {/* controls */}
                <div className="flex flex-wrap gap-2">
                  {!["completed", "partial", "failed", "stopped"].includes(m.state) && (
                    <>
                      {m.state === "paused" ? (
                        <button
                          onClick={() => control(m.id, "resume")}
                          disabled={busy === m.id}
                          className="inline-flex items-center gap-1.5 rounded-btn bg-ink px-3.5 py-2 text-xs font-bold text-cream disabled:opacity-40"
                        >
                          <Play size={12} aria-hidden="true" /> resume
                        </button>
                      ) : (
                        <button
                          onClick={() => control(m.id, "pause")}
                          disabled={busy === m.id}
                          className="inline-flex items-center gap-1.5 rounded-btn px-3.5 py-2 text-xs font-bold lowercase ring-1 ring-inset ring-ink/30 hover:bg-cream-deep disabled:opacity-40"
                        >
                          <Pause size={12} aria-hidden="true" /> pause
                        </button>
                      )}
                      <button
                        onClick={() => control(m.id, "stop")}
                        disabled={busy === m.id}
                        className="inline-flex items-center gap-1.5 rounded-btn px-3.5 py-2 text-xs font-bold lowercase ring-1 ring-inset ring-ink hover:bg-cream-deep disabled:opacity-40"
                      >
                        <Square size={12} aria-hidden="true" /> stop mission
                      </button>
                    </>
                  )}
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
