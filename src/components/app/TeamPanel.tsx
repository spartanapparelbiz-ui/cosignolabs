"use client";

import { useCallback, useEffect, useState } from "react";
import { Check, Plus, ShieldCheck, Users, X } from "lucide-react";
import { useToast } from "@/components/Toast";

/**
 * Team — workspace membership + delegated decisions. Small, honest sharing:
 * invite by email, roles gate who may approve workspace-mates' tier-2
 * proposals, destructive (tier-3) approvals never leave their owner.
 */

interface MemberView {
  id: string;
  email: string;
  role: "owner" | "approver" | "member";
  status: "invited" | "active";
  is_me: boolean;
}

interface WorkspaceView {
  workspace: { id: string; name: string } | null;
  members?: MemberView[];
  my_role?: "owner" | "approver" | "member";
}

interface DecisionView {
  action: {
    id: string;
    category: string;
    tier: number;
    summary: string;
    injection_flag: boolean;
    created_at: string;
  };
  owner_email: string;
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

export function TeamPanel() {
  const [data, setData] = useState<WorkspaceView | null>(null);
  const [decisions, setDecisions] = useState<DecisionView[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<"member" | "approver">("member");
  const toast = useToast();

  const load = useCallback(async () => {
    setError(null);
    try {
      const ws = await jsonFetch("/api/workspace");
      setData(ws);
      if (ws.workspace) {
        const d = await jsonFetch("/api/workspace/decisions");
        setDecisions(d.decisions ?? []);
      } else {
        setDecisions([]);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "couldn't load your workspace.");
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function call(key: string, fn: () => Promise<unknown>, okMsg?: string) {
    setBusy(key);
    try {
      await fn();
      if (okMsg) toast("success", okMsg);
      await load();
    } catch (e) {
      toast("error", e instanceof Error ? e.message : "that didn't work.");
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

  if (data === null) {
    return (
      <div className="flex flex-col gap-3" aria-busy="true" aria-label="loading team">
        {[0, 1].map((i) => (
          <div key={i} className="h-14 skeleton rounded-card" />
        ))}
      </div>
    );
  }

  const inputCls =
    "w-full rounded-btn bg-surface px-3 py-2.5 text-sm shadow-soft focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-signal";

  /* ---------- no workspace yet: create ---------- */
  if (!data.workspace) {
    return (
      <div className="flex flex-col gap-4">
        <div className="flex flex-col items-center gap-2 rounded-card bg-surface/40 px-6 py-10 text-center shadow-soft">
          <Users size={20} className="text-ink-soft" />
          <p className="text-sm font-extrabold lowercase">no workspace yet.</p>
          <p className="max-w-md text-xs text-ink-soft">
            a workspace shares decisions with people you trust — a partner, a
            teammate. approvers can sign off on each other&apos;s routine
            (tier-2) actions; destructive actions always stay with their owner.
            if someone invited you, it appears here automatically.
          </p>
        </div>
        <div className="flex gap-2">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && name.trim() && call("create", () => jsonFetch("/api/workspace", { method: "POST", body: JSON.stringify({ name: name.trim() }) }), "workspace created.")}
            maxLength={80}
            placeholder="workspace name (e.g. our household)"
            className={inputCls}
            aria-label="workspace name"
          />
          <button
            onClick={() => call("create", () => jsonFetch("/api/workspace", { method: "POST", body: JSON.stringify({ name: name.trim() }) }), "workspace created.")}
            disabled={busy === "create" || !name.trim()}
            className="inline-flex shrink-0 items-center gap-1 rounded-btn bg-ink px-3.5 py-2 text-xs font-bold text-cream disabled:bg-cream-deep disabled:text-ink-soft disabled:shadow-none disabled:cursor-not-allowed"
          >
            <Plus size={13} /> create
          </button>
        </div>
      </div>
    );
  }

  const isOwner = data.my_role === "owner";
  const canDecide = data.my_role === "owner" || data.my_role === "approver";

  return (
    <div className="flex flex-col gap-4">
      {/* members */}
      <div className="rounded-card bg-surface/60 p-4 shadow-soft">
        <div className="flex items-center gap-2">
          <Users size={16} className="text-ink-soft" />
          <p className="text-sm font-extrabold lowercase">{data.workspace.name}</p>
          <span className="ml-auto rounded-pill px-2.5 py-0.5 text-[11px] font-bold lowercase ring-1 ring-inset ring-ink/30">
            you are {data.my_role}
          </span>
        </div>
        <ul className="mt-3 flex flex-col gap-2">
          {(data.members ?? []).map((m) => (
            <li key={m.id} className="flex flex-wrap items-center gap-2 text-sm">
              <span className="font-semibold">{m.email}</span>
              {m.is_me && <span className="text-[11px] font-bold text-ink-soft">(you)</span>}
              <span className={`rounded-pill px-2 py-0.5 text-[10px] font-bold lowercase ${m.status === "invited" ? "bg-cream-deep text-ink-soft" : "bg-signal/20"}`}>
                {m.status === "invited" ? "invited" : m.role}
              </span>
              <span className="ml-auto flex gap-1.5">
                {isOwner && m.role !== "owner" && m.status === "active" && (
                  <button
                    onClick={() =>
                      call(m.id, () =>
                        jsonFetch(`/api/workspace/members/${m.id}`, {
                          method: "PATCH",
                          body: JSON.stringify({ role: m.role === "approver" ? "member" : "approver" }),
                        })
                      )
                    }
                    disabled={busy === m.id}
                    className="min-h-[28px] rounded-pill px-2.5 py-0.5 text-[11px] font-bold lowercase ring-1 ring-inset ring-ink/30 hover:bg-cream-deep"
                  >
                    make {m.role === "approver" ? "member" : "approver"}
                  </button>
                )}
                {((isOwner && m.role !== "owner") || (m.is_me && m.role !== "owner")) && (
                  <button
                    onClick={() => call(m.id, () => jsonFetch(`/api/workspace/members/${m.id}`, { method: "DELETE" }), m.is_me ? "you left the workspace." : "removed.")}
                    disabled={busy === m.id}
                    className="min-h-[28px] rounded-pill px-2.5 py-0.5 text-[11px] font-bold lowercase text-ink-soft hover:bg-cream-deep"
                  >
                    {m.is_me ? "leave" : "remove"}
                  </button>
                )}
              </span>
            </li>
          ))}
        </ul>

        {isOwner && (
          <div className="mt-3 flex flex-wrap gap-2">
            <input
              value={inviteEmail}
              onChange={(e) => setInviteEmail(e.target.value)}
              maxLength={200}
              type="email"
              placeholder="invite by email"
              className={`${inputCls} min-w-[180px] flex-1`}
              aria-label="invite email"
            />
            <button
              onClick={() => setInviteRole(inviteRole === "member" ? "approver" : "member")}
              className="min-h-[36px] rounded-pill px-3 text-[11px] font-bold lowercase ring-1 ring-inset ring-ink/30 hover:bg-cream-deep"
              aria-label="toggle invite role"
            >
              as {inviteRole}
            </button>
            <button
              onClick={() =>
                call("invite", async () => {
                  await jsonFetch("/api/workspace/members", {
                    method: "POST",
                    body: JSON.stringify({ email: inviteEmail.trim(), role: inviteRole }),
                  });
                  setInviteEmail("");
                }, "invited — it activates when they sign in with that email.")
              }
              disabled={busy === "invite" || !inviteEmail.includes("@")}
              className="inline-flex items-center gap-1 rounded-btn bg-ink px-3.5 py-2 text-xs font-bold text-cream disabled:bg-cream-deep disabled:text-ink-soft disabled:shadow-none disabled:cursor-not-allowed"
            >
              <Plus size={13} /> invite
            </button>
          </div>
        )}
      </div>

      {/* delegated decisions */}
      <div className="rounded-card bg-surface/60 p-4 shadow-soft">
        <div className="flex items-center gap-2">
          <ShieldCheck size={16} className="text-ink-soft" />
          <p className="text-sm font-extrabold lowercase">shared decisions</p>
        </div>
        <p className="mt-1 text-xs text-ink-soft">
          {canDecide
            ? "workspace-mates' pending tier-2 actions you can approve or veto. destructive actions never appear here — those stay with their owner."
            : "you're a member: your own decisions stay yours, and approvers can sign off on your routine actions. ask the owner for the approver role to decide here."}
        </p>
        {canDecide && decisions.length === 0 && (
          <p className="mt-3 text-sm font-semibold text-ink-soft">nothing waiting right now.</p>
        )}
        {canDecide &&
          decisions.map((d) => (
            <div key={d.action.id} className="mt-3 rounded-btn bg-surface p-3 shadow-soft">
              <p className="text-sm font-semibold leading-snug">{d.action.summary}</p>
              <p className="mt-0.5 text-[11px] text-ink-soft">
                {d.owner_email} · {d.action.category} · tier {d.action.tier}
                {d.action.injection_flag && " · ⚠ held: external content tried to steer this"}
              </p>
              <div className="mt-2 flex gap-2">
                <button
                  onClick={() =>
                    call(d.action.id, () =>
                      jsonFetch("/api/workspace/decisions", {
                        method: "POST",
                        body: JSON.stringify({ action_id: d.action.id, decision: "approve" }),
                      }), "approved and executed.")
                  }
                  disabled={busy === d.action.id || d.action.injection_flag}
                  className="inline-flex items-center gap-1 rounded-btn bg-signal px-3.5 py-1.5 text-xs font-extrabold text-ink disabled:bg-cream-deep disabled:text-ink-soft disabled:shadow-none disabled:cursor-not-allowed"
                >
                  <Check size={12} /> approve
                </button>
                <button
                  onClick={() =>
                    call(d.action.id, () =>
                      jsonFetch("/api/workspace/decisions", {
                        method: "POST",
                        body: JSON.stringify({ action_id: d.action.id, decision: "veto" }),
                      }), "vetoed.")
                  }
                  disabled={busy === d.action.id}
                  className="inline-flex items-center gap-1 rounded-btn px-3.5 py-1.5 text-xs font-bold lowercase ring-1 ring-inset ring-ink hover:bg-cream-deep"
                >
                  <X size={12} /> veto
                </button>
              </div>
            </div>
          ))}
      </div>

      {isOwner && (
        <button
          onClick={() => {
            if (window.confirm("dissolve this workspace? members lose shared decisions; nobody's own data is touched.")) {
              call("dissolve", () => jsonFetch("/api/workspace", { method: "DELETE" }), "workspace dissolved.");
            }
          }}
          disabled={busy === "dissolve"}
          className="self-start rounded-btn px-4 py-2 text-xs font-bold lowercase text-ink-soft ring-1 ring-inset ring-ink/30 hover:bg-cream-deep"
        >
          dissolve workspace
        </button>
      )}
    </div>
  );
}
