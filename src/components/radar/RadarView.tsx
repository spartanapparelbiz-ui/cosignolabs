"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  AlertTriangle,
  Clock,
  Eye,
  Lightbulb,
  Repeat,
  Hourglass,
  UserCheck,
  X,
} from "lucide-react";

/**
 * Cosigno Radar — the "Needs Me" surface. Read-only detection over the user's
 * own state, presented with a strict separation of observed fact, inference,
 * and recommendation. Every item can be dismissed, snoozed, or (when there's
 * genuinely a mission to prepare) turned into an approval-gated CoSign Card.
 *
 * Radar never executes: "Prepare Mission" only creates a prepared mission.
 */

type RadarCategory =
  | "at_risk"
  | "forgotten"
  | "opportunity"
  | "routine"
  | "waiting"
  | "needs_you";

interface RadarItem {
  key: string;
  category: RadarCategory;
  title: string;
  observed: string;
  source: string;
  why: string;
  inference: string;
  recommendation: string;
  confidence: "high" | "medium" | "low";
  involves: string[];
  suggestedTemplate: string | null;
  suggestedCommand: string | null;
  status: "new" | "seen" | "dismissed" | "snoozed" | "prepared";
}

interface RadarOverview {
  as_of: string;
  categories: { category: RadarCategory; label: string; blurb: string; count: number }[];
  items: RadarItem[];
  active: number;
}

const CATEGORY_ICON: Record<RadarCategory, typeof AlertTriangle> = {
  at_risk: AlertTriangle,
  forgotten: Clock,
  opportunity: Lightbulb,
  routine: Repeat,
  waiting: Hourglass,
  needs_you: UserCheck,
};

// Red ONLY for at-risk warnings; everything else uses ink/signal per brand.
function accent(cat: RadarCategory): string {
  return cat === "at_risk" ? "text-danger" : "text-ink";
}

function ConfidenceTag({ level }: { level: RadarItem["confidence"] }) {
  const label =
    level === "high" ? "High confidence" : level === "medium" ? "Medium confidence" : "Low confidence — verify";
  return (
    <span className="rounded-pill bg-cream-deep px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-ink-soft">
      {label}
    </span>
  );
}

export function RadarView() {
  const [data, setData] = useState<RadarOverview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/radar");
      const json = await res.json();
      if (!res.ok) throw new Error(json.message || "couldn't load radar.");
      setData(json.radar);
    } catch (e) {
      setError(e instanceof Error ? e.message : "couldn't load radar.");
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function disposition(key: string, status: "seen" | "dismissed" | "snoozed", snoozeHours?: number) {
    setBusy(key);
    try {
      await fetch("/api/radar/disposition", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ key, status, snooze_hours: snoozeHours }),
      });
      await load();
    } finally {
      setBusy(null);
    }
  }

  async function prepare(item: RadarItem) {
    setBusy(item.key);
    try {
      const res = await fetch("/api/radar/prepare", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ key: item.key }),
      });
      const json = await res.json();
      if (res.ok && json.mission?.id) {
        window.location.href = `/app/missions/${json.mission.id}`;
        return;
      }
      // Honest fallback: the item points at an existing surface.
      setError(json.message || "nothing new to prepare for this one.");
    } finally {
      setBusy(null);
    }
  }

  if (error && !data) {
    return <p className="text-sm font-semibold text-danger">{error}</p>;
  }
  if (!data) {
    return <p className="text-sm font-semibold text-ink-soft">reading your radar…</p>;
  }

  const visible = data.items.filter((i) => i.status !== "dismissed" && i.status !== "snoozed");

  return (
    <div className="flex flex-col gap-6">
      {/* Category summary chips */}
      <div className="flex flex-wrap gap-2">
        {data.categories.map((c) => {
          const Icon = CATEGORY_ICON[c.category];
          return (
            <span
              key={c.category}
              className={`inline-flex items-center gap-1.5 rounded-pill border border-line bg-surface px-3 py-1 text-xs font-bold ${
                c.count > 0 ? "text-ink" : "text-ink-soft/60"
              }`}
              title={c.blurb}
            >
              <Icon size={13} strokeWidth={2.4} className={c.count > 0 ? accent(c.category) : ""} aria-hidden />
              {c.label}
              {c.count > 0 && <span className="text-ink-soft">· {c.count}</span>}
            </span>
          );
        })}
      </div>

      {error && <p className="text-xs font-semibold text-danger">{error}</p>}

      {visible.length === 0 ? (
        <div className="rounded-card border border-line bg-surface p-8 text-center">
          <p className="font-display text-lg font-bold lowercase">nothing needs you right now</p>
          <p className="mt-1 text-sm font-semibold text-ink-soft">
            radar watches your prepared work, missions, and connections. it will surface
            what needs a decision — and never act on its own.
          </p>
        </div>
      ) : (
        <ul className="flex flex-col gap-3">
          {visible.map((item) => {
            const Icon = CATEGORY_ICON[item.category];
            const preparable = Boolean(item.suggestedTemplate || item.suggestedCommand);
            return (
              <li
                key={item.key}
                className="rounded-card border border-line bg-surface p-5 shadow-well"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-start gap-2.5">
                    <Icon size={18} strokeWidth={2.4} className={`mt-0.5 shrink-0 ${accent(item.category)}`} aria-hidden />
                    <div>
                      <h3 className="font-display text-base font-bold">{item.title}</h3>
                      <p className="mt-0.5 text-[11px] font-semibold uppercase tracking-wider text-ink-soft">
                        {item.source}
                      </p>
                    </div>
                  </div>
                  <ConfidenceTag level={item.confidence} />
                </div>

                {/* Strict separation: observed vs inference vs recommendation */}
                <dl className="mt-3 grid gap-2 text-sm">
                  <div>
                    <dt className="text-[11px] font-bold uppercase tracking-wider text-ink-soft">Observed</dt>
                    <dd className="font-medium text-ink">{item.observed}</dd>
                  </div>
                  <div>
                    <dt className="text-[11px] font-bold uppercase tracking-wider text-ink-soft">Why it matters</dt>
                    <dd className="font-medium text-ink">{item.why}</dd>
                  </div>
                  <div>
                    <dt className="text-[11px] font-bold uppercase tracking-wider text-ink-soft">
                      Cosigno&rsquo;s read (inference)
                    </dt>
                    <dd className="font-medium text-ink-soft">{item.inference}</dd>
                  </div>
                  <div>
                    <dt className="text-[11px] font-bold uppercase tracking-wider text-ink-soft">Suggested next step</dt>
                    <dd className="font-medium text-ink">{item.recommendation}</dd>
                  </div>
                </dl>

                {item.involves.length > 0 && (
                  <div className="mt-3 flex flex-wrap gap-1.5">
                    {item.involves.map((inv) => (
                      <span key={inv} className="rounded-pill bg-cream-deep px-2 py-0.5 text-[10px] font-bold text-ink-soft">
                        {inv}
                      </span>
                    ))}
                  </div>
                )}

                <div className="mt-4 flex flex-wrap items-center gap-2">
                  {preparable ? (
                    <button
                      onClick={() => prepare(item)}
                      disabled={busy === item.key}
                      className="rounded-btn bg-ink px-3.5 py-1.5 text-xs font-bold text-cream transition-opacity hover:opacity-90 disabled:opacity-50"
                    >
                      {busy === item.key ? "preparing…" : "Prepare Mission"}
                    </button>
                  ) : (
                    <Link
                      href={item.category === "needs_you" ? "/app/missions" : "/app/connections"}
                      className="rounded-btn border border-ink px-3.5 py-1.5 text-xs font-bold text-ink transition-colors hover:bg-ink hover:text-cream"
                    >
                      {item.recommendation.length < 30 ? item.recommendation : "Open"}
                    </Link>
                  )}
                  <button
                    onClick={() => disposition(item.key, "snoozed", 24)}
                    disabled={busy === item.key}
                    className="inline-flex items-center gap-1 rounded-btn px-2.5 py-1.5 text-xs font-bold text-ink-soft transition-colors hover:bg-cream-deep hover:text-ink disabled:opacity-50"
                  >
                    <Clock size={13} aria-hidden /> Snooze
                  </button>
                  <button
                    onClick={() => disposition(item.key, "dismissed")}
                    disabled={busy === item.key}
                    className="inline-flex items-center gap-1 rounded-btn px-2.5 py-1.5 text-xs font-bold text-ink-soft transition-colors hover:bg-cream-deep hover:text-ink disabled:opacity-50"
                  >
                    <X size={13} aria-hidden /> Dismiss
                  </button>
                  {item.status === "new" && (
                    <button
                      onClick={() => disposition(item.key, "seen")}
                      className="ml-auto inline-flex items-center gap-1 text-[11px] font-bold text-ink-soft/70 hover:text-ink"
                      title="Mark as seen"
                    >
                      <Eye size={12} aria-hidden /> new
                    </button>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
