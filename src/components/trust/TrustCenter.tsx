"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  BookOpen,
  Check,
  ChevronDown,
  CreditCard,
  Link2,
  Lock,
  PenLine,
  Send,
  Rocket,
  SquarePen,
  Trash2,
  type LucideIcon,
} from "lucide-react";
import {
  PRESETS,
  activePreset,
  explain,
  type PresetId,
  type TrustSetting,
} from "@/lib/trust/capabilities";
import { SkeletonRows } from "@/components/Skeleton";
import { BudgetPanel } from "@/components/trust/BudgetPanel";
import { EmptyState, SectionLabel } from "@/components/ui/Page";
import { btn, card, dot } from "@/components/ui/styles";

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
  always: "Always",
  ask: "Ask me",
  never: "Never",
};

/**
 * One line-drawn glyph per capability, in the same family and at the same
 * weight as every other icon in the product. This page used to wear a grid of
 * full-color emoji in 56px tiles, which is the single loudest thing a settings
 * screen can do and told the reader nothing a word wasn't already saying.
 */
const CAPABILITY_ICON: Record<string, LucideIcon> = {
  read: BookOpen,
  create: PenLine,
  send: Send,
  edit: SquarePen,
  publish: Rocket,
  connect: Link2,
  money: CreditCard,
  delete: Trash2,
  security: Lock,
};

/** The three groups the summary reads out, in order of how much they protect. */
const GROUPS: { setting: TrustSetting; title: string; tone: "positive" | "signal" | "danger" }[] = [
  { setting: "always", title: "On its own", tone: "positive" },
  { setting: "ask", title: "Asks you first", tone: "signal" },
  { setting: "never", title: "Never", tone: "danger" },
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
      <EmptyState
        title="That didn't load"
        description={error}
        action={
          <button onClick={load} className={btn("secondary", "md")}>
            Try again
          </button>
        }
      />
    );
  }

  return (
    <div className="flex flex-col gap-14">
      {/* ONE decision, at the top. Most people will never open a single row. */}
      <section>
        <SectionLabel className="mb-4">Trust level</SectionLabel>
        <div className="grid gap-3 sm:grid-cols-3">
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
                    ? "bg-ink text-cream shadow-rest"
                    : "bg-surface shadow-rest hover:-translate-y-px hover:shadow-raise"
                }`}
              >
                <div className="flex items-center gap-2">
                  <span className="t-title">{p.title}</span>
                  {active && (
                    <Check size={14} strokeWidth={2.4} className="ml-auto" aria-hidden="true" />
                  )}
                  {p.recommended && !active && (
                    <span className="t-caption ml-auto">suggested</span>
                  )}
                </div>
                <p className={`mt-2 text-[0.8125rem] leading-relaxed ${active ? "text-cream/70" : "text-ink-soft"}`}>
                  {p.detail}
                </p>
              </button>
            );
          })}
        </div>
        {rows !== null && preset === null && (
          <p className="t-caption mt-3">
            Your settings are your own — they don&apos;t match any of the three above.
          </p>
        )}
      </section>

      {/* What that means right now, at a glance, before any row is opened. */}
      <ProtectionSummary rows={rows} />

      {error && rows !== null && (
        <p className="t-body border-l-2 border-danger pl-3.5 text-danger" role="alert">
          {error}
        </p>
      )}

      {/* One row per capability. Rows, not cards: nine cards down a page is a
          gallery, and this is a list of nine questions with the same shape. */}
      <section>
        <SectionLabel className="mb-2">What cosigno may do</SectionLabel>
        {rows === null ? (
          <SkeletonRows rows={5} />
        ) : (
          <div className="flex flex-col">
            {rows.map((row, i) => {
              const Icon = CAPABILITY_ICON[row.id] ?? Lock;
              return (
                <div
                  key={row.id}
                  className={`py-5 ${i > 0 ? "border-t border-line/40" : ""}`}
                >
                  <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
                    <span className="mt-0.5 shrink-0 self-start text-ink-soft sm:mt-0 sm:self-center" aria-hidden="true">
                      <Icon size={17} strokeWidth={1.9} />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="t-title">{row.title}</p>
                      <p className="t-caption mt-0.5">{row.detail}</p>
                    </div>
                    <Segmented row={row} busy={busy === row.id} onChoose={(s) => choose(row, s)} />
                  </div>
                  {justSet?.id === row.id && (
                    <p className="t-caption mt-3 animate-fade-through pl-0 sm:pl-[29px]">
                      {explain(justSet.setting)}
                    </p>
                  )}
                  {row.options.length === 1 && (
                    <p className="t-caption mt-3 sm:pl-[29px]">
                      cosigno has no way to do this at all. It isn&apos;t a setting you can
                      turn on.
                    </p>
                  )}
                  {row.pinned && row.options.length > 1 && (
                    <p className="t-caption mt-3 sm:pl-[29px]">
                      cosigno can never do this on its own. That isn&apos;t a setting you can
                      turn off.
                    </p>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </section>

      <BudgetPanel />

      {/* What holds regardless of anything set above. */}
      <section>
        <SectionLabel className="mb-3">True whatever you choose</SectionLabel>
        <ul className="flex flex-col gap-2">
          <li className="t-body">Payments and deletion always stop and wait for you.</li>
          <li className="t-body">
            Every action is recorded — what it was, when, and whether you approved it.
          </li>
          <li className="t-body">cosigno can never give itself more permission than you set here.</li>
          <li className="t-body">
            Emergency stop halts everything at once, including work already approved and
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
    <section className="grid gap-x-8 gap-y-7 sm:grid-cols-3">
      {groups.map((g) => (
        <div key={g.setting}>
          <h3 className="t-eyebrow">{g.title}</h3>
          <ul className="mt-2.5 flex flex-col gap-1.5">
            {g.items.map((r) => (
              <li key={r.id} className="flex items-center gap-2.5 text-[0.875rem]">
                <span className={dot(g.tone)} aria-hidden="true" />
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
    <section>
      <button
        onClick={() => setOpen(!open)}
        aria-expanded={open}
        className="flex w-full items-center gap-2 text-left text-[0.875rem] text-ink-soft transition-colors duration-fast hover:text-ink"
      >
        <ChevronDown
          size={15}
          strokeWidth={2}
          aria-hidden="true"
          className={`transition-transform duration-base ease-brand-out ${open ? "rotate-180" : ""}`}
        />
        Advanced controls
      </button>
      {open && (
        <div className="mt-4 flex animate-fade-through flex-col">
          <p className="t-caption mb-3">
            Per-app and per-tool limits. The settings above already cover everything
            cosigno can do; these narrow it further for one app or one rule.
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
              className="rounded-btn px-3 py-2.5 transition-colors duration-fast hover:bg-ink/[0.035]"
            >
              <p className="text-[0.875rem]">{l.title}</p>
              <p className="t-caption mt-0.5">{l.detail}</p>
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
      className="flex shrink-0 gap-0.5 rounded-pill bg-ink/[0.05] p-1"
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
            className={`rounded-pill px-3.5 py-1.5 text-[0.8125rem] transition-all duration-fast ease-brand-out disabled:cursor-default ${
              active
                ? "bg-surface font-semibold text-ink shadow-rest"
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
      className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 px-4"
      role="dialog"
      aria-modal="true"
      aria-label={`change ${title}`}
    >
      <div className="w-full max-w-md origin-center animate-modal-in rounded-card bg-surface p-7 shadow-overlay">
        <h3 className="t-title">{title}</h3>
        <p className="t-body mt-3">{consequence}</p>
        <p className="t-caption mt-2">You can change it back at any time.</p>
        <div className="mt-7 flex gap-1.5">
          <button onClick={onConfirm} disabled={busy} className={btn("primary", "md")}>
            {busy ? "Saving…" : to === "always" ? "Do it automatically" : "Allow it"}
          </button>
          <button onClick={onCancel} disabled={busy} className={btn("ghost", "md")}>
            Keep as it is
          </button>
        </div>
      </div>
    </div>
  );
}
