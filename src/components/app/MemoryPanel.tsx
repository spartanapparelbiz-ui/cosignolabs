"use client";

import { useCallback, useEffect, useState } from "react";
import { Brain, Plus, Trash2 } from "lucide-react";
import type { MemoryRecord } from "@/lib/types";
import { useToast } from "@/components/Toast";

/**
 * Memory — user-controlled planner context. Everything the directive demands:
 * view, add, edit, per-memory enable, delete, and a master switch that stops
 * memory reaching the planner entirely. The agent never writes here; only you
 * do. Full loading / error / empty states.
 */

async function jsonFetch(url: string, init?: RequestInit) {
  const res = await fetch(url, {
    ...init,
    headers: { "Content-Type": "application/json", ...init?.headers },
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.message || body.error || "something went wrong.");
  return body;
}

export function MemoryPanel() {
  const [memories, setMemories] = useState<MemoryRecord[] | null>(null);
  const [masterOn, setMasterOn] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [editing, setEditing] = useState<string | null>(null);
  const [editText, setEditText] = useState("");
  const toast = useToast();

  const load = useCallback(async () => {
    setError(null);
    try {
      const data = await jsonFetch("/api/memory");
      setMemories(data.memories ?? []);
      setMasterOn(Boolean(data.memory_enabled));
    } catch (e) {
      setError(e instanceof Error ? e.message : "couldn't load your memory.");
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function add() {
    if (!draft.trim()) return;
    setBusy("add");
    try {
      await jsonFetch("/api/memory", { method: "POST", body: JSON.stringify({ content: draft.trim() }) });
      setDraft("");
      toast("success", "saved — the operator will use this context.");
      await load();
    } catch (e) {
      toast("error", e instanceof Error ? e.message : "couldn't save that.");
    } finally {
      setBusy(null);
    }
  }

  async function toggleMaster() {
    setBusy("master");
    try {
      await jsonFetch("/api/memory", {
        method: "PATCH",
        body: JSON.stringify({ memory_enabled: !masterOn }),
      });
      setMasterOn(!masterOn);
      toast("success", !masterOn ? "memory on." : "memory off — cosigno stops using your notes.");
    } finally {
      setBusy(null);
    }
  }

  async function patch(m: MemoryRecord, body: Record<string, unknown>) {
    setBusy(m.id);
    try {
      await jsonFetch(`/api/memory/${m.id}`, { method: "PATCH", body: JSON.stringify(body) });
      await load();
    } finally {
      setBusy(null);
      setEditing(null);
    }
  }

  async function remove(m: MemoryRecord) {
    setBusy(m.id);
    try {
      await jsonFetch(`/api/memory/${m.id}`, { method: "DELETE" });
      toast("success", "forgotten.");
      await load();
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

  if (memories === null) {
    return (
      <div className="flex flex-col gap-3" aria-busy="true" aria-label="loading memory">
        {[0, 1].map((i) => (
          <div key={i} className="h-14 animate-pulse rounded-card bg-cream-deep" />
        ))}
      </div>
    );
  }

  const inputCls =
    "w-full rounded-btn bg-surface px-3 py-2.5 text-sm shadow-soft focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-signal";

  return (
    <div className="flex flex-col gap-4">
      {/* master switch */}
      <div className="flex items-center gap-3 rounded-card bg-surface/60 p-4 shadow-soft">
        <Brain size={18} className="shrink-0 text-ink-soft" />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-extrabold lowercase">memory is {masterOn ? "on" : "off"}</p>
          <p className="text-xs text-ink-soft">
            {masterOn
              ? "enabled notes below are given to cosigno as your saved context."
              : "cosigno isn\u2019t using your notes — they\u2019re kept, but unused."}
          </p>
        </div>
        <button
          onClick={toggleMaster}
          disabled={busy === "master"}
          role="switch"
          aria-checked={masterOn}
          className={`inline-flex h-6 w-11 shrink-0 items-center rounded-pill p-0.5 transition-colors duration-base ${
            masterOn ? "bg-signal" : "bg-line"
          }`}
        >
          <span
            className={`h-5 w-5 rounded-pill bg-surface shadow-soft transition-transform duration-base ${
              masterOn ? "translate-x-5" : "translate-x-0"
            }`}
          />
        </button>
      </div>

      {/* add */}
      <div className="flex gap-2">
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && add()}
          maxLength={300}
          placeholder="remember that… (e.g. keep my replies under 100 words)"
          className={inputCls}
          aria-label="new memory"
        />
        <button
          onClick={add}
          disabled={busy === "add" || !draft.trim()}
          className="inline-flex shrink-0 items-center gap-1 rounded-btn bg-ink px-3.5 py-2 text-xs font-bold text-cream disabled:bg-cream-deep disabled:text-ink-soft disabled:shadow-none disabled:cursor-not-allowed"
        >
          <Plus size={13} /> save
        </button>
      </div>

      {memories.length === 0 && (
        <div className="flex flex-col items-center gap-2 rounded-card bg-surface/40 px-6 py-10 text-center shadow-soft">
          <p className="text-sm font-extrabold lowercase">nothing saved yet.</p>
          <p className="max-w-sm text-xs text-ink-soft">
            save short notes about how you like things done — tone, priorities,
            constraints. only you can write here; the operator only reads.
          </p>
        </div>
      )}

      {memories.map((m) => (
        <div key={m.id} className={`rounded-card bg-surface/60 p-4 shadow-soft ${m.enabled ? "" : "opacity-60"}`}>
          {editing === m.id ? (
            <div className="flex flex-col gap-2">
              <textarea
                value={editText}
                onChange={(e) => setEditText(e.target.value)}
                maxLength={300}
                rows={2}
                className={inputCls}
                aria-label="edit memory"
              />
              <div className="flex gap-2">
                <button
                  onClick={() => patch(m, { content: editText.trim() })}
                  disabled={!editText.trim() || busy === m.id}
                  className="rounded-btn bg-signal px-4 py-1.5 text-xs font-extrabold text-on-signal disabled:bg-cream-deep disabled:text-ink-soft disabled:shadow-none disabled:cursor-not-allowed"
                >
                  save
                </button>
                <button onClick={() => setEditing(null)} className="rounded-btn px-4 py-1.5 text-xs font-bold lowercase ring-1 ring-inset ring-ink hover:bg-cream-deep">
                  cancel
                </button>
              </div>
            </div>
          ) : (
            <>
              <p className="text-sm font-semibold leading-snug">{m.content}</p>
              <div className="mt-2.5 flex flex-wrap items-center gap-2">
                <button
                  onClick={() => patch(m, { enabled: !m.enabled })}
                  disabled={busy === m.id}
                  className="min-h-[32px] rounded-pill px-3 py-1 text-[11px] font-bold lowercase ring-1 ring-inset ring-ink/30 hover:bg-cream-deep"
                >
                  {m.enabled ? "in use — click to exclude" : "excluded — click to include"}
                </button>
                <button
                  onClick={() => {
                    setEditing(m.id);
                    setEditText(m.content);
                  }}
                  className="min-h-[32px] rounded-pill px-3 py-1 text-[11px] font-bold lowercase text-ink-soft hover:bg-cream-deep"
                >
                  edit
                </button>
                <button
                  onClick={() => remove(m)}
                  disabled={busy === m.id}
                  className="ml-auto inline-flex min-h-[32px] items-center gap-1 rounded-pill px-3 py-1 text-[11px] font-bold lowercase text-ink-soft hover:bg-cream-deep"
                >
                  <Trash2 size={11} /> forget
                </button>
              </div>
            </>
          )}
        </div>
      ))}
    </div>
  );
}
