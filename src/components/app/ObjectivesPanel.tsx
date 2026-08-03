"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { ChevronRight, Plus, Target } from "lucide-react";
import { useToast } from "@/components/Toast";
import type { ObjectiveProgress } from "@/lib/objectives";
import type { ObjectiveRecord } from "@/lib/types";

/**
 * Objectives — outcomes owned over time, the layer above Delegations. Each
 * shows its rolled-up momentum, a progress bar derived from linked
 * delegations, and what can happen next. Create one, then link the
 * delegations that move it forward.
 */

interface ObjectiveView {
  objective: ObjectiveRecord;
  progress: ObjectiveProgress;
}

async function jsonFetch(url: string, init?: RequestInit) {
  const res = await fetch(url, {
    ...init,
    headers: { "Content-Type": "application/json", ...init?.headers },
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.message || body.error || "something went wrong.");
  return body;
}

const MOMENTUM_TONE: Record<string, string> = {
  needs_you: "bg-signal text-cream",
  blocked: "ring-1 ring-inset ring-ink/40 text-ink",
  complete: "ring-1 ring-inset ring-signal/50 text-signal",
  moving: "bg-ink text-cream",
  waiting: "bg-cream-deep text-ink-soft",
};

const MOMENTUM_LABEL: Record<string, string> = {
  needs_you: "Needs you",
  blocked: "Blocked",
  complete: "Complete",
  moving: "Moving",
  waiting: "Waiting",
};

function targetLine(target: string | null): string | null {
  if (!target) return null;
  const day = new Date(`${target}T00:00:00Z`).getTime();
  const now = new Date();
  const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  const d = Math.round((day - today) / 86_400_000);
  if (d < 0) return `${Math.abs(d)} day${Math.abs(d) === 1 ? "" : "s"} past target`;
  if (d === 0) return "target today";
  if (d === 1) return "target tomorrow";
  return `${d} days to target`;
}

export function ObjectivesPanel() {
  const [objectives, setObjectives] = useState<ObjectiveView[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [target, setTarget] = useState("");
  const [busy, setBusy] = useState(false);
  const toast = useToast();

  const load = useCallback(async () => {
    setError(null);
    try {
      const d = await jsonFetch("/api/objectives");
      setObjectives(d.objectives ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "couldn't load your objectives.");
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function create() {
    setBusy(true);
    try {
      await jsonFetch("/api/objectives", {
        method: "POST",
        body: JSON.stringify({ title: title.trim(), ...(target ? { target_date: target } : {}) }),
      });
      setTitle("");
      setTarget("");
      setAddOpen(false);
      toast("success", "objective created — link the delegations that move it forward.");
      await load();
    } catch (e) {
      toast("error", e instanceof Error ? e.message : "couldn't create that.");
    } finally {
      setBusy(false);
    }
  }

  const inputCls =
    "w-full rounded-btn bg-surface px-3 py-2.5 text-sm shadow-soft focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-signal";

  if (error) {
    return (
      <div className="rounded-card bg-surface/60 p-6 text-center shadow-soft">
        <p className="text-sm font-semibold text-ink-soft">{error}</p>
        <button
          onClick={load}
          className="mt-3 rounded-btn px-4 py-2 text-sm font-bold lowercase ring-1 ring-inset ring-ink hover:bg-cream-deep"
        >
          try again
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-3">
        <p className="max-w-xl text-xs font-bold lowercase tracking-wide text-ink-soft">
          give cosigno the destination — an outcome you want over time. it understands which
          delegations move it forward, what&apos;s complete, what&apos;s blocked, and what needs you.
        </p>
        <button
          onClick={() => setAddOpen((v) => !v)}
          className="inline-flex shrink-0 items-center gap-1 rounded-btn bg-ink px-3.5 py-2 text-xs font-bold text-cream"
        >
          <Plus size={13} /> {addOpen ? "cancel" : "new objective"}
        </button>
      </div>

      {addOpen && (
        <div className="flex flex-col gap-3 rounded-card bg-surface/60 p-4 shadow-soft">
          <label className="flex flex-col gap-1">
            <span className="text-[11px] font-bold lowercase tracking-wide text-ink-soft">objective</span>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Launch the company by August 1"
              className={inputCls}
              maxLength={140}
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-[11px] font-bold lowercase tracking-wide text-ink-soft">target date (optional)</span>
            <input type="date" value={target} onChange={(e) => setTarget(e.target.value)} className={inputCls} />
          </label>
          <button
            onClick={create}
            disabled={busy || !title.trim()}
            className="self-start rounded-btn bg-signal px-5 py-2.5 text-sm font-extrabold text-ink shadow-soft disabled:bg-cream-deep disabled:text-ink-soft disabled:shadow-none disabled:cursor-not-allowed"
          >
            {busy ? "creating…" : "create objective"}
          </button>
        </div>
      )}

      {objectives === null ? (
        <div className="flex flex-col gap-3" aria-busy="true">
          {[0, 1].map((i) => (
            <div key={i} className="h-28 animate-pulse rounded-card bg-cream-deep" />
          ))}
        </div>
      ) : objectives.length === 0 && !addOpen ? (
        <div className="flex flex-col items-center gap-2 rounded-card bg-surface/40 px-6 py-12 text-center shadow-soft">
          <Target size={22} className="text-ink-soft" />
          <p className="text-sm font-extrabold lowercase">no objectives yet.</p>
          <p className="max-w-sm text-xs text-ink-soft">
            an objective is an outcome you own over time — cosigno keeps every contributing
            delegation moving toward it.
          </p>
        </div>
      ) : (
        objectives.map(({ objective, progress }) => {
          const tl = targetLine(objective.target_date);
          return (
            <Link
              key={objective.id}
              href={`/app/objectives/${objective.id}`}
              className="rounded-card bg-surface/60 p-4 shadow-soft transition-shadow hover:shadow-lift"
            >
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="min-w-0 flex-1 truncate text-sm font-extrabold" title={objective.title}>
                  {objective.title}
                </h2>
                {objective.status !== "active" && (
                  <span className="rounded-pill bg-cream-deep px-2 py-0.5 text-[10px] font-bold lowercase text-ink-soft">
                    {objective.status}
                  </span>
                )}
                <span className={`rounded-pill px-2.5 py-0.5 text-[10px] font-bold lowercase tracking-wide ${MOMENTUM_TONE[progress.momentum]}`}>
                  {MOMENTUM_LABEL[progress.momentum]}
                </span>
                <ChevronRight size={15} className="text-ink-soft" />
              </div>
              {/* progress bar: share of linked delegations complete */}
              <div className="mt-2.5 h-1.5 w-full overflow-hidden rounded-pill bg-cream-deep">
                <div
                  className="h-full rounded-pill bg-ink transition-[width] duration-base"
                  style={{ width: `${Math.round(progress.fraction * 100)}%` }}
                />
              </div>
              <p className="mt-1.5 text-[11px] font-semibold text-ink-soft">
                {progress.complete} of {progress.total} complete
                {progress.needs_you > 0 && ` · ${progress.needs_you} need you`}
                {progress.blocked > 0 && ` · ${progress.blocked} blocked`}
                {tl && ` · ${tl}`}
              </p>
              <p className="mt-1 text-xs text-ink-soft">{progress.next}</p>
            </Link>
          );
        })
      )}
    </div>
  );
}
