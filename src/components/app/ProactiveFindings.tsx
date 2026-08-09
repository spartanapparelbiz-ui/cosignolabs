"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronDown } from "lucide-react";
import type { SignalView } from "@/lib/autopilot/types";
import { Button } from "@/components/ui/Button";
import { CardEnter } from "@/components/motion/Enter";
import { useToast } from "@/components/Toast";

/**
 * WHAT COSIGNO NOTICED WHILE IT WAS WORKING.
 *
 * An operator that only ever does the literal thing it was asked is a command
 * line with better manners. The valuable part is the thing it spots on the
 * way past — and the only honest way to present that is: here is what I saw,
 * here is why it matters, here is what I can do about it, your call.
 *
 * Two hard rules, both of which this component enforces rather than trusts:
 *
 * 1. NOTHING WITHOUT REAL DATA. The findings engine can run on sample data so
 *    the surface can be developed and demonstrated. Sample findings are never
 *    shown here. Home is where someone forms their picture of their own
 *    business; a sample number on it is indistinguishable from a real one.
 * 2. NOTHING SILENT. "Do it" runs the recommendation through the same command
 *    pipeline as anything typed into the ask box — same limits, same planner,
 *    same approval door. Noticing something never buys cosigno a shortcut.
 */

interface Overview {
  data_source: "sample" | "live";
  attention: SignalView[];
}

const SEVERITY_LABEL: Record<string, string> = {
  critical: "High",
  important: "Medium",
  fyi: "Low",
};

export function ProactiveFindings() {
  const [findings, setFindings] = useState<SignalView[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);
  const toast = useToast();
  const router = useRouter();

  useEffect(() => {
    let alive = true;
    fetch("/api/autopilot", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d: { overview?: Overview } | null) => {
        if (!alive || !d?.overview) return;
        // Sample data never reaches home. See rule 1 above.
        if (d.overview.data_source !== "live") return setFindings([]);
        setFindings((d.overview.attention ?? []).filter((s) => s.status !== "ignored").slice(0, 3));
      })
      .catch(() => {
        /* home is unaffected — this section simply doesn't render */
      });
    return () => {
      alive = false;
    };
  }, []);

  async function act(signal: SignalView) {
    if (!signal.action) return;
    setBusy(signal.key);
    try {
      const res = await fetch("/api/autopilot/act", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ command: signal.action.command, signal_key: signal.key }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.message || "cosigno couldn't start that.");
      setFindings((f) => (f ?? []).filter((x) => x.key !== signal.key));
      toast("success", "cosigno is on it.");
      router.refresh();
    } catch (e) {
      toast("error", e instanceof Error ? e.message : "cosigno couldn't start that.");
    } finally {
      setBusy(null);
    }
  }

  async function dismiss(signal: SignalView) {
    setFindings((f) => (f ?? []).filter((x) => x.key !== signal.key));
    await fetch(`/api/autopilot/signals/${encodeURIComponent(signal.key)}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "ignored" }),
    }).catch(() => {
      /* a dismissal that didn't stick will simply reappear — never an error */
    });
  }

  if (!findings || findings.length === 0) return null;

  return (
    <section className="mt-8 animate-rise-in border-t border-line/60 pt-5" aria-labelledby="noticed">
      <h2
        id="noticed"
        className="text-[11px] font-extrabold uppercase tracking-widest text-ink-soft"
      >
        cosigno also noticed
      </h2>
      <div className="mt-3 flex flex-col gap-2.5">
        {findings.map((s, i) => {
          const open = expanded === s.key;
          return (
            <CardEnter
              as="article"
              key={s.key}
              index={i}
              className="rounded-card border border-line/70 bg-surface p-4 shadow-soft"
            >
              <div className="flex items-start gap-3">
                <h3 className="min-w-0 flex-1 text-sm font-extrabold leading-snug">{s.title}</h3>
                <span className="shrink-0 rounded-pill bg-cream-deep px-2 py-0.5 text-[10px] font-bold">
                  {SEVERITY_LABEL[s.severity] ?? "Medium"} impact
                </span>
              </div>

              {/* Why, in one sentence. The supporting numbers stay folded. */}
              <p className="mt-1.5 text-xs font-semibold text-ink-soft">
                <span className="font-extrabold text-ink">Why: </span>
                {s.why}
              </p>

              {s.action && (
                <p className="mt-1 text-xs font-semibold text-ink-soft">
                  <span className="font-extrabold text-ink">cosigno can: </span>
                  {s.action.label.toLowerCase()}
                </p>
              )}

              <div className="mt-3 flex flex-wrap items-center gap-2">
                {s.action && (
                  <Button
                    size="sm"
                    loading={busy === s.key}
                    loadingLabel="Starting"
                    onClick={() => act(s)}
                  >
                    Do it
                  </Button>
                )}
                <Button size="sm" tone="ghost" onClick={() => dismiss(s)}>
                  Not now
                </Button>
                <button
                  onClick={() => setExpanded(open ? null : s.key)}
                  aria-expanded={open}
                  className="ml-auto inline-flex min-h-[36px] items-center gap-1 rounded-btn px-2 text-xs font-bold text-ink-soft hover:text-ink"
                >
                  {open ? "Less" : "Details"}
                  <ChevronDown
                    size={13}
                    aria-hidden="true"
                    className={`transition-transform duration-fast ${open ? "rotate-180" : ""}`}
                  />
                </button>
              </div>

              {open && (
                <div className="mt-3 animate-fade-through border-t border-line/60 pt-3">
                  <p className="text-xs font-semibold">{s.body}</p>
                  <p className="mt-1.5 text-xs text-ink-soft">{s.impact}</p>
                  {s.metrics.length > 0 && (
                    <dl className="mt-2.5 flex flex-wrap gap-x-6 gap-y-1.5">
                      {s.metrics.map((m) => (
                        <div key={m.label}>
                          <dt className="text-[10px] font-bold uppercase tracking-wide text-ink-soft">
                            {m.label}
                          </dt>
                          <dd className="text-sm font-extrabold tabular-nums">{m.value}</dd>
                        </div>
                      ))}
                    </dl>
                  )}
                </div>
              )}
            </CardEnter>
          );
        })}
      </div>
    </section>
  );
}
