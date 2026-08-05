"use client";

import { useEffect, useState } from "react";
import { AlertTriangle, Lock, ShieldCheck } from "lucide-react";
import {
  PRESETS,
  activePreset,
  explain,
  type PresetId,
  type TrustSetting,
} from "@/lib/trust/capabilities";
import { SkeletonRows } from "@/components/Skeleton";

/**
 * The Trust Center.
 *
 * One question per row, in a sentence, with three answers. Not a tier board:
 * "tier 2" is how the engine talks to itself, and nobody chose it. What a
 * person wants to say is "ask me before you send email", so that is the
 * control.
 *
 * Every answer here is enforced somewhere real — Always and Ask Me move the
 * tier the approval engine resolves, Never writes a block checked before an
 * action can even be proposed. Nothing on this page is decorative, because a
 * safety control that doesn't do anything is worse than no control at all.
 */

interface Row {
  id: string;
  icon: string;
  title: string;
  detail: string;
  pinned: boolean;
  setting: TrustSetting;
}

const OPTIONS: { value: TrustSetting; label: string }[] = [
  { value: "always", label: "always" },
  { value: "ask", label: "ask me" },
  { value: "never", label: "never" },
];

export function TrustCenter() {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [justSet, setJustSet] = useState<{ id: string; setting: TrustSetting } | null>(null);
  const [confirming, setConfirming] = useState<{ row: Row; setting: TrustSetting } | null>(null);

  function load() {
    setError(null);
    fetch("/api/trust")
      .then((r) => r.json())
      .then((d) => {
        if (!d.capabilities) throw new Error(d.message || "couldn't load your settings.");
        setRows(d.capabilities);
      })
      .catch((e) => setError(e instanceof Error ? e.message : "couldn't load your settings."));
  }
  useEffect(load, []);

  const current: Record<string, TrustSetting> = Object.fromEntries(
    (rows ?? []).map((r) => [r.id, r.setting])
  );
  const preset = rows ? activePreset(current) : null;

  async function apply(capability: string, setting: TrustSetting) {
    setBusy(capability);
    setError(null);
    try {
      const res = await fetch("/api/trust", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ capability, setting }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.message || "that setting didn't save.");
      // The server returns the whole picture back, so what's on screen is what
      // the engine will actually enforce — never an optimistic guess.
      setRows(body.capabilities);
      setJustSet({ id: capability, setting });
    } catch (e) {
      setError(e instanceof Error ? e.message : "that setting didn't save.");
    } finally {
      setBusy(null);
    }
  }

  /** Loosening a control is the one change worth a second look. */
  function choose(row: Row, setting: TrustSetting) {
    if (setting === row.setting) return;
    const loosening =
      (row.setting === "never" && setting !== "never") ||
      (row.setting === "ask" && setting === "always");
    if (loosening) {
      setConfirming({ row, setting });
      return;
    }
    void apply(row.id, setting);
  }

  async function applyPreset(id: PresetId) {
    const p = PRESETS.find((x) => x.id === id);
    if (!p || !rows) return;
    setBusy(`preset:${id}`);
    setError(null);
    try {
      for (const row of rows) {
        const want = p.settings[row.id];
        if (!want || want === row.setting) continue;
        const res = await fetch("/api/trust", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ capability: row.id, setting: want }),
        });
        const body = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(body.message || "that preset didn't apply.");
        setRows(body.capabilities);
      }
      setJustSet(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "that preset didn't apply.");
    } finally {
      setBusy(null);
    }
  }

  if (error && rows === null) {
    return (
      <div className="rounded-card bg-surface/60 p-8 text-center shadow-soft">
        <p className="text-sm font-semibold text-ink-soft">{error}</p>
        <button
          onClick={load}
          className="mt-4 rounded-btn bg-ink px-5 py-2 text-sm font-bold lowercase text-cream"
        >
          try again
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-8">
      {/* The one-decision shortcut. Most people will never open a single row. */}
      <section>
        <h2 className="text-sm font-extrabold uppercase tracking-widest text-ink-soft">
          how much should cosigno do on its own?
        </h2>
        <div className="mt-3 grid gap-3 sm:grid-cols-3">
          {PRESETS.map((p) => {
            const active = preset === p.id;
            return (
              <button
                key={p.id}
                onClick={() => applyPreset(p.id)}
                disabled={busy !== null || rows === null}
                aria-pressed={active}
                className={`rounded-card p-5 text-left transition-all duration-fast ease-brand-out disabled:cursor-not-allowed ${
                  active
                    ? "bg-ink text-cream shadow-lift"
                    : "bg-surface/60 shadow-soft hover:-translate-y-0.5 hover:shadow-lift"
                }`}
              >
                <div className="flex items-center gap-2">
                  <span className="text-base font-extrabold lowercase">{p.title}</span>
                  {p.recommended && !active && (
                    <span className="rounded-pill bg-signal/15 px-2 py-0.5 text-[10px] font-extrabold lowercase text-signal">
                      recommended
                    </span>
                  )}
                  {active && (
                    <span className="ml-auto text-[10px] font-extrabold uppercase tracking-widest opacity-70">
                      on
                    </span>
                  )}
                </div>
                <p
                  className={`mt-2 text-sm leading-snug ${active ? "text-cream/75" : "text-ink-soft"}`}
                >
                  {p.detail}
                </p>
              </button>
            );
          })}
        </div>
        {rows !== null && preset === null && (
          <p className="mt-2 text-xs text-ink-soft">
            your settings are your own — they don&apos;t match any of the three above.
          </p>
        )}
      </section>

      {error && rows !== null && (
        <p className="rounded-btn bg-cream-deep px-4 py-3 text-sm font-semibold" role="alert">
          {error}
        </p>
      )}

      {/* One row per capability. */}
      <section className="flex flex-col gap-3">
        <h2 className="text-sm font-extrabold uppercase tracking-widest text-ink-soft">
          what cosigno may do
        </h2>
        {rows === null ? (
          <SkeletonRows rows={5} />
        ) : (
          rows.map((row) => (
            <div key={row.id} className="rounded-card bg-surface/60 p-5 shadow-soft">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
                <span
                  className="flex h-14 w-14 shrink-0 items-center justify-center rounded-btn bg-cream-deep text-2xl"
                  aria-hidden="true"
                >
                  {row.icon}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-lg font-extrabold lowercase">{row.title}</p>
                  <p className="mt-0.5 text-sm leading-snug text-ink-soft">{row.detail}</p>
                </div>
                <Segmented
                  row={row}
                  busy={busy === row.id}
                  onChoose={(s) => choose(row, s)}
                />
              </div>
              {justSet?.id === row.id && (
                <p className="mt-3 animate-fade-through rounded-btn bg-cream-deep px-3 py-2 text-xs font-semibold">
                  {explain(justSet.setting)}
                </p>
              )}
              {row.pinned && (
                <p className="mt-3 inline-flex items-center gap-1.5 text-xs text-ink-soft">
                  <Lock size={11} strokeWidth={2.6} aria-hidden="true" />
                  cosigno can never do this on its own — that isn&apos;t a setting you can turn off.
                </p>
              )}
            </div>
          ))
        )}
      </section>

      <BudgetDefault />

      {/* What holds regardless of anything set above. */}
      <section className="rounded-card bg-surface/60 p-5 shadow-soft">
        <div className="flex items-center gap-2">
          <ShieldCheck size={16} strokeWidth={2.4} className="text-signal" aria-hidden="true" />
          <h2 className="text-sm font-extrabold lowercase">true no matter what you choose</h2>
        </div>
        <ul className="mt-3 flex flex-col gap-2 text-sm text-ink-soft">
          <li>money and deletion always stop and wait for you, and always will.</li>
          <li>
            every action cosigno takes is recorded — what it was, when, and whether you
            approved it.
          </li>
          <li>cosigno can never give itself more permission than you set here.</li>
          <li>
            emergency stop halts everything at once, including work already approved and
            running.
          </li>
        </ul>
      </section>

      {confirming && (
        <LoosenModal
          title={confirming.row.title}
          from={confirming.row.setting}
          to={confirming.setting}
          busy={busy === confirming.row.id}
          onConfirm={() => {
            const { row, setting } = confirming;
            setConfirming(null);
            void apply(row.id, setting);
          }}
          onCancel={() => setConfirming(null)}
        />
      )}
    </div>
  );
}

/**
 * How far a mission gets before it checks in — the second half of trust.
 *
 * The rows above answer "may cosigno do this at all". This answers "how much
 * of it, unattended". Both are the user's, and putting them on one page means
 * the answer to "what can this thing do to my business" is in one place.
 *
 * Counted in changes, not dollars. The product used to show a mission's cap as
 * "$2.00", which is cosigno's hosting cost wearing the label of a decision the
 * user made. Cost stays internal.
 */
function BudgetDefault() {
  const [budget, setBudget] = useState<number | null>(null);
  const [choices, setChoices] = useState<number[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/settings/budget")
      .then((r) => r.json())
      .then((d) => {
        setBudget(d.budget ?? null);
        setChoices(d.choices ?? []);
      })
      .catch(() => setError("couldn't load your limit."));
  }, []);

  async function choose(value: number) {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/settings/budget", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ budget: value }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.message || "that limit didn't save.");
      setBudget(body.budget);
    } catch (e) {
      setError(e instanceof Error ? e.message : "that limit didn't save.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="rounded-card bg-surface/60 p-5 shadow-soft">
      <h2 className="text-sm font-extrabold lowercase">how far it gets before checking in</h2>
      <p className="mt-1 max-w-2xl text-sm text-ink-soft">
        a mission stops after this many changes and asks whether to keep going. reading,
        searching and drafting don&apos;t count — only things that change something outside
        cosigno.
      </p>
      <div className="mt-3 flex flex-wrap gap-2">
        {choices.map((n) => (
          <button
            key={n}
            onClick={() => choose(n)}
            disabled={busy || budget === null}
            aria-pressed={budget === n}
            className={`rounded-pill px-4 py-2 text-sm font-bold transition-all duration-fast disabled:cursor-not-allowed ${
              budget === n
                ? "bg-ink text-cream shadow-soft"
                : "bg-cream-deep text-ink-soft hover:text-ink"
            }`}
          >
            {n} changes
          </button>
        ))}
      </div>
      {error && (
        <p className="mt-2 text-xs font-semibold" role="alert">
          {error}
        </p>
      )}
      <p className="mt-2 text-xs text-ink-soft">
        any mission you&apos;ve given its own limit keeps it. everything else follows this.
      </p>
    </section>
  );
}

/**
 * The three-way control. "Always" is simply absent on a pinned capability
 * rather than present-and-disabled: an option you can see but not choose reads
 * as something the product is withholding, when the truth is it was never on
 * offer.
 */
function Segmented({
  row,
  busy,
  onChoose,
}: {
  row: Row;
  busy: boolean;
  onChoose: (s: TrustSetting) => void;
}) {
  const options = row.pinned ? OPTIONS.filter((o) => o.value !== "always") : OPTIONS;
  return (
    <div
      role="radiogroup"
      aria-label={`${row.title} — how cosigno should handle this`}
      className="flex shrink-0 gap-1 rounded-pill bg-cream-deep p-1"
    >
      {options.map((o) => {
        const active = row.setting === o.value;
        return (
          <button
            key={o.value}
            role="radio"
            aria-checked={active}
            disabled={busy}
            onClick={() => onChoose(o.value)}
            className={`rounded-pill px-4 py-2 text-sm font-bold lowercase transition-all duration-fast ease-brand-out disabled:cursor-not-allowed ${
              active
                ? o.value === "never"
                  ? "bg-signal text-ink shadow-soft"
                  : "bg-ink text-cream shadow-soft"
                : "text-ink-soft hover:text-ink"
            }`}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

const WHAT_CHANGES: Record<string, string> = {
  "never→ask": "cosigno will start proposing this again. it still waits for your approval every time.",
  "never→always": "cosigno will do this on its own, without asking and without waiting.",
  "ask→always": "cosigno will stop asking. it will do this on its own, immediately, every time.",
};

/**
 * Loosening a control is the only change that can surprise someone later, so
 * it is the only one that stops to say what it means. Tightening applies at
 * once — hesitating in front of someone trying to be safer is its own defect.
 */
function LoosenModal({
  title,
  from,
  to,
  busy,
  onConfirm,
  onCancel,
}: {
  title: string;
  from: TrustSetting;
  to: TrustSetting;
  busy: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const consequence = WHAT_CHANGES[`${from}→${to}`] ?? explain(to);
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 px-4"
      role="dialog"
      aria-modal="true"
      aria-label={`change ${title}`}
    >
      <div className="w-full max-w-sm origin-center animate-modal-in rounded-card bg-cream p-6 shadow-lift">
        <div className="flex items-center gap-2">
          <AlertTriangle size={17} strokeWidth={2.5} className="text-signal" aria-hidden="true" />
          <h3 className="text-base font-extrabold lowercase">{title}</h3>
        </div>
        <p className="mt-3 text-sm text-ink-soft">{consequence}</p>
        <p className="mt-2 text-sm text-ink-soft">you can change it back at any time.</p>
        <div className="mt-5 flex gap-2">
          <button
            onClick={onConfirm}
            disabled={busy}
            className="rounded-btn bg-ink px-5 py-2.5 text-sm font-extrabold lowercase text-cream disabled:bg-cream-deep disabled:text-ink-soft disabled:cursor-not-allowed"
          >
            {busy ? "saving…" : `yes, ${to === "always" ? "do it automatically" : "allow it"}`}
          </button>
          <button
            onClick={onCancel}
            disabled={busy}
            className="rounded-btn px-5 py-2.5 text-sm font-bold lowercase text-ink-soft hover:bg-cream-deep"
          >
            keep it as it is
          </button>
        </div>
      </div>
    </div>
  );
}
