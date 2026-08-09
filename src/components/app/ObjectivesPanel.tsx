"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { ChevronRight, Plus, Target } from "lucide-react";
import { useToast } from "@/components/Toast";
import type { ObjectiveProgress } from "@/lib/objectives";
import type { ObjectiveRecord } from "@/lib/types";
import { badge, btn, card, dot, field, type BadgeTone } from "@/components/ui/styles";
import { SkeletonRows } from "@/components/Skeleton";
import { EmptyState } from "@/components/ui/Page";

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
  if (!res.ok) throw new Error(body.message || body.error || "Something went wrong.");
  return body;
}

const MOMENTUM_TONE: Record<string, BadgeTone> = {
  needs_you: "signal",
  blocked: "danger",
  complete: "positive",
  moving: "neutral",
  waiting: "neutral",
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
      setError(e instanceof Error ? e.message : "Couldn't load your objectives.");
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
      toast("success", "Objective created — link the delegations that move it forward.");
      await load();
    } catch (e) {
      toast("error", e instanceof Error ? e.message : "Couldn't create that.");
    } finally {
      setBusy(false);
    }
  }

  const inputCls = field("md");

  if (error) {
    return (
      <div className="px-6 py-16 text-center">
        <p className="t-body">{error}</p>
        <button
          onClick={load}
          className={btn("secondary", "md", "mt-5")}
        >
          Try again
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-3">
        <p className="t-caption max-w-[36rem]">
          Give cosigno the destination. It works out which missions move it forward, what
          is complete, what is blocked, and what needs you.
        </p>
        <button onClick={() => setAddOpen((v) => !v)} className={btn("secondary", "sm", "shrink-0")}>
          <Plus size={13} strokeWidth={1.9} /> {addOpen ? "Cancel" : "New"}
        </button>
      </div>

      {addOpen && (
        <div className={`${card()} flex animate-card-in flex-col gap-4 p-5`}>
          <label className="flex flex-col gap-1.5">
            <span className="t-eyebrow">Objective</span>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Launch the company by August 1"
              className={inputCls}
              maxLength={140}
            />
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="t-eyebrow">Target date (optional)</span>
            <input type="date" value={target} onChange={(e) => setTarget(e.target.value)} className={inputCls} />
          </label>
          <button
            onClick={create}
            disabled={busy || !title.trim()}
            className={btn("primary", "md", "self-start")}
          >
            {busy ? "Creating…" : "Create"}
          </button>
        </div>
      )}

      {objectives === null ? (
        <SkeletonRows rows={3} />
      ) : objectives.length === 0 && !addOpen ? (
        <EmptyState
          title="No objectives yet"
          description="An objective is an outcome you own over time. Cosigno keeps every mission that contributes to it moving."
        />
      ) : (
        objectives.map(({ objective, progress }) => {
          const tl = targetLine(objective.target_date);
          return (
            <Link
              key={objective.id}
              href={`/app/objectives/${objective.id}`}
              className={`${card(true)} p-5`}
            >
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="t-title min-w-0 flex-1 truncate" title={objective.title}>
                  {objective.title}
                </h2>
                {objective.status !== "active" && (
                  <span className={badge("neutral")}>{objective.status}</span>
                )}
                <span className={badge(MOMENTUM_TONE[progress.momentum] ?? "neutral")}>
                  <span className={dot(MOMENTUM_TONE[progress.momentum] ?? "neutral")} aria-hidden="true" />
                  {MOMENTUM_LABEL[progress.momentum]}
                </span>
                <ChevronRight size={15} className="text-ink-soft" />
              </div>
              {/* progress bar: share of linked delegations complete */}
              <div className="mt-4 h-1 w-full overflow-hidden rounded-pill bg-ink/[0.08]">
                <div
                  className="h-full rounded-pill bg-ink transition-[width] duration-slow ease-brand-out"
                  style={{ width: `${Math.round(progress.fraction * 100)}%` }}
                />
              </div>
              <p className="t-caption mt-2 tabular-nums">
                {progress.complete} of {progress.total} complete
                {progress.needs_you > 0 && ` · ${progress.needs_you} need you`}
                {progress.blocked > 0 && ` · ${progress.blocked} blocked`}
                {tl && ` · ${tl}`}
              </p>
              <p className="t-caption mt-1">{progress.next}</p>
            </Link>
          );
        })
      )}
    </div>
  );
}
