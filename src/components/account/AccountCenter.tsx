"use client";

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import {
  Boxes,
  Gauge,
  Lock,
  ShieldCheck,
  SlidersHorizontal,
  UserRound,
} from "lucide-react";
import type { AccountAuditRecord, ActionRecord, CategoryMeta, Tier, UsageRecord } from "@/lib/types";
import { SkeletonRows } from "@/components/Skeleton";
import { useKeyboardHints } from "@/lib/useKeyboardHints";
import { useDisplayName, initialsFor } from "@/lib/theme";
import { ThemeToggle } from "@/components/ThemeToggle";
import { UsageRing } from "./UsageRing";
import { ConnectionsPanel } from "./ConnectionsPanel";

type CategoryWithTier = CategoryMeta & { tier: Tier };

const TABS = [
  { id: "profile", label: "profile", icon: UserRound },
  { id: "permissions", label: "permissions", icon: SlidersHorizontal },
  { id: "usage", label: "plan & usage", icon: Gauge },
  { id: "integrations", label: "connections", icon: Boxes },
  { id: "security", label: "security", icon: ShieldCheck },
] as const;

type TabId = (typeof TABS)[number]["id"];

export interface PlanInfo {
  id: string;
  name: string;
  status: string;
  interval: string | null;
  activeUntil: number | null;
  cancelAtPeriodEnd: boolean;
  pastDue: boolean;
  inGrace: boolean;
  upgradeTo: string | null;
  refundEligible?: boolean;
  refundWindowDays?: number;
}

export function AccountCenter({ initialTab = "profile" }: { initialTab?: TabId }) {
  const [tab, setTab] = useState<TabId>(initialTab);
  const [categories, setCategories] = useState<CategoryWithTier[] | null>(null);
  const [usage, setUsage] = useState<UsageRecord | null>(null);
  const [plan, setPlan] = useState<PlanInfo | null>(null);
  const [actions, setActions] = useState<ActionRecord[] | null>(null);
  const [err, setErr] = useState(false);

  function load() {
    setErr(false);
    fetch("/api/settings/tiers").then((r) => r.json()).then((d) => setCategories(d.categories ?? [])).catch(() => setErr(true));
    fetch("/api/usage").then((r) => r.json()).then((d) => { setUsage(d.usage ?? null); setPlan(d.plan ?? null); }).catch(() => setErr(true));
    fetch("/api/activity?limit=1000").then((r) => r.json()).then((d) => setActions(d.actions ?? [])).catch(() => setActions([]));
  }
  useEffect(load, []);

  // Deep-link support: ?tab=<id> opens that tab (e.g. the OAuth callback
  // returns to ?tab=integrations after a connect attempt).
  useEffect(() => {
    const t = new URLSearchParams(window.location.search).get("tab");
    if (t && TABS.some((x) => x.id === t)) setTab(t as TabId);
  }, []);

  return (
    <div className="mt-6 flex flex-1 flex-col gap-5 md:flex-row md:gap-8">
      <nav
        aria-label="account sections"
        className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 md:mx-0 md:w-48 md:flex-col md:overflow-visible md:px-0 md:pb-0"
      >
        {TABS.map((t) => {
          const Icon = t.icon;
          const active = tab === t.id;
          return (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              aria-current={active ? "page" : undefined}
              className={`inline-flex shrink-0 items-center gap-2 rounded-btn px-3.5 py-2 text-sm font-bold lowercase transition-all duration-fast ease-brand-out ${
                active ? "bg-ink text-cream shadow-soft" : "text-ink-soft hover:bg-cream-deep"
              }`}
            >
              <Icon size={15} strokeWidth={2.4} aria-hidden="true" />
              {t.label}
            </button>
          );
        })}
      </nav>

      <div key={tab} className="flex min-w-0 flex-1 flex-col animate-fade-through">
        {tab === "profile" && <ProfilePanel />}
        {tab === "permissions" && (
          <PermissionsPanel categories={categories} setCategories={setCategories} error={err} retry={load} />
        )}
        {tab === "usage" && <UsagePanel usage={usage} plan={plan} actions={actions} />}
        {tab === "integrations" && <IntegrationsPanel />}
        {tab === "security" && <SecurityPanel actions={actions} />}
      </div>
    </div>
  );
}

function PanelHeading({ title, sub }: { title: string; sub: string }) {
  return (
    <div className="mb-4">
      <h2 className="text-lg font-extrabold lowercase">{title}</h2>
      <p className="mt-0.5 text-sm text-ink-soft">{sub}</p>
    </div>
  );
}

/** Tier-3-style confirmation modal: scales in, requires typed word, shakes on mismatch. */
function ConfirmModal({
  title,
  body,
  confirmWord,
  danger,
  busy,
  onConfirm,
  onCancel,
}: {
  title: string;
  body: string;
  confirmWord: string;
  danger?: boolean;
  busy?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const [typed, setTyped] = useState("");
  const [shake, setShake] = useState(false);
  const ok = typed.trim().toLowerCase() === confirmWord.toLowerCase();
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 px-4" role="dialog" aria-modal="true">
      <div className="w-full max-w-sm origin-center animate-modal-in rounded-card bg-cream p-5 shadow-lift">
        <h3 className="text-base font-extrabold lowercase">{title}</h3>
        <p className="mt-1.5 text-sm text-ink-soft">{body}</p>
        <p className="mt-3 text-xs font-bold lowercase">
          type <code className="rounded bg-cream-deep px-1.5 py-0.5 font-mono">{confirmWord}</code> to confirm
        </p>
        <input
          autoFocus
          value={typed}
          onChange={(e) => setTyped(e.target.value)}
          className={`mt-2 w-full rounded-btn bg-cream-deep px-3 py-2 text-sm ${shake ? "animate-shake-x" : ""}`}
          aria-label={`type ${confirmWord} to confirm`}
        />
        <div className="mt-4 flex gap-2">
          <button
            onClick={() => {
              if (!ok) {
                setShake(true);
                setTimeout(() => setShake(false), 260);
                return;
              }
              onConfirm();
            }}
            disabled={busy}
            className={`rounded-btn px-4 py-2 text-sm font-extrabold text-cream disabled:opacity-60 ${danger ? "bg-ink" : "bg-signal !text-ink"}`}
          >
            {busy ? "working…" : title}
          </button>
          <button onClick={onCancel} disabled={busy} className="rounded-btn px-4 py-2 text-sm font-bold lowercase text-ink-soft hover:bg-cream-deep">
            cancel
          </button>
        </div>
      </div>
    </div>
  );
}

function ProfilePanel() {
  const [name, setName] = useDisplayName();
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [keyHints, setKeyHints] = useKeyboardHints();
  const display = name.trim() || "operator";

  function signOut() {
    const w = window as unknown as { Clerk?: { signOut: (o?: { redirectUrl?: string }) => Promise<void> } };
    if (w.Clerk?.signOut) w.Clerk.signOut({ redirectUrl: "/" }).catch(() => (window.location.href = "/"));
    else window.location.href = "/";
  }

  async function del() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/account", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ confirmation: "delete" }),
      });
      if (!res.ok) {
        const b = await res.json().catch(() => ({}));
        throw new Error(b.message || "couldn't delete the account.");
      }
      window.location.href = "/";
    } catch (e) {
      setError(e instanceof Error ? e.message : "couldn't delete the account.");
      setBusy(false);
      setConfirming(false);
    }
  }

  return (
    <section>
      <PanelHeading title="profile" sub="make cosigno yours — your name, your look." />

      {/* Identity card */}
      <div className="flex items-center gap-4 rounded-card bg-surface/60 p-5 shadow-soft">
        <div className="flex h-14 w-14 items-center justify-center rounded-full bg-ink text-xl font-extrabold uppercase text-cream">
          {initialsFor(display)}
        </div>
        <div className="min-w-0">
          <p className="truncate font-bold lowercase">{display}</p>
          <p className="truncate text-sm text-ink-soft">your cosigno operator</p>
        </div>
        <button
          onClick={signOut}
          className="ml-auto rounded-btn px-4 py-1.5 text-sm font-bold lowercase ring-1 ring-inset ring-ink transition-all duration-fast hover:-translate-y-px hover:bg-cream-deep"
        >
          sign out
        </button>
      </div>

      {/* Personalize: display name */}
      <div className="mt-6 rounded-card bg-surface/60 p-5 shadow-soft">
        <p className="text-sm font-bold lowercase">display name</p>
        <p className="mt-0.5 text-xs text-ink-soft">
          what cosigno calls you across the app. just for you — stored on this device.
        </p>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={40}
          placeholder="operator"
          aria-label="display name"
          className="mt-3 w-full max-w-xs rounded-btn bg-cream-deep px-3 py-2 text-sm font-semibold lowercase text-ink placeholder:text-ink-soft/60"
        />
      </div>

      {/* Personalize: theme */}
      <div className="mt-6 rounded-card bg-surface/60 p-5 shadow-soft">
        <p className="text-sm font-bold lowercase">appearance</p>
        <p className="mt-0.5 text-xs text-ink-soft">
          light, dark, or match your device. changes instantly.
        </p>
        <div className="mt-3">
          <ThemeToggle />
        </div>
      </div>

      {/* Preferences */}
      <div className="mt-6 flex items-center gap-4 rounded-card bg-surface/60 p-4 shadow-soft">
        <div className="min-w-0 flex-1">
          <p className="text-sm font-bold lowercase">keyboard shortcut hints</p>
          <p className="mt-0.5 text-xs text-ink-soft">
            show the <kbd className="rounded bg-cream-deep px-1 font-mono">a</kbd> approve ·{" "}
            <kbd className="rounded bg-cream-deep px-1 font-mono">v</kbd> veto footer on focused action cards.
          </p>
        </div>
        <button
          onClick={() => setKeyHints(!keyHints)}
          role="switch"
          aria-checked={keyHints}
          aria-label="toggle keyboard shortcut hints"
          className={`relative h-6 w-11 shrink-0 rounded-pill transition-colors duration-fast ${
            keyHints ? "bg-signal" : "bg-line"
          }`}
        >
          <span
            className={`absolute top-0.5 h-5 w-5 rounded-full bg-cream shadow-soft transition-transform duration-fast ease-brand-out ${
              keyHints ? "translate-x-[22px]" : "translate-x-0.5"
            }`}
          />
        </button>
      </div>

      {/* Danger zone */}
      <div className="mt-8 rounded-card ring-1 ring-inset ring-ink/30 p-5">
        <h3 className="text-sm font-extrabold lowercase">danger zone</h3>
        <p className="mt-1 text-sm text-ink-soft">
          deleting your account cancels any subscription and permanently erases
          your sessions, actions, audit trail, and settings. this can&apos;t be undone.
        </p>
        {error && (
          <p className="mt-2 rounded-btn bg-cream-deep px-3 py-2 text-xs font-semibold" role="alert">{error}</p>
        )}
        <button
          onClick={() => setConfirming(true)}
          className="mt-3 rounded-btn px-4 py-2 text-sm font-bold lowercase ring-1 ring-inset ring-ink transition-all duration-fast hover:-translate-y-px hover:bg-ink hover:text-cream"
        >
          delete account
        </button>
      </div>

      {confirming && (
        <ConfirmModal
          title="delete account"
          body="this cancels your subscription and erases all your data."
          confirmWord="delete"
          danger
          busy={busy}
          onConfirm={del}
          onCancel={() => setConfirming(false)}
        />
      )}
    </section>
  );
}

const COLUMNS: { tier: Tier; label: string; hint: string }[] = [
  { tier: 1, label: "auto", hint: "read-only / reversible — runs without asking" },
  { tier: 2, label: "approve", hint: "waits for your signature" },
  { tier: 3, label: "locked", hint: "always requires typed confirmation" },
];

function PermissionsPanel({
  categories,
  setCategories,
  error,
  retry,
}: {
  categories: CategoryWithTier[] | null;
  setCategories: React.Dispatch<React.SetStateAction<CategoryWithTier[] | null>>;
  error: boolean;
  retry: () => void;
}) {
  const [msg, setMsg] = useState<string | null>(null);
  const chipRefs = useRef<Map<string, HTMLDivElement>>(new Map());
  const prevRects = useRef<Map<string, DOMRect>>(new Map());

  // FLIP: after a chip moves columns, invert to its old position then animate
  // to zero so it visibly flies. Transform-only; respects reduced motion.
  useLayoutEffect(() => {
    const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    for (const [key, el] of chipRefs.current) {
      const prev = prevRects.current.get(key);
      const next = el.getBoundingClientRect();
      if (prev && !reduce) {
        const dx = prev.left - next.left;
        const dy = prev.top - next.top;
        if (dx || dy) {
          el.style.transition = "none";
          el.style.transform = `translate(${dx}px, ${dy}px)`;
          requestAnimationFrame(() => {
            el.style.transition = "transform 320ms cubic-bezier(0.34,1.56,0.64,1)";
            el.style.transform = "";
          });
        }
      }
      prevRects.current.set(key, next);
    }
  }, [categories]);

  async function move(category: string, tier: Tier) {
    setMsg(null);
    const before = categories;
    // optimistic
    setCategories((cs) => cs?.map((c) => (c.category === category ? { ...c, tier } : c)) ?? null);
    const res = await fetch("/api/settings/tiers", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ category, tier }),
    });
    if (!res.ok) {
      const b = await res.json().catch(() => ({}));
      setMsg(b.message ?? "that tier didn't update — reverted.");
      setCategories(before ?? null); // rollback
    }
  }

  if (error && categories === null) {
    return (
      <section>
        <PanelHeading title="permissions" sub="how much rope the operator gets." />
        <div className="rounded-card bg-surface/60 p-5 text-center shadow-soft">
          <p className="text-sm font-semibold text-ink-soft">couldn&apos;t load your settings.</p>
          <button onClick={retry} className="mt-3 rounded-btn bg-ink px-4 py-1.5 text-sm font-bold lowercase text-cream">retry</button>
        </div>
      </section>
    );
  }

  return (
    <section>
      <PanelHeading title="permissions" sub="how much rope the operator gets. locked stays locked, and every change is logged in security." />
      {msg && <p className="mb-3 rounded-btn bg-cream-deep px-3 py-2 text-sm font-semibold" role="alert">{msg}</p>}
      <div className="grid gap-3 sm:grid-cols-3">
        {COLUMNS.map((col) => (
          <div key={col.tier} className="rounded-card bg-surface/50 p-3 shadow-soft">
            <div className="flex items-center gap-1.5">
              {col.tier === 3 && <Lock size={12} strokeWidth={2.5} aria-hidden="true" />}
              <h3 className="text-xs font-extrabold uppercase tracking-widest text-ink-soft">{col.label}</h3>
              {col.tier === 3 && (
                <span className="ml-auto cursor-help text-[10px] text-ink-soft underline decoration-dotted" title="locked actions always require typed confirmation.">why?</span>
              )}
            </div>
            <div className="mt-3 flex flex-col gap-2">
              {categories === null ? (
                <SkeletonRows rows={2} />
              ) : (
                categories.filter((c) => c.tier === col.tier).map((c) => (
                  <div
                    key={c.category}
                    ref={(el) => { if (el) chipRefs.current.set(c.category, el); }}
                    className="rounded-btn bg-cream-deep px-3 py-2"
                  >
                    <p className="text-sm font-bold lowercase">{c.label}</p>
                    <p className="mt-0.5 text-[11px] leading-snug text-ink-soft">{c.description}</p>
                    {!c.pinned ? (
                      <div className="mt-2 flex gap-1.5">
                        {([1, 2] as Tier[]).filter((t) => t !== col.tier).map((t) => (
                          <button
                            key={t}
                            onClick={() => move(c.category, t)}
                            className="rounded-pill bg-ink px-2.5 py-0.5 text-[10px] font-bold lowercase text-cream transition-transform duration-fast hover:-translate-y-px"
                            aria-label={`move ${c.label} to ${t === 1 ? "auto" : "approve"}`}
                          >
                            → {t === 1 ? "auto" : "approve"}
                          </button>
                        ))}
                      </div>
                    ) : (
                      <span className="mt-2 inline-flex items-center gap-1 text-[10px] font-bold lowercase text-ink-soft">
                        <Lock size={9} strokeWidth={2.5} aria-hidden="true" /> pinned
                      </span>
                    )}
                  </div>
                ))
              )}
              {categories?.filter((c) => c.tier === col.tier).length === 0 && (
                <p className="rounded-btn border border-dashed border-line px-3 py-4 text-center text-[11px] text-ink-soft">nothing here</p>
              )}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

function fmtDate(unixOrIso: number | string): string {
  const d = typeof unixOrIso === "number" ? new Date(unixOrIso * 1000) : new Date(unixOrIso);
  return d.toLocaleDateString([], { month: "long", day: "numeric", year: "numeric" });
}

/** 30-day actions/day sparkline derived from real action timestamps. */
function Sparkline({ actions }: { actions: ActionRecord[] }) {
  const days = 30;
  const counts = useMemo(() => {
    const buckets = new Array(days).fill(0);
    const now = Date.now();
    for (const a of actions) {
      const age = Math.floor((now - new Date(a.created_at).getTime()) / 86400000);
      if (age >= 0 && age < days) buckets[days - 1 - age] += 1;
    }
    return buckets;
  }, [actions]);
  const max = Math.max(1, ...counts);
  const W = 220, H = 40, step = W / (days - 1);
  const pts = counts.map((c, i) => `${(i * step).toFixed(1)},${(H - (c / max) * H).toFixed(1)}`).join(" ");
  const total = counts.reduce((a, b) => a + b, 0);
  return (
    <div>
      <p className="text-xs font-bold lowercase text-ink-soft">last 30 days · {total} actions</p>
      <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} className="mt-1.5 w-full" preserveAspectRatio="none" aria-hidden="true">
        <polyline points={pts} fill="none" stroke="rgb(var(--c-ink))" strokeWidth="1.6" strokeLinejoin="round" strokeLinecap="round" />
        {counts.map((c, i) => c === max && max > 0 ? (
          <circle key={i} cx={(i * step).toFixed(1)} cy={(H - (c / max) * H).toFixed(1)} r="2.4" fill="rgb(var(--c-signal))" />
        ) : null)}
      </svg>
    </div>
  );
}

function UsagePanel({ usage, plan, actions }: { usage: UsageRecord | null; plan: PlanInfo | null; actions: ActionRecord[] | null }) {
  const [busy, setBusy] = useState<"upgrade" | "portal" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirmRefund, setConfirmRefund] = useState(false);
  const [refunding, setRefunding] = useState(false);
  const [retention, setRetention] = useState<"idle" | "offer" | "saved">("idle");
  const [retentionBusy, setRetentionBusy] = useState(false);

  async function doRefund() {
    setRefunding(true);
    setError(null);
    try {
      const res = await fetch("/api/billing/refund", { method: "POST" });
      const b = await res.json();
      if (!res.ok) throw new Error(b.message || "we couldn't process that refund.");
      window.location.reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : "we couldn't process that refund.");
      setRefunding(false);
      setConfirmRefund(false);
    }
  }

  async function takeRetention() {
    setRetentionBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/billing/retention", { method: "POST" });
      const b = await res.json();
      if (!res.ok) throw new Error(b.message || "that offer isn't available.");
      setRetention("saved");
    } catch (e) {
      setError(e instanceof Error ? e.message : "that offer isn't available.");
    } finally {
      setRetentionBusy(false);
    }
  }

  const { reset, daysLeft } = useMemo(() => {
    if (!usage) return { reset: "", daysLeft: undefined as number | undefined };
    const d = new Date(usage.cycle_start);
    const resetDate = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1));
    const days = Math.max(0, Math.ceil((resetDate.getTime() - Date.now()) / 86_400_000));
    return {
      reset: resetDate.toLocaleDateString([], { month: "long", day: "numeric" }),
      daysLeft: days,
    };
  }, [usage]);

  async function go(kind: "upgrade" | "portal") {
    setError(null);
    setBusy(kind);
    try {
      if (kind === "portal") {
        // Portal stays for managing an existing subscription (update card, etc).
        const res = await fetch("/api/billing/portal", { method: "POST" });
        const b = await res.json();
        if (!res.ok) throw new Error(b.message || "couldn't open billing.");
        window.location.href = b.url;
      } else {
        // First purchase / upgrade goes to the embedded checkout with the plan
        // preselected — same giant-card experience as pricing.
        const target = plan?.upgradeTo ?? "pro";
        window.location.href = `/checkout?plan=${target}&interval=monthly`;
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "something went wrong.");
      setBusy(null);
    }
  }

  const isFree = !plan || plan.id === "free";

  return (
    <section>
      <PanelHeading title="plan & usage" sub="what you've spent this cycle, and what's next." />
      {plan?.pastDue && (
        <div className="mb-4 rounded-card bg-ink px-4 py-3 text-sm font-semibold text-cream">
          your payment didn&apos;t go through — update your card to keep {plan.name}.{" "}
          <button onClick={() => go("portal")} className="underline decoration-signal underline-offset-2">update card</button>
        </div>
      )}
      {!usage || !plan ? (
        <SkeletonRows rows={3} />
      ) : (
        <div className="flex flex-col gap-5">
          <div className="flex flex-col gap-5 sm:flex-row sm:items-start">
            <div className="rounded-card bg-surface/60 p-6 text-center shadow-soft">
              <UsageRing used={usage.actions_executed} limit={usage.limit} daysLeft={daysLeft} resetLabel={reset} />
              <p className="mt-2 text-xs lowercase text-ink-soft">actions used this cycle · hover for detail</p>
            </div>
            <div className="flex-1 rounded-card bg-surface/60 p-5 shadow-soft">
              <div className="flex items-center justify-between">
                <span className="text-sm font-bold lowercase">{plan.name}</span>
                <span className="rounded-pill bg-cream-deep px-3 py-1 text-[11px] font-bold lowercase text-ink-soft">current plan</span>
              </div>
              <p className="mt-2 text-sm text-ink-soft">
                {usage.limit.toLocaleString()} actions / cycle · resets {reset}{plan.interval ? ` · ${plan.interval}` : ""}
              </p>
              {plan.cancelAtPeriodEnd && plan.activeUntil && (
                <p className="mt-1 text-sm font-semibold">{plan.name} until {fmtDate(plan.activeUntil)}, then free.</p>
              )}
              {isFree ? (
                <div className="mt-4 rounded-btn bg-cream-deep p-4">
                  <p className="text-sm font-bold lowercase">pro unlocks more room</p>
                  <ul className="mt-2 flex flex-col gap-1 text-xs text-ink-soft">
                    <li>1,000 actions / month</li><li>unlimited integrations</li><li>CSV export &amp; priority planning</li>
                  </ul>
                  <button onClick={() => go("upgrade")} disabled={busy === "upgrade"} className="group relative mt-3 inline-flex overflow-hidden rounded-btn bg-ink px-5 py-2.5 text-sm font-extrabold text-cream disabled:opacity-60">
                    <span className="absolute inset-0 origin-left scale-x-0 bg-signal transition-transform duration-[280ms] ease-brand-out group-hover:scale-x-100" />
                    <span className="relative transition-colors group-hover:text-ink">{busy === "upgrade" ? "starting…" : "upgrade to pro — $29/mo"}</span>
                  </button>
                </div>
              ) : (
                <>
                  <div className="mt-4 flex flex-wrap gap-2">
                    {plan.upgradeTo && (
                      <button onClick={() => go("upgrade")} disabled={busy === "upgrade"} className="rounded-btn bg-signal px-5 py-2.5 text-sm font-extrabold text-ink transition-transform duration-fast hover:-translate-y-px disabled:opacity-60">
                        {busy === "upgrade" ? "starting…" : `upgrade to ${plan.upgradeTo}`}
                      </button>
                    )}
                    <button onClick={() => go("portal")} disabled={busy === "portal"} className="rounded-btn ring-1 ring-inset ring-ink px-5 py-2.5 text-sm font-bold lowercase transition-all duration-fast hover:-translate-y-px hover:bg-cream-deep disabled:opacity-60">
                      {busy === "portal" ? "opening…" : "manage billing"}
                    </button>
                    {retention === "idle" && (
                      <button onClick={() => setRetention("offer")} className="rounded-btn px-4 py-2.5 text-sm font-bold lowercase text-ink-soft transition-colors hover:bg-cream-deep">
                        cancel plan
                      </button>
                    )}
                  </div>

                  {/* cancel-flow retention: 50% off next 2 months before the portal */}
                  {retention === "offer" && (
                    <div className="mt-3 animate-modal-in rounded-card bg-cream-deep p-4">
                      <p className="text-sm font-bold">before you go — keep {plan.name} at half price.</p>
                      <p className="mt-1 text-xs text-ink-soft">50% off your next 2 months. one tap, stays on your card.</p>
                      <div className="mt-3 flex flex-wrap gap-2">
                        <button onClick={takeRetention} disabled={retentionBusy} className="rounded-btn bg-signal px-4 py-2 text-sm font-extrabold text-ink disabled:opacity-60">
                          {retentionBusy ? "applying…" : "keep it — 50% off"}
                        </button>
                        <button onClick={() => go("portal")} disabled={busy === "portal"} className="rounded-btn px-4 py-2 text-sm font-bold lowercase ring-1 ring-inset ring-ink hover:bg-surface/50">
                          no thanks, cancel
                        </button>
                      </div>
                    </div>
                  )}
                  {retention === "saved" && (
                    <p className="mt-3 rounded-btn bg-cream-deep px-3 py-2 text-sm font-semibold text-signal">
                      done — 50% off your next 2 months is applied. glad you&apos;re staying.
                    </p>
                  )}

                  {/* 14-day refund guarantee */}
                  {plan.refundEligible && (
                    <div className="mt-3 border-t border-line pt-3">
                      {!confirmRefund ? (
                        <p className="text-xs text-ink-soft">
                          within your first {plan.refundWindowDays ?? 14} days.{" "}
                          <button onClick={() => setConfirmRefund(true)} className="font-bold underline decoration-signal underline-offset-2 hover:text-ink">
                            request a full refund
                          </button>{" "}
                          — money back, plan ends immediately.
                        </p>
                      ) : (
                        <div className="animate-fade-through rounded-btn bg-cream-deep p-3">
                          <p className="text-sm font-bold">refund and end {plan.name} now? this can only be used once.</p>
                          <div className="mt-2 flex gap-2">
                            <button onClick={doRefund} disabled={refunding} className="rounded-btn bg-ink px-4 py-1.5 text-xs font-bold text-cream disabled:opacity-60">
                              {refunding ? "processing…" : "yes, refund me"}
                            </button>
                            <button onClick={() => setConfirmRefund(false)} className="rounded-btn px-4 py-1.5 text-xs font-bold lowercase text-ink-soft hover:bg-surface/50">
                              keep my plan
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </>
              )}
              {error && <p className="mt-3 rounded-btn bg-cream-deep px-3 py-2 text-xs font-semibold" role="alert">{error}</p>}
            </div>
          </div>
          {actions && actions.length > 0 && (
            <div className="rounded-card bg-surface/60 p-5 shadow-soft">
              <Sparkline actions={actions} />
            </div>
          )}
        </div>
      )}
    </section>
  );
}

/**
 * The connections tab now renders the full Connections screen (third-party
 * apps + custom MCP servers + the add-MCP flow). The panel is self-contained
 * in ConnectionsPanel; this keeps the existing tab wiring stable.
 */
function IntegrationsPanel() {
  return <ConnectionsPanel />;
}

const AUDIT_LABEL: Record<string, string> = {
  tier_changed: "moved a category between tiers",
  integration_connected: "connected an integration",
  integration_disconnected: "disconnected an integration",
  connector_action: "ran a connected tool",
  account_deleted: "deleted the account",
  promo: "a billing offer was applied",
};

function SecurityPanel({ actions }: { actions: ActionRecord[] | null }) {
  const [audit, setAudit] = useState<AccountAuditRecord[] | null>(null);
  const [injections, setInjections] = useState(0);

  useEffect(() => {
    fetch("/api/account/audit").then((r) => r.json()).then((d) => { setAudit(d.audit ?? []); setInjections(d.injectionFlags ?? 0); }).catch(() => setAudit([]));
  }, []);

  const stats = useMemo(() => {
    const a = actions ?? [];
    return { executed: a.filter((x) => x.status === "executed").length, vetoed: a.filter((x) => x.status === "vetoed").length };
  }, [actions]);

  return (
    <section>
      <PanelHeading title="security" sub="the trust cockpit — what the operator did, and what it caught." />
      <div className="grid gap-3 sm:grid-cols-3">
        {[
          { label: "injection flags caught", value: injections, note: "external content held for review", link: "/app/activity" },
          { label: "actions executed", value: stats.executed, note: "each with a logged approval" },
          { label: "vetoed", value: stats.vetoed, note: "killed before execution" },
        ].map((t, i) => (
          <div key={t.label} style={{ animationDelay: `${i * 70}ms` }} className="animate-rise-in rounded-card bg-surface/60 p-4 shadow-soft">
            <p className="text-3xl font-extrabold">{actions === null ? "—" : t.value}</p>
            <p className="mt-1 text-xs font-bold lowercase">{t.label}</p>
            <p className="mt-0.5 text-[11px] text-ink-soft">{t.note}</p>
            {t.link && (
              <a href={t.link} className="mt-1.5 inline-block text-[11px] font-bold lowercase text-ink-soft underline underline-offset-2">view in activity</a>
            )}
          </div>
        ))}
      </div>

      {/* Account changes log (auth events + tier/integration changes) */}
      <div className="mt-4 rounded-card bg-surface/60 p-4 shadow-soft">
        <h3 className="text-sm font-bold lowercase">recent account activity</h3>
        {audit === null ? (
          <div className="mt-2"><SkeletonRows rows={3} /></div>
        ) : audit.length === 0 ? (
          <p className="mt-2 text-xs text-ink-soft">no account changes yet. tier moves and integration connections show up here.</p>
        ) : (
          <ul className="mt-2 flex flex-col divide-y divide-line/60">
            {audit.slice(0, 5).map((e) => (
              <li key={e.id} className="flex items-center gap-2 py-2 text-xs">
                <span className="h-1.5 w-1.5 rounded-full bg-signal" aria-hidden="true" />
                <span className="font-semibold">{AUDIT_LABEL[e.type] ?? e.type}</span>
                {typeof e.detail?.category === "string" && <span className="text-ink-soft">· {e.detail.category}</span>}
                {typeof e.detail?.key === "string" && <span className="text-ink-soft">· {e.detail.key}</span>}
                <span className="ml-auto text-ink-soft">{new Date(e.created_at).toLocaleString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}</span>
              </li>
            ))}
          </ul>
        )}
        <p className="mt-2 text-[11px] text-ink-soft">sign-in events and active sessions appear here when the auth provider is connected.</p>
      </div>

      {/* Explainer */}
      <div className="mt-4 rounded-card bg-surface/60 p-4 shadow-soft">
        <div className="flex items-center gap-2">
          <ShieldCheck size={16} strokeWidth={2.4} className="text-signal" aria-hidden="true" />
          <p className="text-sm font-bold lowercase">how approval-first protects this account</p>
        </div>
        <ul className="mt-2 flex flex-col gap-1 text-xs text-ink-soft">
          <li>the operator can never send, spend, or delete without your signature.</li>
          <li>locked actions need typed confirmation; the agent can&apos;t lower its own tier.</li>
          <li>every proposal, approval, and veto is permanently logged — nothing is silent.</li>
        </ul>
      </div>
    </section>
  );
}
