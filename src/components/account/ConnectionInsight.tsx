"use client";

import { useCallback, useEffect, useState } from "react";
import { AlertTriangle, Check, Loader2, Lock, RefreshCw, X } from "lucide-react";

/**
 * What a connected app actually contains, and what the AI may do with it.
 *
 * The governing rule is that every number on this panel was measured. There is
 * no example mode, no placeholder, and no "typical account" fallback: a
 * provider cosigno can't inventory renders a stated reason where the numbers
 * would be. A screen whose entire job is telling you what is really in your
 * account is the worst possible place to approximate — a plausible wrong
 * number here is indistinguishable from a right one, and gets trusted.
 */

interface Fact {
  label: string;
  value: number;
  atLeast?: boolean;
}
interface Capability {
  id: string;
  /** Business language — "Create Order", never "POST /v1/orders". */
  label: string;
  summary: string;
  risk: "read" | "write" | "destructive";
  tier: 1 | 2 | 3;
  requires: string;
  /** False when the user must still enable or consent to it. */
  available?: boolean;
  unavailableReason?: string;
  /** The underlying call — details only, never the headline. */
  technical?: string;
}
interface Insight {
  ok: boolean;
  account?: string;
  facts: Fact[];
  limitations: string[];
  error?: string;
  provider_name?: string;
  capabilities: Capability[];
}

const REQUIRES_TONE: Record<number, string> = {
  1: "bg-cream-deep text-ink-soft",
  2: "bg-signal/15 text-ink ring-1 ring-inset ring-signal/40",
  3: "bg-ink text-cream",
};

export function ConnectionInsight({
  connectionId,
  providerName,
}: {
  connectionId: string;
  providerName: string;
}) {
  const [data, setData] = useState<Insight | null>(null);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState<string | null>(null);

  const load = useCallback(async () => {
    setBusy(true);
    setFailed(null);
    try {
      const r = await fetch(`/api/connections/${connectionId}/discover`, { method: "POST" });
      const d = await r.json();
      if (!r.ok && !d?.error) throw new Error(d?.message || "couldn't read this connection.");
      setData(d);
    } catch (e) {
      setFailed(e instanceof Error ? e.message : "couldn't read this connection.");
    } finally {
      setBusy(false);
    }
  }, [connectionId]);

  useEffect(() => {
    load();
  }, [load]);

  if (busy && !data) {
    return (
      <p className="flex items-center gap-2 px-1 py-2 text-xs font-semibold text-ink-soft">
        <Loader2 size={13} className="animate-spin" aria-hidden="true" />
        reading your {providerName} account…
      </p>
    );
  }

  if (failed) {
    return (
      <p className="flex items-start gap-2 px-1 py-2 text-xs font-semibold text-ink-soft">
        <AlertTriangle size={13} className="mt-0.5 shrink-0 text-signal" aria-hidden="true" />
        {failed}
      </p>
    );
  }

  if (!data) return null;

  return (
    <div className="mt-3 flex flex-col gap-3 border-t border-line/60 pt-3">
      {/* ---------------- what's actually in there ---------------- */}
      {data.ok && data.facts.length > 0 ? (
        <div>
          <div className="flex items-center justify-between">
            <p className="text-[10px] font-extrabold uppercase tracking-widest text-ink-soft">
              in your account{data.account ? ` · ${data.account}` : ""}
            </p>
            <button
              onClick={load}
              disabled={busy}
              title="re-read"
              className="rounded-btn p-1 text-ink-soft transition-colors hover:bg-cream-deep hover:text-ink disabled:opacity-50"
            >
              <RefreshCw size={11} className={busy ? "animate-spin" : ""} aria-hidden="true" />
            </button>
          </div>
          <ul className="mt-1.5 grid gap-1.5 sm:grid-cols-2">
            {data.facts.map((f) => (
              <li key={f.label} className="flex items-baseline gap-1.5 rounded-btn bg-cream-deep/50 px-2.5 py-1.5">
                <span className="font-display text-base font-bold tabular-nums">
                  {/* A capped total renders as "100+" — never as an exact
                      number it isn't. */}
                  {f.value.toLocaleString()}
                  {f.atLeast ? "+" : ""}
                </span>
                <span className="text-[11px] leading-tight text-ink-soft">{f.label}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : (
        <p className="text-[11px] font-semibold text-ink-soft">
          {data.error ?? `cosigno can't inventory ${providerName} yet.`}
        </p>
      )}

      {/* Gaps are stated, never quietly dropped: a fact missing for an
          unexplained reason reads as zero to most people. */}
      {data.limitations.length > 0 && (
        <ul className="flex flex-col gap-0.5">
          {data.limitations.map((l) => (
            <li key={l} className="flex items-start gap-1.5 text-[11px] text-ink-soft">
              <AlertTriangle size={11} className="mt-0.5 shrink-0 text-signal" aria-hidden="true" />
              {l}
            </li>
          ))}
        </ul>
      )}

      {/* ---------------- what the AI may do ---------------- */}
      {data.capabilities.length > 0 && (
        <div>
          <p className="text-[10px] font-extrabold uppercase tracking-widest text-ink-soft">
            what cosigno may do
          </p>
          <ul className="mt-1.5 flex flex-col gap-1">
            {data.capabilities.map((c) => (
              <li key={c.id} className="flex items-start gap-2 text-[11px]">
                {c.available === false ? (
                  <Lock size={12} className="mt-0.5 shrink-0 text-ink-soft" aria-hidden="true" />
                ) : c.risk === "read" ? (
                  <Check size={12} className="mt-0.5 shrink-0 text-signal" aria-hidden="true" />
                ) : c.risk === "destructive" ? (
                  <X size={12} className="mt-0.5 shrink-0 text-ink" aria-hidden="true" />
                ) : (
                  <Check size={12} className="mt-0.5 shrink-0 text-ink-soft" aria-hidden="true" />
                )}
                <span className="min-w-0 flex-1">
                  {/* Business language leads. The endpoint is context, not
                      the thing being read before approving. */}
                  <span className="font-bold">{c.label ?? c.id}</span>
                  {c.technical && c.technical !== c.label && (
                    <span className="ml-1.5 font-mono text-[10px] text-ink-soft/70">
                      {c.technical}
                    </span>
                  )}
                  <span className="block truncate text-ink-soft">{c.summary}</span>
                  {/* An off or unconsented tool must never read as ready to
                      run — calling it would simply be refused. */}
                  {c.unavailableReason && (
                    <span className="block text-ink-soft/80">{c.unavailableReason}</span>
                  )}
                </span>
                <span
                  className={`shrink-0 rounded-pill px-1.5 py-0.5 text-[9px] font-black uppercase tracking-wider ${
                    c.available === false ? "bg-cream-deep text-ink-soft" : REQUIRES_TONE[c.tier]
                  }`}
                >
                  {c.available === false ? "off" : c.requires}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
