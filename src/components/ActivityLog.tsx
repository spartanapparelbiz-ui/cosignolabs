"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Search, ShieldAlert } from "lucide-react";
import type { ActionRecord } from "@/lib/types";
import { CATEGORY_LIST } from "@/lib/types";
import { SkeletonRows } from "./Skeleton";
import dynamic from "next/dynamic";

// Open-on-click overlay — loaded the first time a receipt is viewed, not in
// the activity route's initial chunk.
const ReceiptModal = dynamic(() =>
  import("./sign/ReceiptModal").then((m) => m.ReceiptModal)
);
import { TierBadge } from "./TierBadge";
import { operatorOf } from "@/lib/actionPresentation";
import { EmptyIllustration } from "./EmptyIllustration";
import { ResultCard } from "./app/ResultCard";
import { describeResult } from "@/lib/results/describe";

const STATUSES = ["proposed", "approved", "executing", "executed", "vetoed", "failed"];

export function ActivityLog() {
  // Adaptive UI entry: "what did you finish today?" arrives as
  // ?status=executed&range=today — the ledger becomes the answer.
  const searchParams = useSearchParams();
  const [status, setStatus] = useState(() => searchParams.get("status") ?? "");
  const [tier, setTier] = useState("");
  const [category, setCategory] = useState("");
  const [search, setSearch] = useState("");
  const [todayOnly, setTodayOnly] = useState(() => searchParams.get("range") === "today");
  const [actions, setActions] = useState<ActionRecord[] | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [receiptFor, setReceiptFor] = useState<string | null>(null);

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

  const visible = useMemo(() => {
    if (!actions) return null;
    const needle = search.trim().toLowerCase();
    const dayStart = new Date();
    dayStart.setHours(0, 0, 0, 0);
    return actions.filter((a) => {
      if (todayOnly && Date.parse(a.created_at) < dayStart.getTime()) return false;
      if (
        needle &&
        !`${a.summary} ${a.category} ${a.veto_reason ?? ""}`.toLowerCase().includes(needle)
      )
        return false;
      return true;
    });
  }, [actions, search, todayOnly]);

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
          <option value="">all levels</option>
          <option value="1">auto</option>
          <option value="2">approve</option>
          <option value="3">sign</option>
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
        <label className="flex min-w-[180px] flex-1 items-center gap-1.5 rounded-btn bg-cream-deep px-3 py-1.5 sm:max-w-xs">
          <Search size={13} className="shrink-0 text-ink-soft" aria-hidden="true" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="search the record…"
            className="min-w-0 flex-1 bg-transparent text-sm font-semibold outline-none placeholder:text-ink-soft/70"
            aria-label="search activity"
          />
        </label>
        <button
          onClick={() => setTodayOnly((v) => !v)}
          aria-pressed={todayOnly}
          className={`rounded-btn px-3 py-1.5 text-sm font-bold lowercase ${
            todayOnly ? "bg-ink text-cream" : "bg-cream-deep text-ink-soft hover:text-ink"
          }`}
        >
          today
        </button>
        <a
          href={`/api/activity?${query()}&format=csv`}
          className="ml-auto rounded-btn bg-ink px-4 py-1.5 text-sm font-bold lowercase text-cream transition-transform active:scale-95"
        >
          export csv
        </a>
      </div>

      {/* keyed by the active filter so the list fades through on change */}
      <div key={query().toString()} className="animate-fade-through">
      {visible === null ? (
        <div className="mt-6">
          <SkeletonRows rows={5} />
        </div>
      ) : visible.length === 0 ? (
        <div className="mt-8 flex flex-col items-center rounded-card bg-surface/40 p-8 text-center shadow-soft">
          <EmptyIllustration kind="activity" className="mb-3" />
          <p className="max-w-md text-sm font-semibold text-ink-soft">
            nothing here yet. once the operator starts working, every proposal,
            approval, veto, and execution lands in this ledger — permanently.
          </p>
        </div>
      ) : (
        <div className="mt-4 overflow-x-auto rounded-card bg-surface/60 shadow-soft">
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
              {visible.map((a) => (
                <tr
                  key={a.id}
                  onClick={() => setExpanded(expanded === a.id ? null : a.id)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      setExpanded(expanded === a.id ? null : a.id);
                    }
                  }}
                  tabIndex={0}
                  aria-expanded={expanded === a.id}
                  className="cursor-pointer border-b border-line/50 align-top transition-colors last:border-0 hover:bg-cream-deep/40 focus:outline-none focus-visible:bg-cream-deep/60"
                >
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
                    <p className="mt-0.5 text-[10px] font-bold lowercase tracking-wide text-ink-soft/80">
                      {operatorOf(a.category)} operator · {a.category}
                    </p>
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
                    <span className="text-xs font-bold lowercase text-ink-soft underline underline-offset-2">
                      {expanded === a.id ? "hide" : "view"}
                    </span>
                    {/* Opening a result used to dump raw JSON — the payload and
                        the provider response, unformatted. That answers none of
                        the questions a person actually has, and asks them to
                        parse a data structure to find out whether their thing
                        happened. The card answers those questions; the JSON is
                        still one click away for whoever genuinely wants it. */}
                    {expanded === a.id && (
                      <div className="mt-2" onClick={(e) => e.stopPropagation()}>
                        <ResultCard
                          result={describeResult(a)}
                          details={
                            <pre className="max-h-40 overflow-auto rounded-btn bg-cream-deep p-2.5 font-mono text-[10px] leading-relaxed text-ink">
                              {JSON.stringify({ payload: a.payload, result: a.result }, null, 2)}
                            </pre>
                          }
                        />
                      </div>
                    )}
                    {a.status === "executed" && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setReceiptFor(a.id);
                        }}
                        className="mt-1 block text-xs font-bold lowercase text-ink-soft underline underline-offset-2 hover:text-ink"
                      >
                        view receipt
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      </div>
      {receiptFor && <ReceiptModal actionId={receiptFor} onClose={() => setReceiptFor(null)} />}
    </div>
  );
}
