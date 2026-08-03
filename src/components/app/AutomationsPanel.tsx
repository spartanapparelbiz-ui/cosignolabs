"use client";

import { useCallback, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Pause, Play, Plus, Trash2, Zap } from "lucide-react";
import type { AutomationRecord, AutomationRunRecord } from "@/lib/types";
import { useToast } from "@/components/Toast";

/**
 * Automations — recurring missions. Create (name + command + cadence), run
 * now (doubles as test mode: cards land in the decision inbox, nothing beyond
 * tier-1 executes without a signature), pause/resume, delete (confirm), and a
 * per-automation run history. Full loading / error / empty states.
 */

const CADENCES = [
  { label: "every hour", hours: 1 },
  { label: "every day", hours: 24 },
  { label: "every week", hours: 168 },
] as const;

/**
 * Trust modes — what each standing order may do with what it finds:
 * OBSERVE watches and reports, PREPARE readies work for approval, OPERATE
 * is an explicit per-order grant to run its routine actions. Locked tier-3
 * actions always wait for a signature, whatever the mode. (Stored values
 * keep their original names; these are the honest labels.)
 */
const MODES: { value: AutomationRecord["mode"]; label: string; detail: string }[] = [
  {
    value: "monitor",
    label: "observe",
    detail: "watch and report only — nothing is proposed, nothing waits on you.",
  },
  {
    value: "prepare",
    label: "prepare",
    detail: "prepare proposed actions that wait for your approval. the default.",
  },
  {
    value: "execute",
    label: "operate",
    detail:
      "you grant THIS order permission to run its routine actions automatically. signed and locked actions (external email, payments, refunds, deletes) always wait for you.",
  },
];

const MODE_LABEL: Record<AutomationRecord["mode"], string> = {
  monitor: "observe",
  prepare: "prepare",
  execute: "operate",
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

function cadenceLabel(hours: number): string {
  const hit = CADENCES.find((c) => c.hours === hours);
  if (hit) return hit.label;
  return hours % 24 === 0 ? `every ${hours / 24} days` : `every ${hours}h`;
}

export function AutomationsPanel() {
  const [automations, setAutomations] = useState<AutomationRecord[] | null>(null);
  const [runs, setRuns] = useState<Record<string, AutomationRunRecord[]>>({});
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [name, setName] = useState("");
  const [command, setCommand] = useState("");
  const [hours, setHours] = useState<number>(24);
  const [mode, setMode] = useState<AutomationRecord["mode"]>("prepare");
  const searchParams = useSearchParams();

  // "Handle this the same way next time" lands here prefilled — the form
  // opens with the delegation's goal, and nothing exists until confirmed.
  useEffect(() => {
    const prefillName = searchParams.get("name");
    const prefillCommand = searchParams.get("command");
    if (prefillName || prefillCommand) {
      setName((prefillName ?? "").slice(0, 80));
      setCommand((prefillCommand ?? "").slice(0, 2000));
      setAddOpen(true);
    }
  }, [searchParams]);
  const toast = useToast();

  const load = useCallback(async () => {
    setError(null);
    try {
      const data = await jsonFetch("/api/automations");
      setAutomations(data.automations ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "couldn't load your automations.");
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function create() {
    setBusy("create");
    try {
      await jsonFetch("/api/automations", {
        method: "POST",
        body: JSON.stringify({ name: name.trim(), command: command.trim(), interval_hours: hours, mode }),
      });
      setName("");
      setCommand("");
      setMode("prepare");
      setAddOpen(false);
      toast("success", "standing order created — its first run is scheduled.");
      await load();
    } catch (e) {
      toast("error", e instanceof Error ? e.message : "couldn't create that automation.");
    } finally {
      setBusy(null);
    }
  }

  async function runNow(a: AutomationRecord) {
    setBusy(a.id);
    try {
      const { run } = await jsonFetch(`/api/automations/${a.id}/run`, { method: "POST" });
      toast(
        run.status === "ok" ? "success" : "error",
        run.status === "ok"
          ? "ran — anything needing you is in decisions."
          : run.detail || "that run didn't complete."
      );
      await load();
      await toggleRuns(a.id, true);
    } catch (e) {
      toast("error", e instanceof Error ? e.message : "couldn't run that.");
    } finally {
      setBusy(null);
    }
  }

  async function setEnabled(a: AutomationRecord, enabled: boolean) {
    setBusy(a.id);
    try {
      await jsonFetch(`/api/automations/${a.id}`, {
        method: "PATCH",
        body: JSON.stringify({ enabled }),
      });
      toast("success", enabled ? "resumed." : "paused — no runs until you resume.");
      await load();
    } finally {
      setBusy(null);
    }
  }

  async function remove(a: AutomationRecord) {
    if (!confirm(`delete "${a.name}"? this stops all future runs immediately.`)) return;
    setBusy(a.id);
    try {
      await jsonFetch(`/api/automations/${a.id}`, { method: "DELETE" });
      toast("success", "deleted — nothing further will run.");
      await load();
    } finally {
      setBusy(null);
    }
  }

  async function toggleRuns(id: string, forceOpen = false) {
    if (runs[id] && !forceOpen) {
      setRuns((prev) => {
        const next = { ...prev };
        delete next[id];
        return next;
      });
      return;
    }
    const data = await jsonFetch(`/api/automations/${id}`).catch(() => null);
    if (data) setRuns((prev) => ({ ...prev, [id]: data.runs ?? [] }));
  }

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

  if (automations === null) {
    return (
      <div className="flex flex-col gap-3" aria-busy="true" aria-label="loading automations">
        {[0, 1].map((i) => (
          <div key={i} className="h-24 animate-pulse rounded-card bg-cream-deep" />
        ))}
      </div>
    );
  }

  const inputCls =
    "w-full rounded-btn bg-surface px-3 py-2.5 text-sm shadow-soft focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-signal";

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <p className="text-xs font-bold lowercase tracking-wide text-ink-soft">
          standing orders are ongoing responsibilities — every run goes through
          the same approval loop, and nothing important crosses the boundary
          without you.
        </p>
        <button
          onClick={() => setAddOpen((v) => !v)}
          className="inline-flex shrink-0 items-center gap-1 rounded-btn bg-ink px-3.5 py-2 text-xs font-bold text-cream"
        >
          <Plus size={13} /> {addOpen ? "cancel" : "new standing order"}
        </button>
      </div>

      {addOpen && (
        <div className="flex flex-col gap-3 rounded-card bg-surface/60 p-4 shadow-soft">
          <label className="flex flex-col gap-1">
            <span className="text-[11px] font-bold lowercase tracking-wide text-ink-soft">name</span>
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="morning inbox review" className={inputCls} />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-[11px] font-bold lowercase tracking-wide text-ink-soft">what should it do?</span>
            <textarea
              value={command}
              onChange={(e) => setCommand(e.target.value)}
              rows={2}
              placeholder="review my unread email and prepare replies for the ones that need action"
              className={inputCls}
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-[11px] font-bold lowercase tracking-wide text-ink-soft">cadence</span>
            <select value={hours} onChange={(e) => setHours(Number(e.target.value))} className={inputCls}>
              {CADENCES.map((c) => (
                <option key={c.hours} value={c.hours}>{c.label}</option>
              ))}
            </select>
          </label>
          <fieldset className="flex flex-col gap-1">
            <legend className="text-[11px] font-bold lowercase tracking-wide text-ink-soft">
              what may it do?
            </legend>
            <div className="mt-1 flex flex-col gap-1.5">
              {MODES.map((m) => (
                <label
                  key={m.value}
                  className={`flex cursor-pointer items-start gap-2.5 rounded-btn px-3 py-2 ring-1 ring-inset ${
                    mode === m.value ? "ring-ink bg-cream-deep" : "ring-line/70"
                  }`}
                >
                  <input
                    type="radio"
                    name="automation-mode"
                    value={m.value}
                    checked={mode === m.value}
                    onChange={() => setMode(m.value)}
                    className="mt-0.5 accent-[#FB4C20]"
                  />
                  <span>
                    <span className="text-xs font-extrabold lowercase">{m.label}</span>
                    <span className="block text-[11px] text-ink-soft">{m.detail}</span>
                  </span>
                </label>
              ))}
            </div>
          </fieldset>
          <button
            onClick={create}
            disabled={busy === "create" || !name.trim() || !command.trim()}
            className="self-start rounded-btn bg-signal px-5 py-2.5 text-sm font-extrabold text-ink shadow-soft disabled:bg-cream-deep disabled:text-ink-soft disabled:shadow-none disabled:cursor-not-allowed"
          >
            {busy === "create" ? "creating…" : "create standing order"}
          </button>
        </div>
      )}

      {automations.length === 0 && !addOpen && (
        <div className="flex flex-col items-center gap-2 rounded-card bg-surface/40 px-6 py-12 text-center shadow-soft">
          <Zap size={22} className="text-ink-soft" />
          <p className="text-sm font-extrabold lowercase">no automations yet.</p>
          <p className="max-w-sm text-xs text-ink-soft">
            turn repeated work into a recurring mission — a morning inbox
            review, a weekly report. cosigno prepares the work on schedule;
            anything consequential still waits for your signature.
          </p>
        </div>
      )}

      {automations.map((a) => (
        <div key={a.id} className="rounded-card bg-surface/60 p-4 shadow-soft">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="min-w-0 flex-1 truncate text-sm font-extrabold" title={a.name}>
              {a.name}
            </h2>
            <span
              className="rounded-pill bg-cream-deep px-2.5 py-0.5 text-[10px] font-bold lowercase tracking-wide text-ink-soft"
              title={MODES.find((m) => m.value === a.mode)?.detail}
            >
              {MODE_LABEL[a.mode] ?? "prepare"}
            </span>
            <span
              className={`rounded-pill px-2.5 py-0.5 text-[10px] font-bold lowercase tracking-wide ${
                a.enabled ? "bg-signal text-cream" : "ring-1 ring-inset ring-ink/40 text-ink-soft"
              }`}
            >
              {a.enabled ? "active" : "paused"}
            </span>
          </div>
          <p className="mt-1.5 line-clamp-2 font-mono text-[11px] text-ink-soft">“{a.command}”</p>
          <p className="mt-1 text-[11px] font-semibold text-ink-soft">
            {cadenceLabel(a.interval_hours)} ·{" "}
            {a.last_run_at ? `last ran ${new Date(a.last_run_at).toLocaleString()}` : "hasn't run yet"} ·{" "}
            {a.enabled ? `next ${new Date(a.next_run_at).toLocaleString()}` : "paused"}
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              onClick={() => runNow(a)}
              disabled={busy === a.id}
              className="inline-flex min-h-[36px] items-center gap-1.5 rounded-btn bg-ink px-3.5 py-1.5 text-xs font-bold text-cream disabled:bg-cream-deep disabled:text-ink-soft disabled:shadow-none disabled:cursor-not-allowed"
            >
              <Play size={12} /> {busy === a.id ? "…" : "run now"}
            </button>
            <button
              onClick={() => setEnabled(a, !a.enabled)}
              disabled={busy === a.id}
              className="inline-flex min-h-[36px] items-center gap-1.5 rounded-btn px-3.5 py-1.5 text-xs font-bold lowercase ring-1 ring-inset ring-ink hover:bg-cream-deep"
            >
              {a.enabled ? <Pause size={12} /> : <Play size={12} />}
              {a.enabled ? "pause" : "resume"}
            </button>
            <button
              onClick={() => toggleRuns(a.id)}
              className="min-h-[36px] rounded-btn px-3.5 py-1.5 text-xs font-bold lowercase text-ink-soft hover:bg-cream-deep"
            >
              {runs[a.id] ? "hide runs" : "run history"}
            </button>
            <button
              onClick={() => remove(a)}
              disabled={busy === a.id}
              className="ml-auto inline-flex min-h-[36px] items-center gap-1.5 rounded-btn px-3 py-1.5 text-xs font-bold lowercase text-ink-soft ring-1 ring-inset ring-ink/30 hover:bg-cream-deep"
              title="delete — stops all future runs"
            >
              <Trash2 size={12} /> delete
            </button>
          </div>
          {runs[a.id] && (
            <div className="mt-3 flex flex-col gap-1.5 border-t border-line/50 pt-3">
              {runs[a.id].length === 0 && (
                <p className="text-[11px] text-ink-soft">no runs yet.</p>
              )}
              {runs[a.id].map((r) => (
                <p key={r.id} className="flex items-baseline gap-2 text-[11px]">
                  <span
                    className={`shrink-0 font-bold lowercase ${
                      r.status === "ok" ? "text-signal" : "text-ink"
                    }`}
                  >
                    {r.status}
                  </span>
                  <span className="text-ink-soft">
                    {new Date(r.created_at).toLocaleString()} — {r.detail ?? ""}
                  </span>
                </p>
              ))}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
