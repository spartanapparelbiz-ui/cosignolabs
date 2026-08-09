"use client";

import { useCallback, useEffect, useState } from "react";
import { Brain } from "lucide-react";
import type { LearnedPreference } from "@/lib/personalization/preferences";
import { Toggle } from "@/components/ui/Toggle";
import { useToast } from "@/components/Toast";

/**
 * HOW COSIGNO WORKS WITH YOU — the whole learned profile, on one page, with
 * an off switch.
 *
 * This panel is the honesty half of personalization. cosigno adapts to people
 * from what they actually do, which is the only way that works and also the
 * way that gets creepy fastest. The defence is not to adapt less; it is to
 * make the entire model legible:
 *
 *   · every line is exactly what reaches the planner — no curated subset
 *   · every line shows the evidence it came from
 *   · one switch turns all of it off, including saved notes
 *
 * On a new account this says so plainly rather than hiding. "cosigno hasn't
 * learned anything about you yet" is a true, useful thing to read, and it
 * tells someone that behaviour will change as they use it.
 */

const KIND_LABEL: Record<LearnedPreference["kind"], string> = {
  caution: "What you decline",
  style: "How you like things written",
  focus: "What you delegate",
  trust: "What you always approve",
};

export function LearnedPanel() {
  const [prefs, setPrefs] = useState<LearnedPreference[] | null>(null);
  const [enabled, setEnabled] = useState(true);
  const [busy, setBusy] = useState(false);
  const toast = useToast();

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/personalization");
      if (!res.ok) throw new Error();
      const d = await res.json();
      setPrefs(d.preferences ?? []);
      setEnabled(Boolean(d.enabled));
    } catch {
      setPrefs([]);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function setLearning(next: boolean) {
    setBusy(true);
    // Optimistic: the switch must feel like a switch, not a form submission.
    setEnabled(next);
    try {
      const res = await fetch("/api/memory", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ memory_enabled: next }),
      });
      if (!res.ok) throw new Error();
      toast(
        "success",
        next
          ? "cosigno will keep learning from your decisions."
          : "cosigno will stop learning from your decisions."
      );
      await load();
    } catch {
      setEnabled(!next);
      toast("error", "that didn't save — nothing changed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="mt-6">
      <Toggle
        checked={enabled}
        busy={busy}
        onChange={setLearning}
        label="Let cosigno learn how you work"
        icon={<Brain size={20} strokeWidth={2.2} aria-hidden="true" />}
        description={
          <>
            cosigno notices what you approve, what you decline, and how you ask
            for things, and adjusts what it proposes. It never changes what
            needs your approval. Turning this off also stops it using your
            saved notes.
          </>
        }
      />

      {enabled && (
        <div className="mt-4 rounded-card bg-surface/60 p-5 shadow-soft">
          <h3 className="text-sm font-bold">What cosigno has picked up</h3>
          <p className="mt-0.5 text-xs text-ink-soft">
            This is the whole list — the same one it works from. Nothing is kept
            back.
          </p>

          {prefs === null && (
            <p className="mt-4 text-xs font-semibold text-ink-soft" aria-busy="true">
              Reading your decisions…
            </p>
          )}

          {prefs !== null && prefs.length === 0 && (
            <p className="mt-4 text-sm font-semibold text-ink-soft">
              Nothing yet. cosigno starts from a blank slate and picks things up
              as you approve, decline, and ask for work — a handful of decisions
              is usually enough.
            </p>
          )}

          {prefs !== null && prefs.length > 0 && (
            <ul className="mt-4 flex flex-col gap-3">
              {prefs.map((p, i) => (
                <li
                  key={p.id}
                  style={{ animationDelay: `${Math.min(i, 8) * 50}ms` }}
                  className="animate-card-in rounded-btn bg-cream-deep/50 p-3.5"
                >
                  <p className="text-[10px] font-extrabold uppercase tracking-widest text-ink-soft">
                    {KIND_LABEL[p.kind]}
                  </p>
                  <p className="mt-1 text-sm font-extrabold leading-snug">{p.statement}</p>
                  <p className="mt-1 text-xs font-semibold">
                    <span className="text-ink-soft">So cosigno will: </span>
                    {p.behavior}
                  </p>
                  <p className="mt-1 text-[11px] text-ink-soft">{p.because}</p>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </section>
  );
}
