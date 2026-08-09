"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Check, Plus, Trash2, X } from "lucide-react";
import { useToast } from "@/components/Toast";
import type { ObjectiveProgress } from "@/lib/objectives";
import type { ObjectiveRecord, SessionRecord } from "@/lib/types";
import { badge, btn, card, dot, field } from "@/components/ui/styles";

/**
 * One objective: its rolled-up progress, the delegations linked to it (each
 * with its own momentum), and controls to link more, mark it achieved, or
 * remove it. Everything shown is derived from real delegation state.
 */

interface Delegation {
  session: SessionRecord;
  momentum: string;
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

const MOMENTUM_LABEL: Record<string, string> = {
  needs_you: "Needs you",
  blocked: "Blocked",
  complete: "Complete",
  moving: "Moving",
  waiting: "Waiting",
};

export function ObjectiveDetail({ id }: { id: string }) {
  const router = useRouter();
  const toast = useToast();
  const [objective, setObjective] = useState<ObjectiveRecord | null>(null);
  const [delegations, setDelegations] = useState<Delegation[]>([]);
  const [progress, setProgress] = useState<ObjectiveProgress | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [linkOpen, setLinkOpen] = useState(false);
  const [sessions, setSessions] = useState<SessionRecord[]>([]);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setError(null);
    try {
      const d = await jsonFetch(`/api/objectives/${id}`);
      setObjective(d.objective);
      setDelegations(d.delegations ?? []);
      setProgress(d.progress ?? null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't load that objective.");
    }
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  async function openLink() {
    setLinkOpen(true);
    try {
      const d = await jsonFetch("/api/sessions");
      setSessions(d.sessions ?? []);
    } catch {
      setSessions([]);
    }
  }

  async function link(sessionId: string) {
    setBusy(true);
    try {
      await jsonFetch(`/api/objectives/${id}/link`, {
        method: "POST",
        body: JSON.stringify({ session_id: sessionId }),
      });
      setLinkOpen(false);
      await load();
    } catch (e) {
      toast("error", e instanceof Error ? e.message : "Couldn't link that.");
    } finally {
      setBusy(false);
    }
  }

  async function unlink(sessionId: string) {
    setBusy(true);
    try {
      await jsonFetch(`/api/objectives/${id}/link`, {
        method: "DELETE",
        body: JSON.stringify({ session_id: sessionId }),
      });
      await load();
    } catch (e) {
      toast("error", e instanceof Error ? e.message : "Couldn't unlink that.");
    } finally {
      setBusy(false);
    }
  }

  async function setStatus(status: "active" | "achieved" | "archived") {
    setBusy(true);
    try {
      const d = await jsonFetch(`/api/objectives/${id}`, {
        method: "PATCH",
        body: JSON.stringify({ status }),
      });
      setObjective(d.objective);
      toast("success", status === "achieved" ? "Marked achieved." : `Marked ${status}.`);
    } catch (e) {
      toast("error", e instanceof Error ? e.message : "Couldn't update that.");
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (!confirm("delete this objective? the delegations themselves are kept — only the links are removed.")) return;
    setBusy(true);
    try {
      await jsonFetch(`/api/objectives/${id}`, { method: "DELETE" });
      toast("success", "Objective deleted.");
      router.push("/app/objectives");
    } catch (e) {
      toast("error", e instanceof Error ? e.message : "Couldn't delete that.");
      setBusy(false);
    }
  }

  if (error) {
    return (
      <div className="px-6 py-16 text-center">
        <p className="t-body">{error}</p>
        <Link href="/app/objectives" className="mt-3 inline-block text-xs font-semibold underline underline-offset-2">
          Back to objectives
        </Link>
      </div>
    );
  }

  if (!objective || !progress) {
    return <div className="h-64 animate-pulse rounded-card bg-cream-deep" aria-busy="true" />;
  }

  const linkedIds = new Set(delegations.map((d) => d.session.id));
  const linkable = sessions.filter((s) => !linkedIds.has(s.id));

  return (
    <div>
      <Link href="/app/objectives" className="inline-flex items-center gap-1 text-xs font-semibold text-ink-soft hover:text-ink">
        <ArrowLeft size={13} /> Objectives
      </Link>

      <h1 className="mt-3 font-display text-2xl font-semibold">{objective.title}</h1>

      {/* progress */}
      <div className="mt-4 rounded-card border border-line/70 bg-surface p-5 shadow-rest">
        <div className="flex items-center justify-between gap-2">
          <p className="text-[0.75rem] font-semibold uppercase tracking-[0.1em] text-ink-soft">Progress</p>
          <span className="text-sm font-semibold">
            {progress.complete} / {progress.total} complete
          </span>
        </div>
        <div className="mt-2 h-2 w-full overflow-hidden rounded-pill bg-cream-deep">
          <div
            className="h-full rounded-pill bg-ink transition-[width] duration-base"
            style={{ width: `${Math.round(progress.fraction * 100)}%` }}
          />
        </div>
        <p className="mt-2 text-sm font-semibold">{progress.next}</p>
        {(progress.needs_you > 0 || progress.blocked > 0) && (
          <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[0.75rem] font-semibold text-ink-soft">
            {progress.needs_you > 0 && (
              <Link href="/app/focus" className="text-signal-ink hover:underline">
                {progress.needs_you} at your boundary →
              </Link>
            )}
            {progress.blocked > 0 && <span>{progress.blocked} blocked</span>}
            <span>{progress.moving} moving</span>
          </div>
        )}
      </div>

      {/* linked delegations */}
      <div className="mt-6 flex items-center justify-between">
        <h2 className="text-xs font-semibold uppercase tracking-[0.1em] text-ink-soft">
          Delegations ({delegations.length})
        </h2>
        <button
          onClick={openLink}
          className="inline-flex items-center gap-1 rounded-btn px-3 py-1.5 text-xs font-semibold ring-1 ring-inset ring-ink hover:bg-cream-deep"
        >
          <Plus size={12} /> Link a delegation
        </button>
      </div>

      {linkOpen && (
        <div className="mt-3 rounded-card bg-surface p-4 shadow-rest">
          <div className="mb-2 flex items-center justify-between">
            <p className="text-xs font-semibold text-ink-soft">Pick a delegation to link</p>
            <button onClick={() => setLinkOpen(false)} className="rounded-btn p-1 text-ink-soft hover:bg-cream-deep">
              <X size={14} />
            </button>
          </div>
          {linkable.length === 0 ? (
            <p className="text-xs text-ink-soft">No other delegations to link. delegate something first.</p>
          ) : (
            <ul className="flex max-h-64 flex-col gap-1 overflow-auto">
              {linkable.slice(0, 40).map((s) => (
                <li key={s.id}>
                  <button
                    onClick={() => link(s.id)}
                    disabled={busy}
                    className="flex w-full items-center gap-2 rounded-btn px-3 py-2 text-left text-sm font-semibold hover:bg-cream-deep disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <Plus size={13} className="shrink-0 text-ink-soft" />
                    <span className="min-w-0 flex-1 truncate">{s.title}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      <div className="mt-3 flex flex-col gap-2">
        {delegations.length === 0 ? (
          <div className="rounded-card bg-surface px-6 py-8 text-center shadow-rest">
            <p className="text-sm text-ink-soft">
              No delegations linked yet. Link the ones that move this outcome forward.
            </p>
          </div>
        ) : (
          delegations.map((d) => (
            <div key={d.session.id} className="flex items-center gap-3 rounded-card bg-surface p-3.5 shadow-rest">
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold">{d.session.title}</p>
                <p className="text-[0.75rem] font-semibold text-ink-soft">{MOMENTUM_LABEL[d.momentum] ?? d.momentum}</p>
              </div>
              <button
                onClick={() => unlink(d.session.id)}
                disabled={busy}
                className="shrink-0 rounded-btn p-1.5 text-ink-soft hover:bg-cream-deep hover:text-ink disabled:opacity-50 disabled:cursor-not-allowed"
                title="unlink"
                aria-label="unlink delegation"
              >
                <X size={15} />
              </button>
            </div>
          ))
        )}
      </div>

      {/* lifecycle */}
      <div className="mt-6 flex flex-wrap items-center gap-2 border-t border-line/60 pt-4">
        {objective.status !== "achieved" ? (
          <button
            onClick={() => setStatus("achieved")}
            disabled={busy}
            className="inline-flex items-center gap-1.5 rounded-btn bg-signal px-4 py-2 text-sm font-semibold text-on-signal shadow-rest disabled:bg-cream-deep disabled:text-on-signal-soft disabled:shadow-none disabled:cursor-not-allowed"
          >
            <Check size={14} strokeWidth={3} /> Mark achieved
          </button>
        ) : (
          <button
            onClick={() => setStatus("active")}
            disabled={busy}
            className="rounded-btn px-4 py-2 text-sm font-semibold ring-1 ring-inset ring-ink hover:bg-cream-deep disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Reopen
          </button>
        )}
        <button
          onClick={remove}
          disabled={busy}
          className="ml-auto inline-flex items-center gap-1.5 rounded-btn px-3 py-2 text-sm font-semibold text-ink-soft ring-1 ring-inset ring-ink/30 hover:bg-cream-deep disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <Trash2 size={13} /> Delete
        </button>
      </div>
    </div>
  );
}
