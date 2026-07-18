"use client";

import { useCallback, useEffect, useState } from "react";
import { Check, Eye, Repeat } from "lucide-react";
import { useToast } from "@/components/Toast";

/**
 * The skill catalog. Every card is honest about what installing does: it
 * lists the exact rules that will be created, each labeled watch (monitor)
 * or prepare. Install/uninstall is reversible and touches only the skill's
 * own rules.
 */

interface SkillView {
  key: string;
  name: string;
  tagline: string;
  items: { name: string; mode: "monitor" | "prepare"; interval_hours: number }[];
  installed: boolean;
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

function cadence(hours: number): string {
  if (hours === 1) return "hourly";
  if (hours === 24) return "daily";
  if (hours === 168) return "weekly";
  return `every ${hours}h`;
}

export function SkillsPanel() {
  const [skills, setSkills] = useState<SkillView[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const toast = useToast();

  const load = useCallback(async () => {
    setError(null);
    try {
      const d = await jsonFetch("/api/skills");
      setSkills(d.skills ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "couldn't load skills.");
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function toggle(skill: SkillView) {
    setBusy(skill.key);
    try {
      await jsonFetch("/api/skills", {
        method: "POST",
        body: JSON.stringify({ key: skill.key, action: skill.installed ? "uninstall" : "install" }),
      });
      toast(
        "success",
        skill.installed
          ? "uninstalled — its rules are gone."
          : "installed — its watches are live and its rules will prepare work for you."
      );
      await load();
    } catch (e) {
      toast("error", e instanceof Error ? e.message : "that didn't go through.");
    } finally {
      setBusy(null);
    }
  }

  if (error) {
    return (
      <div className="mt-5 rounded-card bg-surface/60 p-6 text-center shadow-soft">
        <p className="text-sm font-semibold text-ink-soft">{error}</p>
        <button
          onClick={load}
          className="mt-3 rounded-btn px-4 py-2 text-sm font-bold lowercase ring-1 ring-inset ring-ink hover:bg-cream-deep"
        >
          try again
        </button>
      </div>
    );
  }

  if (skills === null) {
    return (
      <div className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-2" aria-busy="true">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="h-52 animate-pulse rounded-card bg-cream-deep" />
        ))}
      </div>
    );
  }

  return (
    <div className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-2">
      {skills.map((s) => (
        <div key={s.key} className="flex flex-col rounded-card border border-line/70 bg-surface p-5 shadow-soft">
          <div className="flex items-start justify-between gap-2">
            <h2 className="text-base font-extrabold">{s.name}</h2>
            {s.installed && (
              <span className="inline-flex items-center gap-1 rounded-pill bg-signal/15 px-2.5 py-0.5 text-[11px] font-bold text-ink">
                <Check size={11} strokeWidth={3} /> installed
              </span>
            )}
          </div>
          <p className="mt-1 text-sm text-ink-soft">{s.tagline}</p>
          <ul className="mt-3 flex flex-1 flex-col gap-1.5">
            {s.items.map((i) => (
              <li key={i.name} className="flex items-center gap-2 text-xs font-semibold text-ink-soft">
                {i.mode === "monitor" ? (
                  <Eye size={13} className="shrink-0" />
                ) : (
                  <Repeat size={13} className="shrink-0" />
                )}
                <span className="min-w-0 flex-1 truncate">{i.name}</span>
                <span className="shrink-0 text-[10px] font-bold uppercase tracking-wide">
                  {i.mode === "monitor" ? "watch" : "prepare"} · {cadence(i.interval_hours)}
                </span>
              </li>
            ))}
          </ul>
          <button
            onClick={() => toggle(s)}
            disabled={busy === s.key}
            className={`mt-4 rounded-btn px-4 py-2 text-sm font-extrabold transition-transform active:scale-[0.98] disabled:opacity-50 ${
              s.installed
                ? "text-ink-soft ring-1 ring-inset ring-ink/30 hover:bg-cream-deep"
                : "bg-ink text-cream"
            }`}
          >
            {busy === s.key ? "working…" : s.installed ? "uninstall" : "install"}
          </button>
        </div>
      ))}
    </div>
  );
}
