"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  ArrowUpRight,
  Check,
  Globe,
  Pause,
  Play,
  RefreshCw,
  ShieldCheck,
  Square,
} from "lucide-react";
import type {
  BrowserProductRecord,
  BrowserSessionRecord,
  MissionRecord,
  MissionStepRecord,
} from "@/lib/types";
import { useToast } from "@/components/Toast";

/**
 * The browser view: a two-column window into one mission's browser work.
 * Left — the page cosigno is on (honest preview, site, URL, status, controls).
 * Right — what it is doing, what it found, what's next, and the standing
 * truth that nothing external has been changed. When the mission completes,
 * the result screen shows the recommendation, the other options, and the
 * report. Every value here is read from persisted records — nothing invented.
 */

interface BrowserEvent {
  id: string;
  purpose: string;
  kind: string;
  target: string | null;
  state: string;
  summary: string | null;
  created_at: string;
}

interface ViewData {
  mission: MissionRecord;
  session: BrowserSessionRecord | null;
  events: BrowserEvent[];
  products: BrowserProductRecord[];
  steps: MissionStepRecord[];
  live: boolean;
}

/** Plain-language session status (never technical words). */
const SESSION_LABEL: Record<string, string> = {
  requested: "Starting",
  starting: "Starting",
  active: "Active",
  navigating: "Reading",
  extracting: "Reading",
  waiting_for_page: "Reading",
  interacting: "Reading",
  downloading: "Reading",
  verifying: "Reading",
  waiting_for_user_login: "Login required",
  waiting_for_approval: "Waiting for you",
  paused: "Paused",
  completed: "Completed",
  blocked: "Blocked",
  failed_safely: "Failed",
  stopped: "Stopped",
  expired: "Expired",
};

const SESSION_TONE: Record<string, string> = {
  Starting: "bg-cream-deep text-ink-soft",
  Active: "bg-ink text-cream",
  Reading: "bg-ink text-cream",
  "Login required": "bg-signal text-on-signal",
  "Waiting for you": "bg-signal text-on-signal",
  Paused: "bg-cream-deep text-ink-soft",
  Completed: "bg-signal/20 text-ink",
  Blocked: "ring-1 ring-inset ring-ink/40 text-ink",
  Failed: "ring-1 ring-inset ring-ink/40 text-ink",
  Stopped: "bg-cream-deep text-ink-soft",
  Expired: "bg-cream-deep text-ink-soft",
};

const MISSION_ACTIVE = new Set(["queued", "running", "retrying", "verifying", "awaiting_input", "awaiting_approval"]);

async function jsonFetch(url: string, init?: RequestInit) {
  const res = await fetch(url, {
    ...init,
    headers: { "Content-Type": "application/json", ...init?.headers },
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.message || body.error || "something went wrong.");
  return body;
}

function hostOf(url: string | null): string {
  if (!url) return "";
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
}

/** The non-null facts about a product, as short display lines. */
function factLines(p: BrowserProductRecord): string[] {
  const lines: string[] = [];
  if (p.current_price !== null) lines.push(`Price: $${p.current_price.toFixed(2)}`);
  if (p.processor) lines.push(`Processor: ${p.processor}`);
  if (p.memory) lines.push(`Memory: ${p.memory}`);
  if (p.storage) lines.push(`Storage: ${p.storage}`);
  if (p.graphics) lines.push(`Graphics: ${p.graphics}`);
  if (p.availability) lines.push(`Availability: ${p.availability}`);
  if (p.warranty) lines.push(`Warranty: ${p.warranty}`);
  if (p.return_policy) lines.push(`Returns: ${p.return_policy}`);
  return lines;
}

const CARD = "rounded-card border border-line/70 bg-surface p-5 shadow-soft";
const LABEL = "text-xs font-extrabold uppercase tracking-widest text-ink-soft";

export function BrowserOperatorView({ missionId }: { missionId: string }) {
  const toast = useToast();
  const [data, setData] = useState<ViewData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const load = useCallback(async () => {
    try {
      const d = (await jsonFetch(`/api/missions/${missionId}/browser`)) as ViewData;
      setData(d);
      setError(null);
      return d;
    } catch (e) {
      setError(e instanceof Error ? e.message : "couldn't load the browser view.");
      return null;
    }
  }, [missionId]);

  // While the mission is active, keep the engine moving and the view fresh
  // (the cron tick does the same job when this page is closed).
  useEffect(() => {
    load();
    pollRef.current = setInterval(async () => {
      // Hidden tab: skip the tick entirely — the cron keeps the engine moving.
      if (document.visibilityState === "hidden") return;
      const d = await load();
      if (!d || !MISSION_ACTIVE.has(d.mission.state)) return;
      try {
        await jsonFetch(`/api/missions/${missionId}/advance`, { method: "POST" });
      } catch {
        /* rate-limited or transient — next interval retries */
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

  async function control(op: "pause" | "resume" | "stop" | "refresh") {
    setBusy(op);
    try {
      await jsonFetch(`/api/missions/${missionId}/browser`, { method: "POST", body: JSON.stringify({ op }) });
      await load();
      if (op === "stop") toast("success", "browser stopped — everything found so far was kept.");
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
      <div className={`${CARD} text-center`}>
        <p className="text-sm font-semibold text-ink-soft">{error}</p>
        <button onClick={load} className="mt-3 rounded-btn px-4 py-2 text-sm font-bold ring-1 ring-inset ring-ink hover:bg-cream-deep">
          try again
        </button>
      </div>
    );
  }
  if (!data) {
    return <div className="h-72 animate-pulse rounded-card bg-cream-deep" aria-hidden="true" aria-busy="true" />;
  }

  const { mission, session, products, steps, live } = data;
  const statusLabel = session ? SESSION_LABEL[session.status] ?? session.status : "Starting";
  const running = steps.find((s) => ["running", "retrying", "verifying"].includes(s.state));
  const nextStep = steps.find((s) => s.state === "ready");
  const doing = session?.last_action ?? running?.purpose ?? (mission.state === "completed" ? "Mission complete" : "Preparing…");
  const latest = products[products.length - 1] ?? null;
  const done = steps.filter((s) => ["completed", "skipped"].includes(s.state)).length;

  const recStep = steps.find((s) => s.tool === "laptop.recommend" && s.state === "completed");
  const rec = (recStep?.output?.recommendation ?? null) as { product_id: string; name: string; price: number | null; retailer: string; url: string } | null;
  const reportStep = steps.find((s) => s.tool === "laptop.report" && s.state === "completed");
  const sessionEnded = !session || ["expired", "stopped", "failed_safely", "completed"].includes(session.status);

  /* ------------------------------ result screen ------------------------- */
  if (mission.state === "completed" && reportStep) {
    const others = products.filter((p) => p.id !== rec?.product_id);
    return (
      <div className="flex flex-col gap-5">
        <div className={`${CARD} text-center`}>
          <span className="mx-auto flex h-10 w-10 items-center justify-center rounded-pill bg-signal/15">
            <Check size={20} className="text-signal" strokeWidth={3} />
          </span>
          <h1 className="mt-2 font-display text-2xl font-bold">Mission complete</h1>
          <p className="mt-1 text-sm font-semibold text-ink-soft">
            {products.length} laptop{products.length === 1 ? " was" : "s were"} compared{rec ? " and one recommendation was selected." : ". No recommendation was made — no product had a confirmed price."}
          </p>
        </div>

        {rec && (
          <section className={CARD}>
            <h2 className={LABEL}>Recommended option</h2>
            <p className="mt-2 text-lg font-extrabold">{rec.name}</p>
            <p className="mt-1 text-sm font-semibold text-ink-soft">
              {rec.price !== null ? `$${rec.price.toFixed(2)}` : "price not confirmed"} · {rec.retailer}
            </p>
            {typeof recStep?.output?.reason === "string" && (
              <p className="mt-2 text-sm">{String(recStep.output.reason)}</p>
            )}
            <a
              href={rec.url}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-4 inline-flex items-center gap-1.5 rounded-btn bg-signal px-5 py-2.5 text-sm font-extrabold text-on-signal shadow-soft transition-transform active:scale-95"
            >
              Open recommended product <ArrowUpRight size={15} />
            </a>
          </section>
        )}

        {others.length > 0 && (
          <section className={CARD}>
            <h2 className={LABEL}>Other options</h2>
            <div className="mt-3 flex flex-col gap-3">
              {others.map((p) => (
                <div key={p.id} className="flex items-start justify-between gap-3 rounded-btn bg-cream/40 px-3 py-2.5">
                  <div className="min-w-0">
                    <p className="text-sm font-bold">{p.name}</p>
                    <p className="text-xs text-ink-soft">
                      {p.current_price !== null ? `$${p.current_price.toFixed(2)}` : "price not shown"} · {p.retailer}
                    </p>
                  </div>
                  <a href={p.product_url} target="_blank" rel="noopener noreferrer" className="shrink-0 text-xs font-bold underline underline-offset-2">
                    view
                  </a>
                </div>
              ))}
            </div>
          </section>
        )}

        <section className={`${CARD} flex flex-wrap items-center justify-between gap-3`}>
          <div>
            <h2 className={LABEL}>Final report</h2>
            <p className="mt-1 text-sm font-semibold">{String(reportStep.output?.file_name ?? "Laptop comparison")}</p>
          </div>
          <Link href="/app/files" className="rounded-btn bg-ink px-4 py-2.5 text-sm font-bold text-cream">
            Open comparison
          </Link>
        </section>

        <p className="text-center text-xs font-semibold text-ink-soft">
          Prices and availability may change after this Mission was completed.
        </p>
        <div className="flex flex-wrap justify-center gap-2">
          <Link href="/app" className="rounded-btn px-4 py-2 text-sm font-bold ring-1 ring-inset ring-ink hover:bg-cream-deep">
            Research more options
          </Link>
          <Link href="/app" className="rounded-btn px-4 py-2 text-sm font-bold ring-1 ring-inset ring-ink hover:bg-cream-deep">
            Start another Mission
          </Link>
        </div>
      </div>
    );
  }

  /* ------------------------------ live view ----------------------------- */
  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <h1 className="truncate font-display text-xl font-bold sm:text-2xl">{mission.goal}</h1>
          <p className="mt-0.5 text-sm font-semibold text-ink-soft">
            {done} of {steps.length} steps complete
          </p>
        </div>
        <Link href="/app/missions" className="shrink-0 text-sm font-bold text-ink-soft hover:text-ink">
          all missions
        </Link>
      </div>

      {/* mission question (e.g. which country) */}
      {mission.pending_question && (
        <div className="rounded-card bg-signal/10 p-4 ring-1 ring-inset ring-signal/30">
          <p className="text-sm font-extrabold">{mission.pending_question.question}</p>
          <p className="mt-0.5 text-xs text-ink-soft">{mission.pending_question.why}</p>
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
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[1.25fr_1fr]">
        {/* LEFT: the page */}
        <section className={CARD}>
          <div className="flex flex-wrap items-center gap-2">
            <Globe size={15} className="shrink-0 text-ink-soft" aria-hidden="true" />
            <p className="min-w-0 flex-1 truncate text-sm font-extrabold">
              {hostOf(session?.current_url ?? null) || "no page open yet"}
            </p>
            <span className={`shrink-0 rounded-pill px-2.5 py-0.5 text-[11px] font-bold ${SESSION_TONE[statusLabel] ?? "bg-cream-deep text-ink-soft"}`}>
              {statusLabel}
            </span>
          </div>
          {session?.current_url && (
            <p className="mt-1 truncate text-[11px] text-ink-soft" title={session.current_url}>
              {session.current_url}
            </p>
          )}
          {session?.page_title && <p className="mt-0.5 truncate text-xs font-semibold">{session.page_title}</p>}

          <div className="mt-3 overflow-hidden rounded-btn border border-line/70 bg-cream/40">
            {session?.screenshot_ref ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={session.screenshot_ref} alt={`preview of ${session.page_title ?? "the current page"}`} className="block w-full" />
            ) : (
              <div className="flex h-56 items-center justify-center p-6 text-center text-sm font-semibold text-ink-soft">
                {session ? "The page preview will appear here as cosigno reads." : "The browser hasn't started yet."}
              </div>
            )}
          </div>
          {!live && session && (
            <p className="mt-2 text-[11px] font-semibold text-ink-soft">
              sandbox session — labeled example pages, not the live web. connect a browser provider for real pages.
            </p>
          )}

          <div className="mt-3 flex flex-wrap gap-2">
            {session?.status === "paused" ? (
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
                disabled={busy !== null || sessionEnded}
                className="inline-flex items-center gap-1.5 rounded-btn px-3.5 py-2 text-xs font-bold ring-1 ring-inset ring-ink/30 hover:bg-cream-deep disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <Pause size={12} /> Pause
              </button>
            )}
            <button
              onClick={() => control("stop")}
              disabled={busy !== null || sessionEnded}
              className="inline-flex items-center gap-1.5 rounded-btn px-3.5 py-2 text-xs font-bold ring-1 ring-inset ring-ink hover:bg-cream-deep disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Square size={12} /> Stop
            </button>
            <button
              onClick={() => control("refresh")}
              disabled={busy !== null || !session?.current_url || !live}
              title={live ? "re-capture the current page" : "previews refresh automatically in the sandbox"}
              className="inline-flex items-center gap-1.5 rounded-btn px-3.5 py-2 text-xs font-bold ring-1 ring-inset ring-ink/30 hover:bg-cream-deep disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <RefreshCw size={12} className={busy === "refresh" ? "animate-spin" : ""} /> Refresh preview
            </button>
          </div>
          {session?.stop_reason && <p className="mt-2 text-xs font-semibold text-ink-soft">{session.stop_reason}</p>}
        </section>

        {/* RIGHT: what's happening */}
        <div className="flex flex-col gap-5">
          <section className={CARD}>
            <h2 className={LABEL}>What cosigno is doing</h2>
            <p className="mt-1.5 text-sm font-bold">{doing}</p>
          </section>

          <section className={CARD}>
            <h2 className={LABEL}>What it found</h2>
            {latest ? (
              <div className="mt-1.5">
                <p className="text-sm font-bold">{latest.name}</p>
                <ul className="mt-1 flex flex-col gap-0.5 text-sm">
                  {factLines(latest).map((l) => (
                    <li key={l}>• {l}</li>
                  ))}
                </ul>
                {products.length > 1 && (
                  <p className="mt-2 text-xs font-semibold text-ink-soft">
                    {products.length} of 3 products reviewed
                  </p>
                )}
              </div>
            ) : (
              <p className="mt-1.5 text-sm text-ink-soft">Nothing collected yet.</p>
            )}
          </section>

          <section className={CARD}>
            <h2 className={LABEL}>Next</h2>
            <p className="mt-1.5 text-sm font-semibold">
              {nextStep ? nextStep.purpose : running ? "Finishing the current step" : "Nothing left to do"}
            </p>
          </section>

          <section className={`${CARD} flex items-start gap-2.5`}>
            <ShieldCheck size={16} className="mt-0.5 shrink-0 text-signal" aria-hidden="true" />
            <div>
              <h2 className={LABEL}>Changes made</h2>
              <p className="mt-1 text-sm font-semibold">
                No external changes have been made. This phase is read-only.
              </p>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
