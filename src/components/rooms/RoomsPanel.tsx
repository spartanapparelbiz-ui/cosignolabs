"use client";

import { useCallback, useEffect, useState } from "react";
import { Check, Users, X, MessageSquare } from "lucide-react";

/**
 * CoSign Rooms — the co-signer inbox. Shows rooms where YOU still owe a
 * decision (approve / reject / request changes) and rooms you own. Every
 * decision is server-bound to the exact plan hash; a material change to the
 * plan resets everyone's approval. Rooms never execute — they only unlock the
 * owner's normal approval once satisfied.
 */

interface Room {
  id: string;
  name: string;
  status: string;
  require_all: boolean;
  ordered: boolean;
  expires_at: string;
  plan_hash: string;
}

interface AwaitingRoom {
  room: Room;
  summary: string;
}

interface ProposedCard {
  id: string;
  summary: string;
}

function fmt(iso: string): string {
  return new Date(iso).toLocaleString([], { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

export function RoomsPanel() {
  const [awaiting, setAwaiting] = useState<AwaitingRoom[]>([]);
  const [owned, setOwned] = useState<Room[]>([]);
  const [proposable, setProposable] = useState<ProposedCard[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [pickCard, setPickCard] = useState("");
  const [emails, setEmails] = useState("");

  const load = useCallback(async () => {
    try {
      const [roomsRes, actionsRes] = await Promise.all([
        fetch("/api/rooms").then((r) => r.json()),
        fetch("/api/actions?status=proposed&limit=50").then((r) => r.json()).catch(() => ({ actions: [] })),
      ]);
      setAwaiting(roomsRes.awaiting ?? []);
      setOwned(roomsRes.owned ?? []);
      // Cards not already wrapped in a room can have one opened.
      const roomedActionIds = new Set<string>();
      setProposable(
        (actionsRes.actions ?? [])
          .filter((a: { id: string; injection_flag?: boolean }) => !a.injection_flag && !roomedActionIds.has(a.id))
          .map((a: { id: string; summary: string }) => ({ id: a.id, summary: a.summary }))
      );
    } finally {
      setLoaded(true);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function createRoom() {
    const approvers = emails
      .split(/[,\n]/)
      .map((e) => e.trim())
      .filter(Boolean);
    if (!pickCard || approvers.length === 0) {
      setNote("Pick a card and add at least one co-signer's email.");
      return;
    }
    setBusy("create");
    setNote(null);
    try {
      const res = await fetch("/api/rooms", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ actionId: pickCard, approvers, requireAll: true }),
      });
      const json = await res.json();
      if (!res.ok) {
        setNote(json.message || "couldn't open that room.");
      } else {
        setNote("Room opened — co-signers can now decide. The card stays locked until they do.");
        setCreating(false);
        setPickCard("");
        setEmails("");
        await load();
      }
    } finally {
      setBusy(null);
    }
  }

  async function decide(roomId: string, decision: "approve" | "reject" | "request_changes") {
    setBusy(roomId);
    setNote(null);
    try {
      const res = await fetch(`/api/rooms/${roomId}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ decision }),
      });
      const json = await res.json();
      if (!res.ok) setNote(json.message || "couldn't record that decision.");
      else if (json.satisfied) setNote("Room satisfied — the owner can now approve the plan.");
      await load();
    } finally {
      setBusy(null);
    }
  }

  // Only render when there's something to show or something to open.
  if (!loaded || (awaiting.length === 0 && owned.length === 0 && proposable.length === 0)) return null;

  return (
    <div className="mb-6 rounded-card border border-line bg-surface p-5 shadow-well">
      <div className="flex items-center gap-2">
        <Users size={18} className="text-ink" aria-hidden />
        <h2 className="font-display text-lg font-bold lowercase">co-sign rooms</h2>
        {proposable.length > 0 && (
          <button
            onClick={() => setCreating((v) => !v)}
            className="ml-auto rounded-btn border border-ink px-3 py-1 text-xs font-bold text-ink transition-colors hover:bg-ink hover:text-cream"
          >
            {creating ? "Cancel" : "Require co-signers"}
          </button>
        )}
      </div>
      <p className="mt-0.5 text-sm font-semibold text-ink-soft">
        approvals that need more than one person. your decision binds to the exact plan shown —
        if it changes, everyone re-approves.
      </p>

      {note && <p className="mt-3 rounded-btn bg-cream-deep px-3 py-2 text-xs font-semibold text-ink">{note}</p>}

      {creating && (
        <div className="mt-4 rounded-btn border border-line bg-cream-deep/40 p-3.5">
          <label className="text-[11px] font-bold uppercase tracking-wider text-ink-soft">Card to co-sign</label>
          <select
            value={pickCard}
            onChange={(e) => setPickCard(e.target.value)}
            className="mt-1 w-full rounded-btn border border-line bg-surface px-3 py-2 text-sm font-medium text-ink"
          >
            <option value="">Choose a prepared card…</option>
            {proposable.map((c) => (
              <option key={c.id} value={c.id}>
                {c.summary.slice(0, 70)}
              </option>
            ))}
          </select>
          <label className="mt-3 block text-[11px] font-bold uppercase tracking-wider text-ink-soft">
            Co-signer emails (workspace members, comma-separated)
          </label>
          <textarea
            value={emails}
            onChange={(e) => setEmails(e.target.value)}
            rows={2}
            placeholder="partner@home.com"
            className="mt-1 w-full rounded-btn border border-line bg-surface px-3 py-2 text-sm font-medium text-ink"
          />
          <button
            onClick={createRoom}
            disabled={busy === "create"}
            className="mt-2.5 rounded-btn bg-ink px-3.5 py-1.5 text-xs font-bold text-cream hover:opacity-90 disabled:opacity-50"
          >
            {busy === "create" ? "opening…" : "Open room"}
          </button>
        </div>
      )}

      {awaiting.length > 0 && (
        <div className="mt-4">
          <p className="text-[11px] font-bold uppercase tracking-wider text-ink-soft">Waiting on your decision</p>
          <ul className="mt-2 flex flex-col gap-2">
            {awaiting.map(({ room, summary }) => (
              <li key={room.id} className="rounded-btn border border-line px-3.5 py-3">
                <p className="font-bold text-ink">{room.name}</p>
                <p className="text-sm font-medium text-ink-soft">{summary}</p>
                <p className="mt-0.5 text-[11px] text-ink-soft">
                  {room.require_all ? "Everyone must approve" : "Any one approver"}
                  {room.ordered ? " · in order" : ""} · expires {fmt(room.expires_at)}
                </p>
                <div className="mt-2.5 flex flex-wrap gap-2">
                  <button
                    onClick={() => decide(room.id, "approve")}
                    disabled={busy === room.id}
                    className="inline-flex items-center gap-1 rounded-btn bg-ink px-3 py-1.5 text-xs font-bold text-cream hover:opacity-90 disabled:opacity-50"
                  >
                    <Check size={13} aria-hidden /> Approve
                  </button>
                  <button
                    onClick={() => decide(room.id, "request_changes")}
                    disabled={busy === room.id}
                    className="inline-flex items-center gap-1 rounded-btn border border-ink px-3 py-1.5 text-xs font-bold text-ink hover:bg-ink hover:text-cream disabled:opacity-50"
                  >
                    <MessageSquare size={13} aria-hidden /> Request changes
                  </button>
                  <button
                    onClick={() => decide(room.id, "reject")}
                    disabled={busy === room.id}
                    className="inline-flex items-center gap-1 rounded-btn border border-danger px-3 py-1.5 text-xs font-bold text-danger hover:bg-danger hover:text-cream disabled:opacity-50"
                  >
                    <X size={13} aria-hidden /> Reject
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}

      {owned.length > 0 && (
        <div className="mt-4">
          <p className="text-[11px] font-bold uppercase tracking-wider text-ink-soft">Rooms you opened</p>
          <ul className="mt-2 flex flex-col gap-1.5">
            {owned.map((room) => (
              <li key={room.id} className="flex items-center gap-2 rounded-btn border border-line px-3 py-2 text-sm">
                <span className="font-semibold text-ink">{room.name}</span>
                <span
                  className={`rounded-pill px-2 py-0.5 text-[10px] font-bold uppercase ${
                    room.status === "satisfied"
                      ? "bg-verified/12 text-verified"
                      : room.status === "revoked" || room.status === "expired"
                        ? "bg-danger/12 text-danger"
                        : "bg-cream-deep text-ink-soft"
                  }`}
                >
                  {room.status.replace("_", " ")}
                </span>
                <span className="ml-auto text-xs text-ink-soft">expires {fmt(room.expires_at)}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
