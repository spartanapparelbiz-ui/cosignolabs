"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Check, ChevronDown, Search, ShieldAlert, X } from "lucide-react";
import type { ActionRecord } from "@/lib/types";
import { CATEGORY_LIST } from "@/lib/types";
import { SkeletonRows } from "./Skeleton";
import dynamic from "next/dynamic";

// Open-on-click overlay — loaded the first time a receipt is viewed, not in
// the activity route's initial chunk.
const ReceiptModal = dynamic(() =>
  import("./sign/ReceiptModal").then((m) => m.ReceiptModal)
);
import { EmptyIllustration } from "./EmptyIllustration";

/**
 * Activity — "what has AI already done?"
 *
 * A chronological timeline, one line per action: a check when it ran, a cross
 * when it didn't, the plain sentence of what happened, and the time. Anything
 * more than that — the payload, the result, the signed receipt — waits behind
 * a click, because an audit trail nobody can skim is an audit trail nobody
 * reads.
 *
 * The filters stay: "what did we spend money on this week" is the question a
 * ledger exists to answer. The tier filter is gone — a person auditing their
 * own workspace thinks in outcomes, not in tiers.
 */

const STATUS_FILTERS: { value: string; label: string }[] = [
  { value: "", label: "everything" },
  { value: "executed", label: "done" },
  { value: "proposed", label: "waiting for you" },
  { value: "vetoed", label: "rejected" },
  { value: "failed", label: "failed" },
];

/** What happened, in words rather than a status enum. */
function outcomeOf(a: ActionRecord): { mark: "done" | "stopped" | "waiting" | "running"; line: string } {
  if (a.injection_flag && a.status === "proposed") {
    return { mark: "stopped", line: "held — outside content tried to direct it" };
  }
  switch (a.status) {
    case "executed":
      return { mark: "done", line: "done" };
    case "vetoed":
      return { mark: "stopped", line: a.veto_reason ? `you rejected this — ${a.veto_reason}` : "you rejected this — it never ran" };
    case "failed":
      return { mark: "stopped", line: "didn't complete — nothing was left half-done" };
    case "approved":
    case "executing":
      return { mark: "running", line: "running now" };
    default:
      return { mark: "waiting", line: "waiting for you" };
  }
}

function when(iso: string): string {
  const d = new Date(iso);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const time = d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  if (d.getTime() >= today.getTime()) return time;
  return `${d.toLocaleDateString([], { month: "short", day: "numeric" })} · ${time}`;
}

export function ActivityLog() {
  // Adaptive UI entry: "what did you finish today?" arrives as
  // ?status=executed&range=today — the ledger becomes the answer.
  const searchParams = useSearchParams();
  const [status, setStatus] = useState(() => searchParams.get("status") ?? "");
  const [category, setCategory] = useState("");
  const [search, setSearch] = useState("");
  const [todayOnly, setTodayOnly] = useState(() => searchParams.get("range") === "today");
  const [actions, setActions] = useState<ActionRecord[] | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [receiptFor, setReceiptFor] = useState<string | null>(null);

  const query = useCallback(() => {
    const params = new URLSearchParams();
    if (status) params.set("status", status);
    if (category) params.set("category", category);
    return params;
  }, [status, category]);

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

  return (
    <div className="mt-5">
      <div className="flex flex-wrap items-center gap-2">
        {STATUS_FILTERS.map((f) => (
          <button
            key={f.value}
            onClick={() => setStatus(f.value)}
            aria-pressed={status === f.value}
            className={`rounded-pill px-3 py-1.5 text-xs font-bold transition-colors duration-fast focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-signal ${
              status === f.value ? "bg-ink text-cream" : "bg-cream-deep text-ink-soft hover:text-ink"
            }`}
          >
            {f.label}
          </button>
        ))}
        <button
          onClick={() => setTodayOnly((v) => !v)}
          aria-pressed={todayOnly}
          className={`rounded-pill px-3 py-1.5 text-xs font-bold transition-colors duration-fast focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-signal ${
            todayOnly ? "bg-ink text-cream" : "bg-cream-deep text-ink-soft hover:text-ink"
          }`}
        >
          today
        </button>

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
        <select
          value={category}
          onChange={(e) => setCategory(e.target.value)}
          className="rounded-btn bg-cream-deep px-3 py-1.5 text-sm font-semibold lowercase"
          aria-label="filter by kind of action"
        >
          <option value="">every kind</option>
          {CATEGORY_LIST.map((c) => (
            <option key={c.category} value={c.category}>
              {c.label.toLowerCase()}
            </option>
          ))}
        </select>
        <a
          href={`/api/activity?${query()}&format=csv`}
          className="rounded-btn px-3 py-1.5 text-xs font-bold text-ink-soft underline underline-offset-2 hover:text-ink"
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
              nothing here yet. once AI starts working, every request, approval, rejection, and
              execution lands on this timeline — permanently.
            </p>
          </div>
        ) : (
          <ul className="mt-5 flex flex-col">
            {visible.map((a) => {
              const outcome = outcomeOf(a);
              const open = expanded === a.id;
              return (
                <li key={a.id} className="border-b border-line/60 last:border-0">
                  <button
                    onClick={() => setExpanded(open ? null : a.id)}
                    aria-expanded={open}
                    className="flex w-full items-start gap-3 py-3 text-left transition-colors duration-fast hover:bg-cream-deep/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-signal"
                  >
                    <Mark kind={outcome.mark} />
                    <span className="min-w-0 flex-1">
                      <span className="block text-[15px] font-semibold leading-snug">
                        {a.summary}
                      </span>
                      <span className="mt-0.5 flex flex-wrap items-center gap-x-1.5 text-xs text-ink-soft">
                        {a.injection_flag && (
                          <ShieldAlert size={11} strokeWidth={2.5} aria-hidden="true" />
                        )}
                        {outcome.line}
                      </span>
                    </span>
                    <span className="shrink-0 whitespace-nowrap pt-0.5 text-xs text-ink-soft">
                      {when(a.created_at)}
                    </span>
                    <ChevronDown
                      size={14}
                      className={`mt-0.5 shrink-0 text-ink-soft transition-transform duration-fast ${open ? "rotate-180" : ""}`}
                      aria-hidden="true"
                    />
                  </button>

                  {open && (
                    <div className="pb-3 pl-9">
                      <pre className="max-h-48 overflow-auto rounded-btn bg-cream-deep p-2.5 font-mono text-[10px] leading-relaxed text-ink">
                        {JSON.stringify({ payload: a.payload, result: a.result }, null, 2)}
                      </pre>
                      {a.status === "executed" && (
                        <button
                          onClick={() => setReceiptFor(a.id)}
                          className="mt-2 text-xs font-bold lowercase text-ink-soft underline underline-offset-2 hover:text-ink"
                        >
                          view receipt
                        </button>
                      )}
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>
      {receiptFor && <ReceiptModal actionId={receiptFor} onClose={() => setReceiptFor(null)} />}
    </div>
  );
}

/** ✓ it ran · ✕ it didn't · a hollow dot for anything still open. */
function Mark({ kind }: { kind: "done" | "stopped" | "waiting" | "running" }) {
  if (kind === "done") {
    return (
      <span
        className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-pill bg-signal text-cream"
        aria-hidden="true"
      >
        <Check size={12} strokeWidth={3} />
      </span>
    );
  }
  if (kind === "stopped") {
    return (
      <span
        className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-pill ring-1 ring-inset ring-ink/40 text-ink"
        aria-hidden="true"
      >
        <X size={12} strokeWidth={3} />
      </span>
    );
  }
  return (
    <span
      className={`mt-0.5 h-5 w-5 shrink-0 rounded-pill ring-1 ring-inset ring-ink/25 ${
        kind === "running" ? "animate-orb-pulse bg-signal/30" : "bg-cream-deep"
      }`}
      aria-hidden="true"
    />
  );
}
