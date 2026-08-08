"use client";

import { useCallback, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Pause, Play, Plus, Trash2 } from "lucide-react";
import type { AutomationRecord, AutomationRunRecord } from "@/lib/types";
import { useToast } from "@/components/Toast";
import { useBackgroundExecution } from "./useBackgroundExecution";
import { SkeletonRows } from "@/components/Skeleton";
import { EmptyState } from "@/components/ui/Page";
import { badge, btn, card, dot, field } from "@/components/ui/styles";

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
  const backgroundActive = useBackgroundExecution();
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
      /* Three states, not two. `null` means we do not yet know whether
         anything runs these — confirming a schedule then is a guess dressed
         as a fact. */
      toast(
        "success",
        backgroundActive === true
          ? "standing order created — its first run is scheduled."
          : backgroundActive === false
            ? "standing order saved — but nothing runs it yet. use “run now”, or set up background execution."
            : "standing order saved — we couldn't confirm whether it will run on a schedule. use “run now” until it does."
      );
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

  if (automations === null) {
    return <SkeletonRows rows={3} />;
  }

  const inputCls = field("md");

  return (
    <div className="flex flex-col gap-5">
      {/* The whole page assumes something runs these while you are away. When
          that is not true, it is the first thing a person needs to know —
          before they write an order and trust it to fire. */}
      {backgroundActive === false && (
        <p role="status" className="t-body border-l-2 border-signal pl-3.5">
          Nothing here fires on a schedule yet — background running isn&apos;t switched on
          for this workspace, whatever cadence you pick. You can still run any of them
          yourself, and they start running on their own once an administrator enables it.
        </p>
      )}
      <div className="flex items-center justify-between gap-4">
        <p className="t-caption">
          Every run goes through the same approval loop. Nothing important crosses the
          boundary without you.
        </p>
        <button onClick={() => setAddOpen((v) => !v)} className={btn("secondary", "sm", "shrink-0")}>
          <Plus size={13} strokeWidth={1.9} /> {addOpen ? "Cancel" : "New"}
        </button>
      </div>

      {addOpen && (
        <div className={`${card()} flex animate-card-in flex-col gap-4 p-5`}>
          <label className="flex flex-col gap-1.5">
            <span className="t-eyebrow">Name</span>
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="morning inbox review" className={inputCls} />
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="t-eyebrow">What should it do?</span>
            <textarea
              value={command}
              onChange={(e) => setCommand(e.target.value)}
              rows={2}
              placeholder="review my unread email and prepare replies for the ones that need action"
              className={inputCls}
            />
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="t-eyebrow">How often</span>
            <select value={hours} onChange={(e) => setHours(Number(e.target.value))} className={inputCls}>
              {CADENCES.map((c) => (
                <option key={c.hours} value={c.hours}>{c.label}</option>
              ))}
            </select>
          </label>
          <fieldset className="flex flex-col gap-1">
            <legend className="t-eyebrow">What may it do?</legend>
            <div className="mt-1 flex flex-col gap-1.5">
              {MODES.map((m) => (
                <label
                  key={m.value}
                  className={`flex cursor-pointer items-start gap-2.5 rounded-btn px-3 py-2.5 transition-colors duration-fast ${
                    mode === m.value ? "bg-ink/[0.06]" : "hover:bg-ink/[0.03]"
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
                    <span className="text-[0.875rem]">{m.label}</span>
                    <span className="t-caption block">{m.detail}</span>
                  </span>
                </label>
              ))}
            </div>
          </fieldset>
          <button
            onClick={create}
            disabled={busy === "create" || !name.trim() || !command.trim()}
            className={btn("primary", "md", "self-start")}
          >
            {busy === "create" ? "Creating…" : "Create"}
          </button>
        </div>
      )}

      {automations.length === 0 && !addOpen && (
        <EmptyState
          title="Nothing standing yet"
          description={
            backgroundActive === true
              ? "Turn repeated work into a recurring mission — a morning inbox review, a weekly report. Anything consequential still waits for your signature."
              : backgroundActive === false
                ? "Turn repeated work into a recurring mission. Scheduled running isn't switched on here yet, so these run when you press run."
                : "Turn repeated work into a recurring mission. Use run to be sure it happens."
          }
        />
      )}

      {automations.map((a) => (
        <div key={a.id} className={`${card()} p-5`}>
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="min-w-0 flex-1 truncate text-sm font-semibold" title={a.name}>
              {a.name}
            </h2>
            <span
              className="rounded-pill bg-cream-deep px-2.5 py-0.5 text-[0.6875rem] font-semibold tracking-wide text-ink-soft"
              title={MODES.find((m) => m.value === a.mode)?.detail}
            >
              {MODE_LABEL[a.mode] ?? "prepare"}
            </span>
            <span
              className={`rounded-pill px-2.5 py-0.5 text-[0.6875rem] font-semibold tracking-wide ${
                a.enabled ? "bg-signal text-cream" : "ring-1 ring-inset ring-ink/40 text-ink-soft"
              }`}
            >
              {a.enabled ? "active" : "paused"}
            </span>
          </div>
          <p className="mt-1.5 line-clamp-2 font-mono text-[0.75rem] text-ink-soft">“{a.command}”</p>
          <p className="mt-1 text-[0.75rem] font-semibold text-ink-soft">
            {cadenceLabel(a.interval_hours)} ·{" "}
            {a.last_run_at ? `last ran ${new Date(a.last_run_at).toLocaleString()}` : "hasn't run yet"} ·{" "}
            {a.enabled ? `next ${new Date(a.next_run_at).toLocaleString()}` : "paused"}
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <button onClick={() => runNow(a)} disabled={busy === a.id} className={btn("secondary", "sm")}>
              <Play size={12} strokeWidth={1.9} /> {busy === a.id ? "…" : "Run now"}
            </button>
            <button
              onClick={() => setEnabled(a, !a.enabled)}
              disabled={busy === a.id}
              className={btn("ghost", "sm")}
            >
              {a.enabled ? <Pause size={12} strokeWidth={1.9} /> : <Play size={12} strokeWidth={1.9} />}
              {a.enabled ? "Pause" : "Resume"}
            </button>
            <button onClick={() => toggleRuns(a.id)} className={btn("ghost", "sm")}>
              {runs[a.id] ? "Hide history" : "History"}
            </button>
            <button
              onClick={() => remove(a)}
              disabled={busy === a.id}
              className={btn("ghost", "sm", "ml-auto")}
              title="delete — stops all future runs"
            >
              <Trash2 size={12} strokeWidth={1.9} /> Delete
            </button>
          </div>
          {runs[a.id] && (
            <div className="mt-3 flex flex-col gap-1.5 border-t border-line/50 pt-3">
              {runs[a.id].length === 0 && <p className="t-caption">No runs yet.</p>}
              {runs[a.id].map((r) => (
                <p key={r.id} className="t-caption flex items-baseline gap-2">
                  <span className={`shrink-0 ${r.status === "ok" ? "text-positive" : "text-danger"}`}>
                    {r.status}
                  </span>
                  <span>
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
