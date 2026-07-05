"use client";

import { useCallback, useEffect, useState } from "react";
import { ShieldAlert } from "lucide-react";
import type { ActionRecord } from "@/lib/types";
import { CATEGORY_LIST } from "@/lib/types";
import { SkeletonRows } from "./Skeleton";
import { TierBadge } from "./TierBadge";
import { EmptyIllustration } from "./EmptyIllustration";

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
    "rounded-btn bg-cream-deep px-3 py-1.5 text-sm font-semibold lowercase";

  return (
    <div className="mt-5">
      <div className="flex flex-wrap items-center gap-2">
        <select
          value={status}
          onChange={(e) => setStatus(e.target.value)}
          className={selectClass}
          aria-label="filter by status"
        >
          <option value="">all statuses</option>
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
          aria-label="filter by tier"
        >
          <option value="">all tiers</option>
          <option value="1">tier 1 · auto</option>
          <option value="2">tier 2 · approve</option>
          <option value="3">tier 3 · locked</option>
        </select>
        <select
          value={category}
          onChange={(e) => setCategory(e.target.value)}
          className={selectClass}
          aria-label="filter by category"
        >
          <option value="">all categories</option>
          {CATEGORY_LIST.map((c) => (
            <option key={c.category} value={c.category}>
              {c.label.toLowerCase()}
            </option>
          ))}
        </select>
        <a
          href={`/api/activity?${query()}&format=csv`}
          className="ml-auto rounded-btn bg-ink px-4 py-1.5 text-sm font-bold lowercase text-cream transition-transform active:scale-95"
        >
          export csv
        </a>
      </div>

      {/* keyed by the active filter so the list fades through on change */}
      <div key={query().toString()} className="animate-fade-through">
      {actions === null ? (
        <div className="mt-6">
          <SkeletonRows rows={5} />
        </div>
      ) : actions.length === 0 ? (
        <div className="mt-8 flex flex-col items-center rounded-card bg-white/40 p-8 text-center shadow-soft">
          <EmptyIllustration kind="activity" className="mb-3" />
          <p className="max-w-md text-sm font-semibold text-ink-soft">
            nothing here yet. once the operator starts working, every proposal,
            approval, veto, and execution lands in this ledger — permanently.
          </p>
        </div>
      ) : (
        <div className="mt-4 overflow-x-auto rounded-card bg-white/60 shadow-soft">
          <table className="w-full min-w-[720px] text-left text-sm">
            <thead className="bg-cream-deep text-[11px] lowercase tracking-wide text-ink-soft">
              <tr>
                <th className="px-4 py-2.5 font-bold">when</th>
                <th className="px-4 py-2.5 font-bold">action</th>
                <th className="px-4 py-2.5 font-bold">tier</th>
                <th className="px-4 py-2.5 font-bold">status</th>
                <th className="px-4 py-2.5 font-bold">payload</th>
              </tr>
            </thead>
            <tbody>
              {actions.map((a) => (
                <tr key={a.id} className="border-b border-line/50 align-top last:border-0">
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
                      <p className="mt-1 flex items-center gap-1 text-[11px] font-bold lowercase text-ink-soft">
                        <ShieldAlert size={11} strokeWidth={2.5} aria-hidden="true" />
                        external content attempted to direct the agent — held
                        for your review
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
                      className={`rounded-pill px-2.5 py-0.5 text-[11px] font-bold lowercase ${
                        a.status === "executed"
                          ? "bg-signal text-cream"
                          : a.status === "vetoed" || a.status === "failed"
                            ? "ring-1 ring-inset ring-ink/40"
                            : "bg-cream-deep text-ink-soft"
                      }`}
                    >
                      {a.status}
                    </span>
                  </td>
                  <td className="max-w-[220px] px-4 py-3">
                    <button
                      onClick={() => setExpanded(expanded === a.id ? null : a.id)}
                      className="text-xs font-bold lowercase text-ink-soft underline underline-offset-2"
                      aria-expanded={expanded === a.id}
                    >
                      {expanded === a.id ? "hide" : "view"}
                    </button>
                    {expanded === a.id && (
                      <pre className="mt-2 max-h-40 overflow-auto rounded-btn bg-cream-deep p-2.5 font-mono text-[10px] leading-relaxed text-ink">
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
    </div>
  );
}
