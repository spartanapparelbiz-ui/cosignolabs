"use client";

import { useCallback, useEffect, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import type { MemoryRecord } from "@/lib/types";
import { useToast } from "@/components/Toast";
import { badge, btn, card, dot, field } from "@/components/ui/styles";
import { EmptyState } from "@/components/ui/Page";

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
  if (!res.ok) throw new Error(body.message || body.error || "Something went wrong.");
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
      setError(e instanceof Error ? e.message : "Couldn't load your memory.");
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
      toast("success", "Saved — the operator will use this context.");
      await load();
    } catch (e) {
      toast("error", e instanceof Error ? e.message : "Couldn't save that.");
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
      toast("success", !masterOn ? "memory on." : "Memory off — cosigno stops using your notes.");
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
      toast("success", "Forgotten.");
      await load();
    } finally {
      setBusy(null);
    }
  }

  if (error) {
    return (
      <div className="px-6 py-16 text-center">
        <p className="t-body">{error}</p>
        <button onClick={load} className="mt-3 rounded-btn px-4 py-2 text-sm font-semibold ring-1 ring-inset ring-ink hover:bg-cream-deep">
          Try again
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

  const inputCls = field("md");

  return (
    <div className="flex flex-col gap-4">
      {/* master switch */}
      <div className="flex items-center gap-3 border-b border-line/40 pb-6">
        <div className="min-w-0 flex-1">
          <p className="text-[1rem] font-semibold">Memory is {masterOn ? "on" : "off"}</p>
          <p className="t-caption mt-0.5">
            {masterOn
              ? "Enabled notes below go to cosigno as your saved context."
              : "Cosigno isn\u2019t using your notes. They\u2019re kept, but unused."}
          </p>
        </div>
        <button
          onClick={toggleMaster}
          disabled={busy === "master"}
          role="switch"
          aria-checked={masterOn}
          aria-label={masterOn ? "turn memory off" : "turn memory on"}
          className={`inline-flex h-6 w-11 shrink-0 items-center rounded-pill p-0.5 transition-colors duration-base ${
            masterOn ? "bg-ink" : "bg-ink/15"
          }`}
        >
          <span
            className={`h-5 w-5 rounded-pill bg-surface shadow-rest transition-transform duration-base ${
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
          placeholder="Remember that… (e.g. keep my replies under 100 words)"
          className={inputCls}
          aria-label="new memory"
        />
        <button
          onClick={add}
          disabled={busy === "add" || !draft.trim()}
          className={btn("secondary", "md", "shrink-0")}
        >
          <Plus size={13} strokeWidth={1.9} /> Save
        </button>
      </div>

      {memories.length === 0 && (
        <EmptyState
          title="Nothing saved yet"
          description="Short notes about how you like things done — tone, priorities, constraints. Only you write here; cosigno only reads."
        />
      )}

      {memories.map((m) => (
        <div key={m.id} className={`${card()} p-5 ${m.enabled ? "" : "opacity-55"}`}>
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
                  className={btn("secondary", "sm")}
                >
                  save
                </button>
                <button onClick={() => setEditing(null)} className="rounded-btn px-4 py-1.5 text-xs font-semibold ring-1 ring-inset ring-ink hover:bg-cream-deep">
                  Cancel
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
                  className="min-h-[32px] rounded-pill px-3 py-1 text-[0.75rem] font-semibold ring-1 ring-inset ring-ink/30 hover:bg-cream-deep"
                >
                  {m.enabled ? "in use — click to exclude" : "excluded — click to include"}
                </button>
                <button
                  onClick={() => {
                    setEditing(m.id);
                    setEditText(m.content);
                  }}
                  className="min-h-[32px] rounded-pill px-3 py-1 text-[0.75rem] font-semibold text-ink-soft hover:bg-cream-deep"
                >
                  edit
                </button>
                <button
                  onClick={() => remove(m)}
                  disabled={busy === m.id}
                  className="ml-auto inline-flex min-h-[32px] items-center gap-1 rounded-pill px-3 py-1 text-[0.75rem] font-semibold text-ink-soft hover:bg-cream-deep"
                >
                  <Trash2 size={11} /> Forget
                </button>
              </div>
            </>
          )}
        </div>
      ))}
    </div>
  );
}
