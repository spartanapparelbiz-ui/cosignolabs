"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { AlertTriangle, ChevronDown, Lock, ShieldCheck } from "lucide-react";
import {
  PRESETS,
  activePreset,
  explain,
  type PresetId,
  type TrustSetting,
} from "@/lib/trust/capabilities";
import { SkeletonRows } from "@/components/Skeleton";
import { BudgetPanel } from "@/components/trust/BudgetPanel";

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
  /** Only the answers this row can actually be set to. */
  options: TrustSetting[];
  setting: TrustSetting;
}

const LABEL: Record<TrustSetting, string> = {
  always: "always",
  ask: "ask me",
  never: "never",
};

/** The three groups the summary reads out, in order of how much they protect. */
const GROUPS: { setting: TrustSetting; mark: string; title: string }[] = [
  { setting: "always", mark: "✓", title: "Cosigno does these on its own" },
  { setting: "ask", mark: "🟡", title: "Cosigno asks you first" },
  { setting: "never", mark: "🔴", title: "Cosigno will not do these" },
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
    <div className="flex flex-col gap-10">
      {/* ONE decision, at the top. Most people will never open a single row. */}
      <section>
        <h2 className="text-xs font-extrabold uppercase tracking-[0.16em] text-ink-soft">
          Current trust level
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
                className={`rounded-card p-5 text-left transition-all duration-base ease-brand-out disabled:cursor-not-allowed ${
                  active
                    ? "bg-ink text-cream shadow-lift"
                    : "bg-surface/60 shadow-soft hover:-translate-y-0.5 hover:shadow-lift"
                }`}
              >
                <div className="flex items-center gap-2">
                  <span aria-hidden="true" className="text-base">
                    {p.dot}
                  </span>
                  <span className="text-lg font-extrabold">{p.title}</span>
                  {active && (
                    <span className="ml-auto text-[10px] font-extrabold uppercase tracking-[0.16em] opacity-70">
                      on
                    </span>
                  )}
                </div>
                <p
                  className={`mt-2 text-sm leading-snug ${active ? "text-cream/75" : "text-ink-soft"}`}
                >
                  {p.detail}
                </p>
                {p.recommended && !active && (
                  <span className="mt-3 inline-block rounded-pill bg-signal/15 px-2.5 py-0.5 text-[10px] font-extrabold uppercase tracking-wider text-signal">
                    recommended
                  </span>
                )}
              </button>
            );
          })}
        </div>
        {rows !== null && preset === null && (
          <p className="mt-2.5 text-xs text-ink-soft">
            your settings are your own — they don&apos;t match any of the three above.
          </p>
        )}
      </section>

      {/* What that means right now, at a glance, before any row is opened. */}
      <ProtectionSummary rows={rows} />

      {error && rows !== null && (
        <p className="rounded-btn bg-cream-deep px-4 py-3 text-sm font-semibold" role="alert">
          {error}
        </p>
      )}

      {/* One row per capability. */}
      <section className="flex flex-col gap-3">
        <h2 className="text-xs font-extrabold uppercase tracking-[0.16em] text-ink-soft">
          What cosigno may do
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
                  <p className="text-lg font-extrabold">{row.title}</p>
                  <p className="mt-0.5 text-sm leading-snug text-ink-soft">{row.detail}</p>
                </div>
                <Segmented row={row} busy={busy === row.id} onChoose={(s) => choose(row, s)} />
              </div>
              {justSet?.id === row.id && (
                <p className="mt-3 animate-fade-through rounded-btn bg-cream-deep px-3 py-2 text-xs font-semibold">
                  {explain(justSet.setting)}
                </p>
              )}
              {row.options.length === 1 && (
                <p className="mt-3 inline-flex items-center gap-1.5 text-xs text-ink-soft">
                  <Lock size={11} strokeWidth={2.6} aria-hidden="true" />
                  cosigno has no way to do this at all. it isn&apos;t a setting you can turn on.
                </p>
              )}
              {row.pinned && row.options.length > 1 && (
                <p className="mt-3 inline-flex items-center gap-1.5 text-xs text-ink-soft">
                  <Lock size={11} strokeWidth={2.6} aria-hidden="true" />
                  cosigno can never do this on its own — that isn&apos;t a setting you can turn
                  off.
                </p>
              )}
            </div>
          ))
        )}
      </section>

      <BudgetPanel />

      {/* What holds regardless of anything set above. */}
      <section className="rounded-card bg-surface/60 p-5 shadow-soft">
        <div className="flex items-center gap-2">
          <ShieldCheck size={16} strokeWidth={2.4} className="text-signal" aria-hidden="true" />
          <h2 className="text-sm font-extrabold">True no matter what you choose</h2>
        </div>
        <ul className="mt-3 flex flex-col gap-2 text-sm text-ink-soft">
          <li>payments and deletion always stop and wait for you, and always will.</li>
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

      <AdvancedControls />

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
 * The whole configuration, read back in three lists.
 *
 * Someone who has never used an AI agent gets their answer here without
 * touching a control: this is what it does on its own, this is what it asks
 * about, this is what it will not do. The rows below are for changing it; this
 * is for understanding it.
 */
function ProtectionSummary({ rows }: { rows: Row[] | null }) {
  if (rows === null) return null;
  const groups = GROUPS.map((g) => ({
    ...g,
    items: rows.filter((r) => r.setting === g.setting),
  })).filter((g) => g.items.length > 0);

  return (
    <section className="grid gap-3 sm:grid-cols-3">
      {groups.map((g) => (
        <div key={g.setting} className="rounded-card bg-surface/60 p-4 shadow-soft">
          <h3 className="text-xs font-extrabold uppercase tracking-[0.14em] text-ink-soft">
            {g.title}
          </h3>
          <ul className="mt-2.5 flex flex-col gap-1.5">
            {g.items.map((r) => (
              <li key={r.id} className="flex items-start gap-2 text-sm font-semibold">
                <span aria-hidden="true" className="mt-px text-xs">
                  {g.mark}
                </span>
                {r.title}
              </li>
            ))}
          </ul>
        </div>
      ))}
    </section>
  );
}

/**
 * Everything a normal person never needs.
 *
 * None of it is removed — MCP servers, custom APIs and standing rules are all
 * real, working features, and someone who set one up must be able to find it
 * again. They're behind a disclosure because eight capability rows and a
 * connector permission matrix on the same screen turns a page about trust into
 * an admin console, and an admin console is the thing people don't read.
 */
function AdvancedControls() {
  const [open, setOpen] = useState(false);
  return (
    <section className="rounded-card bg-surface/40 p-4">
      <button
        onClick={() => setOpen(!open)}
        aria-expanded={open}
        className="flex w-full items-center gap-2 text-left text-sm font-bold text-ink-soft transition-colors hover:text-ink"
      >
        <ChevronDown
          size={15}
          strokeWidth={2.6}
          aria-hidden="true"
          className={`transition-transform duration-fast ${open ? "rotate-180" : ""}`}
        />
        Advanced controls
      </button>
      {open && (
        <div className="mt-3 flex flex-col gap-2 animate-fade-through">
          <p className="text-xs text-ink-soft">
            per-app and per-tool controls. the settings above already cover everything
            cosigno can do — these narrow it further for one app or one rule.
          </p>
          {[
            {
              href: "/app/connections",
              title: "Connected apps, MCP servers and custom APIs",
              detail: "which tools each connection exposes, and what each one may be used for.",
            },
            {
              href: "/app/connections",
              title: "Standing rules",
              detail:
                'plain-language limits like "never post to #announcements". rules only ever tighten what you set above.',
            },
            {
              href: "/app/activity",
              title: "Every change to these settings",
              detail: "who changed what, and when. nothing here is silent.",
            },
          ].map((l) => (
            <Link
              key={l.title}
              href={l.href}
              className="rounded-btn bg-surface/70 px-4 py-3 transition-all duration-fast hover:-translate-y-px hover:shadow-soft"
            >
              <p className="text-sm font-bold">{l.title}</p>
              <p className="mt-0.5 text-xs text-ink-soft">{l.detail}</p>
            </Link>
          ))}
        </div>
      )}
    </section>
  );
}

/**
 * The three-way control. An answer a row cannot be set to is simply absent
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
  return (
    <div
      role="radiogroup"
      aria-label={`${row.title} — how cosigno should handle this`}
      className="flex shrink-0 gap-1 rounded-pill bg-cream-deep p-1"
    >
      {row.options.map((value) => {
        const active = row.setting === value;
        return (
          <button
            key={value}
            role="radio"
            aria-checked={active}
            disabled={busy || row.options.length === 1}
            onClick={() => onChoose(value)}
            className={`rounded-pill px-4 py-2 text-sm font-bold lowercase transition-all duration-fast ease-brand-out disabled:cursor-default ${
              active
                ? value === "never"
                  ? "bg-signal text-ink shadow-soft"
                  : "bg-ink text-cream shadow-soft"
                : "text-ink-soft hover:text-ink"
            }`}
          >
            {LABEL[value]}
          </button>
        );
      })}
    </div>
  );
}

const WHAT_CHANGES: Record<string, string> = {
  "never→ask":
    "cosigno will start proposing this again. it still waits for your approval every time.",
  "never→always": "cosigno will do this on its own, without asking and without waiting.",
  "ask→always":
    "cosigno will stop asking. it will do this on its own, immediately, every time.",
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
      className="fixed inset-0 z-50 flex animate-overlay-in items-center justify-center bg-ink/40 px-4 backdrop-blur-md"
      role="dialog"
      aria-modal="true"
      aria-label={`change ${title}`}
    >
      <div className="w-full max-w-sm origin-center animate-modal-in rounded-card bg-cream p-6 shadow-lift">
        <div className="flex items-center gap-2">
          <AlertTriangle size={17} strokeWidth={2.5} className="text-signal" aria-hidden="true" />
          <h3 className="text-base font-extrabold">{title}</h3>
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
