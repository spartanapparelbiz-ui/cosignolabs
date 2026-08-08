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
import { useBackgroundExecution } from "./useBackgroundExecution";
import { DecisionInbox } from "@/components/app/DecisionInbox";
import { missionStatus, STATUS_TONE } from "@/lib/status";
import { SkeletonRows } from "@/components/Skeleton";
import { EmptyState } from "@/components/ui/Page";
import { badge, btn, card, dot, field } from "@/components/ui/styles";

/**
 * A mission worth trying, offered rather than sold. The whole row is not the
 * button: the description is there to be read, and the one control sits at the
 * end where every other control in the product sits.
 */
function StarterRow({
  icon,
  title,
  detail,
  busy,
  onStart,
}: {
  icon: React.ReactNode;
  title: string;
  detail: string;
  busy: boolean;
  onStart: () => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-btn px-3 py-3.5 transition-colors duration-fast hover:bg-ink/[0.025]">
      <span className="mt-0.5 shrink-0 self-start text-ink-soft">{icon}</span>
      <div className="min-w-0 flex-1">
        <p className="text-[0.9375rem]">{title}</p>
        <p className="t-caption mt-0.5">{detail}</p>
      </div>
      <button onClick={onStart} disabled={busy} className={btn("secondary", "sm")}>
        {busy ? "Starting…" : "Start"}
      </button>
    </div>
  );
}

/**
 * Durable missions — work that continues server-side after this tab closes.
 * While the page is open, the client keeps the engine moving by calling
 * /advance; away from the page, the cron tick does the same job. Everything
 * shown is read straight from the persisted mission + step records.
 */

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

  if (preview) {
    const p = preview.plan;
    return (
      <div className={`${card()} animate-card-in p-6`}>
        <p className="t-eyebrow">Here&apos;s what I understood</p>
        <p className="t-title mt-2">{preview.understood.normalizedGoal}</p>
        <p className="t-caption mt-1.5">
          Planned from your goal using only the tools cosigno actually has.
        </p>

        {preview.understood.willDo.length > 0 && (
          <ol className="t-body mt-6 flex flex-col gap-2">
            {preview.understood.willDo.map((w, i) => (
              <li key={i} className="flex gap-3">
                <span className="t-caption w-4 shrink-0 tabular-nums">{i + 1}</span>
                {w}
              </li>
            ))}
          </ol>
        )}

        {p.approvalCheckpoints.length > 0 && (
          <p className="t-body mt-5">
            <span className="t-eyebrow mr-2">Boundary</span>
            {preview.understood.boundary}
          </p>
        )}

        {p.unsupported.length > 0 && (
          <div className="mt-5 flex flex-col gap-1 border-l-2 border-signal pl-3.5">
            {p.unsupported.map((u, i) => (
              <p key={i} className="t-body">
                {u}
              </p>
            ))}
          </div>
        )}

        {p.expectedDeliverables.length > 0 && (
          <p className="t-caption mt-5">You&apos;ll get {p.expectedDeliverables.join(", ")}</p>
        )}

        <div className="mt-7 flex flex-wrap items-center gap-1.5">
          {preview.blocked ? (
            <p className="t-body">This can&apos;t run as written — see the note above.</p>
          ) : (
            <button onClick={start} disabled={busy} className={btn("primary", "md")}>
              {busy ? "Starting…" : "Start"}
            </button>
          )}
          <button onClick={() => setPreview(null)} className={btn("ghost", "md")}>
            Edit
          </button>
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="flex flex-col gap-2 sm:flex-row">
        <input
          value={goal}
          onChange={(e) => setGoal(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && compile()}
          maxLength={500}
          placeholder="e.g. compare the best laptops under $1,000"
          className={field("md")}
          aria-label="mission goal"
        />
        <button onClick={compile} disabled={busy || !goal.trim()} className={btn("secondary", "md", "shrink-0")}>
          {busy ? "Reading…" : "Plan it"}
        </button>
      </div>
      <p className="t-caption mt-2">
        cosigno turns a goal into a real plan using only the tools it has, and shows
        you before anything runs.
      </p>
    </div>
  );
}

export function MissionRunner({ initial }: { initial?: MissionRecord[] }) {
  // Server-prefetched list paints immediately; the mount load() below is a
  // background revalidate (SWR). Without prefetch it's the first load.
  const [missions, setMissions] = useState<MissionRecord[] | null>(initial ?? null);
  const [openId, setOpenId] = useState<string | null>(null);
  const [steps, setSteps] = useState<Record<string, MissionStepRecord[]>>({});
  const [sources, setSources] = useState<Record<string, MissionSourceRecord[]>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const bgActive = useBackgroundExecution();
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
      toast(
        "success",
        bgActive === true
          ? "mission started — it keeps working even if you close this tab."
          : bgActive === false
            ? "mission started — keep this mission open; it pauses when you close it."
            : "mission started — keep it open until we can confirm it runs in the background."
      );
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
      <EmptyState
        title="That didn't load"
        description={error}
        action={
          <button onClick={load} className={btn("secondary", "md")}>
            Try again
          </button>
        }
      />
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {bgActive === false && (
        <p className="t-body border-l-2 border-signal pl-3.5">
          {/* What happens to them, not what we failed to set up. */}
          {/* Advancement is driven by the interval above, which only runs
              while an ACTIVE mission is OPEN — not merely while this page is.
              Saying "reopen the page" would be a promise the code does not
              keep. */}
          A mission moves forward only while you have it open. Background running
          isn&apos;t switched on for this workspace yet, so closing it pauses the
          work rather than losing it.
        </p>
      )}

      {/* open-ended goal → compiled mission */}
      <GoalComposer
        onStarted={async (id) => {
          await load();
          setOpenId(id);
          await loadSteps(id);
        }}
      />

      {/* Two missions worth trying, offered as suggestions rather than as two
          more orange buttons competing with the box above. */}
      <div className="mt-2 flex flex-col">
        <StarterRow
          icon={<Rocket size={15} strokeWidth={1.9} aria-hidden="true" />}
          title="Prepare everything for tomorrow's meeting"
          detail={
            bgActive === false
              ? "Finds the event, reads related mail and files, builds a brief and drafts the follow-up. Keep it open while it runs."
              : "Finds the event, reads related mail and files, builds a brief and drafts the follow-up."
          }
          busy={busy === "start"}
          onStart={start}
        />
        <StarterRow
          icon={<Globe size={15} strokeWidth={1.9} aria-hidden="true" />}
          title="Compare three laptops under $1,000"
          detail="Opens real product pages, records what they show, and stops at the one it recommends. Read-only — nothing is ever bought."
          busy={busy === "laptop"}
          onStart={startLaptop}
        />
      </div>

      {missions === null && <SkeletonRows rows={2} />}

      {(missions ?? []).map((m) => {
        const open = openId === m.id;
        const mySteps = steps[m.id] ?? [];
        const done = mySteps.filter((s) => s.state === "completed").length;
        const usesBrowser = mySteps.some((s) => s.tool.startsWith("laptop.") || s.tool.startsWith("browser."));
        return (
          <div key={m.id} className={card()}>
            <button
              onClick={async () => {
                setOpenId(open ? null : m.id);
                if (!open) await loadSteps(m.id);
              }}
              aria-expanded={open}
              className="flex w-full items-center gap-3 rounded-card px-5 py-4 text-left transition-colors duration-fast hover:bg-ink/[0.02]"
            >
              <span className="min-w-0 flex-1">
                <span className="t-title block truncate">{m.goal}</span>
                <span className="t-caption mt-0.5 block">
                  Started {new Date(m.created_at).toLocaleString()}
                  {mySteps.length > 0 && ` · ${done} of ${mySteps.length} steps done`}
                </span>
              </span>
              <span className={badge(STATUS_TONE[missionStatus(m.state)])}>
                <span className={dot(STATUS_TONE[missionStatus(m.state)])} aria-hidden="true" />
                {missionStatus(m.state)}
              </span>
              <ChevronDown
                size={15}
                strokeWidth={2}
                className={`shrink-0 text-ink-soft transition-transform duration-base ease-brand-out ${open ? "rotate-180" : ""}`}
                aria-hidden="true"
              />
            </button>

            {open && (
              <div className="flex animate-fade-through flex-col gap-4 border-t border-line/40 px-5 py-4">
                <div className="flex flex-wrap gap-2">
                  <Link
                    href={`/app/missions/${m.id}`}
                    className="inline-flex w-fit items-center gap-1.5 rounded-btn px-3.5 py-2 text-xs font-semibold ring-1 ring-inset ring-ink/30 hover:bg-cream-deep"
                  >
                    Open the mission workspace
                  </Link>
                  {usesBrowser && (
                    <Link
                      href={`/app/browser/${m.id}`}
                      className="inline-flex w-fit items-center gap-1.5 rounded-btn px-3.5 py-2 text-xs font-semibold ring-1 ring-inset ring-ink/30 hover:bg-cream-deep"
                    >
                      <Globe size={13} aria-hidden="true" /> Open the browser view
                    </Link>
                  )}
                </div>

                {/* pending question */}
                {m.pending_question && (
                  <div className="rounded-btn bg-signal/10 p-3 ring-1 ring-inset ring-signal/30">
                    <p className="text-sm font-semibold">{m.pending_question.question}</p>
                    <p className="mt-0.5 text-xs text-ink-soft">
                      why: {m.pending_question.why} · effect: {m.pending_question.effect}
                    </p>
                    <div className="mt-2 flex flex-wrap gap-2">
                      {m.pending_question.options.map((o) => (
                        <button
                          key={o}
                          onClick={() => answer(m.id, o)}
                          disabled={busy === m.id}
                          className={`min-h-[32px] rounded-btn px-3.5 py-1.5 text-xs font-semibold disabled:bg-cream-deep disabled:text-ink-soft disabled:shadow-none disabled:cursor-not-allowed ${
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
                  <>
                    <p className="rounded-btn bg-cream-deep px-3 py-2 text-xs font-semibold">
                      a consequential step is waiting for your signature. the mission
                      resumes automatically after you decide.
                    </p>
                    {/* Decide right here, on the mission that raised it. Scoped
                        to THIS mission's cards so an approval on the list page
                        can never sign off a neighbouring mission's action. */}
                    {(() => {
                      const ids = mySteps
                        .filter((st) => st.state === "awaiting_approval" && st.action_id)
                        .map((st) => st.action_id as string);
                      return ids.length > 0 ? (
                        <DecisionInbox only={ids} compact emptyFallback={null} />
                      ) : null;
                    })()}
                  </>
                )}

                {/* sources the user provided (files + links), as real inputs */}
                {(sources[m.id] ?? []).length > 0 && (
                  <div className="rounded-btn bg-cream-deep/60 px-3 py-2.5">
                    <p className="t-eyebrow">
                      Sources you provided
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
                              <span className="font-semibold">{src.name}</span>
                              <span className="block text-[0.75rem] text-ink-soft">
                                {src.kind === "link" ? src.subtype || "link" : src.subtype}
                                {" · "}
                                {usable ? (src.kind === "link" ? "read" : "read as context") : "not used — couldn't be read"}
                                {src.injection_flag && " · flagged content (data only)"}
                              </span>
                              {usable && usedBy.length > 0 && (
                                <span className="block text-[0.75rem] text-ink-soft/80">
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
                          <span className="block text-[0.75rem] text-ink-soft">
                            {OPERATOR_PROFILES[s.operator]?.name ?? s.operator} ·{" "}
                            {summary ?? s.error ?? STEP_NOTE[s.state]}
                          </span>
                          {s.sources.length > 0 && (
                            <span className="block text-[0.75rem] text-ink-soft/80">
                              sources: {s.sources.map((src) => `${src.name}${src.simulated ? " (sandbox)" : ""}`).join(" · ")}
                            </span>
                          )}
                          {verif && (
                            <span className={`block text-[0.75rem] font-semibold ${verif.ok ? "text-signal" : "text-ink"}`}>
                              {verif.ok ? "verified" : "verification failed"}: {verif.detail}
                            </span>
                          )}
                          {planNote && (
                            <span className="block text-[0.75rem] font-semibold text-ink-soft">
                              plan updated: {planNote}
                            </span>
                          )}
                          {typeof s.output?.file_id === "string" && (
                            <Link href="/app/files" className="text-[0.75rem] font-semibold underline underline-offset-2">
                              Open deliverable in files
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
                    <p className="font-semibold">Mission receipt</p>
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
                          className="inline-flex items-center gap-1.5 rounded-btn bg-ink px-3.5 py-2 text-xs font-semibold text-cream disabled:bg-cream-deep disabled:text-ink-soft disabled:shadow-none disabled:cursor-not-allowed"
                        >
                          <Play size={12} aria-hidden="true" /> Resume
                        </button>
                      ) : (
                        <button
                          onClick={() => control(m.id, "pause")}
                          disabled={busy === m.id}
                          className="inline-flex items-center gap-1.5 rounded-btn px-3.5 py-2 text-xs font-semibold ring-1 ring-inset ring-ink/30 hover:bg-cream-deep disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          <Pause size={12} aria-hidden="true" /> pause
                        </button>
                      )}
                      <button
                        onClick={() => control(m.id, "stop")}
                        disabled={busy === m.id}
                        className="inline-flex items-center gap-1.5 rounded-btn px-3.5 py-2 text-xs font-semibold ring-1 ring-inset ring-ink hover:bg-cream-deep disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        <Square size={12} aria-hidden="true" /> Stop mission
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
