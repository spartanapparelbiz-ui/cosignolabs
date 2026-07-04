"use client";

import { useCallback, useEffect, useState } from "react";
import type { ActionRecord } from "@/lib/types";
import { CATEGORY_LIST } from "@/lib/types";
import { TierBadge } from "./TierBadge";

const STATUSES = ["proposed", "approved", "executing", "executed", "vetoed", "failed"];

export function ActivityLog() {
  const [status, setStatus] = useState("");
  const [tier, setTier] = useState("");
  const [category, setCategory] = useState("");
  const [actions, setActions] = useState<ActionRecord[] | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);

  const query = useCallback(() => {
    const params = new URLSearchParams();
    if (status) params.set("status", status);
    if (tier) params.set("tier", tier);
    if (category) params.set("category", category);
    return params;
  }, [status, tier, category]);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/activity?${query()}`)
      .then((r) => r.json())
      .then((d) => !cancelled && setActions(d.actions ?? []))
      .catch(() => !cancelled && setActions([]));
    return () => {
      cancelled = true;
    };
  }, [query]);

  const selectClass =
    "rounded-pill border border-ink bg-white/60 px-3 py-1.5 text-sm font-semibold";

  return (
    <div className="mt-5">
      <div className="flex flex-wrap items-center gap-2">
        <select
          value={status}
          onChange={(e) => setStatus(e.target.value)}
          className={selectClass}
          aria-label="Filter by status"
        >
          <option value="">All statuses</option>
          {STATUSES.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
        <select
          value={tier}
          onChange={(e) => setTier(e.target.value)}
          className={selectClass}
          aria-label="Filter by tier"
        >
          <option value="">All tiers</option>
          <option value="1">Tier 1 · Auto</option>
          <option value="2">Tier 2 · Approve</option>
          <option value="3">Tier 3 · Locked</option>
        </select>
        <select
          value={category}
          onChange={(e) => setCategory(e.target.value)}
          className={selectClass}
          aria-label="Filter by category"
        >
          <option value="">All categories</option>
          {CATEGORY_LIST.map((c) => (
            <option key={c.category} value={c.category}>
              {c.label}
            </option>
          ))}
        </select>
        <a
          href={`/api/activity?${query()}&format=csv`}
          className="ml-auto rounded-pill border border-ink px-4 py-1.5 text-sm font-bold hover:bg-cream-deep"
        >
          Export CSV
        </a>
      </div>

      {actions === null ? (
        <p className="mt-8 text-sm text-ink-soft">Loading…</p>
      ) : actions.length === 0 ? (
        <div className="mt-8 rounded-card border border-dashed border-line p-8 text-center">
          <p className="text-sm font-semibold text-ink-soft">
            No actions match. Once the operator starts working, every
            proposal, approval, veto, and execution shows up here.
          </p>
        </div>
      ) : (
        <div className="mt-4 overflow-x-auto rounded-card border border-line">
          <table className="w-full min-w-[720px] text-left text-sm">
            <thead className="border-b border-line bg-cream-deep text-[11px] uppercase tracking-wide text-ink-soft">
              <tr>
                <th className="px-4 py-2.5">When</th>
                <th className="px-4 py-2.5">Action</th>
                <th className="px-4 py-2.5">Tier</th>
                <th className="px-4 py-2.5">Status</th>
                <th className="px-4 py-2.5">Payload</th>
              </tr>
            </thead>
            <tbody>
              {actions.map((a) => (
                <tr key={a.id} className="border-b border-line/60 align-top last:border-0">
                  <td className="whitespace-nowrap px-4 py-3 text-xs text-ink-soft">
                    {new Date(a.created_at).toLocaleString([], {
                      month: "short",
                      day: "numeric",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </td>
                  <td className="px-4 py-3">
                    <p className="font-semibold">{a.summary}</p>
                    {a.injection_flag && (
                      <p className="mt-1 text-[11px] font-bold text-ink-soft">
                        ⚠ external content attempted to direct the agent
                      </p>
                    )}
                    {a.veto_reason && (
                      <p className="mt-1 text-[11px] text-ink-soft">
                        veto: {a.veto_reason}
                      </p>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <TierBadge tier={a.tier} />
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`rounded-pill px-2.5 py-0.5 text-[11px] font-bold uppercase ${
                        a.status === "executed"
                          ? "bg-accent text-cream"
                          : a.status === "vetoed" || a.status === "failed"
                            ? "border border-ink"
                            : "bg-cream-deep text-ink-soft"
                      }`}
                    >
                      {a.status}
                    </span>
                  </td>
                  <td className="max-w-[220px] px-4 py-3">
                    <button
                      onClick={() => setExpanded(expanded === a.id ? null : a.id)}
                      className="text-xs font-bold text-ink-soft underline underline-offset-2"
                    >
                      {expanded === a.id ? "hide" : "view"}
                    </button>
                    {expanded === a.id && (
                      <pre className="mt-2 max-h-40 overflow-auto rounded-lg bg-ink p-2.5 text-[10px] leading-relaxed text-cream">
                        {JSON.stringify(
                          { payload: a.payload, result: a.result },
                          null,
                          2
                        )}
                      </pre>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
