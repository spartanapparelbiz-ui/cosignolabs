"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  Boxes,
  Gauge,
  Keyboard,
  ShieldCheck,
  SlidersHorizontal,
  Trash2,
  UserRound,
} from "lucide-react";
import type { AccountAuditRecord, ActionRecord, UsageRecord } from "@/lib/types";
import { PLANS, priceLabel } from "@/lib/plans";
import { SkeletonRows } from "@/components/Skeleton";
import { useKeyboardHints } from "@/lib/useKeyboardHints";
import { useDisplayName, initialsFor } from "@/lib/theme";
import { ThemeToggle } from "@/components/ThemeToggle";
import { UsageRing } from "./UsageRing";
import { ConnectionsPanel } from "./ConnectionsPanel";
import { LearnedPanel } from "./LearnedPanel";
import { TrustCenter } from "@/components/trust/TrustCenter";
import { Toggle } from "@/components/ui/Toggle";
import { Button } from "@/components/ui/Button";
import { Tilt3D, DepthLayer, SignatureStack } from "@/components/motion/Depth";

const TABS = [
  { id: "profile", label: "profile", icon: UserRound },
  { id: "permissions", label: "trust center", icon: SlidersHorizontal },
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
  const [usage, setUsage] = useState<UsageRecord | null>(null);
  const [plan, setPlan] = useState<PlanInfo | null>(null);
  const [actions, setActions] = useState<ActionRecord[] | null>(null);

  useEffect(() => {
    fetch("/api/usage")
      .then((r) => r.json())
      .then((d) => {
        setUsage(d.usage ?? null);
        setPlan(d.plan ?? null);
      })
      .catch(() => undefined);
  }, []);

  // The action history is heavy and only feeds the usage sparkline + security
  // stats — fetch it the first time one of those tabs is actually opened.
  useEffect(() => {
    if (actions !== null || (tab !== "usage" && tab !== "security")) return;
    let alive = true;
    fetch("/api/activity?limit=1000")
      .then((r) => r.json())
      .then((d) => alive && setActions(d.actions ?? []))
      .catch(() => alive && setActions([]));
    return () => {
      alive = false;
    };
  }, [tab, actions]);

  // Deep-link support: ?tab=<id> opens that tab (e.g. the OAuth callback
  // returns to ?tab=integrations after a connect attempt).
  useEffect(() => {
    const t = new URLSearchParams(window.location.search).get("tab");
    if (t && TABS.some((x) => x.id === t)) setTab(t as TabId);
  }, []);

  return (
    <div className="mt-6 flex flex-1 flex-col gap-5 md:flex-row md:gap-8">
      {/* A real tablist: arrow keys move between sections the way every other
          tabbed interface on the machine does, so nobody has to discover that
          this one is different. */}
      <div
        role="tablist"
        aria-label="account sections"
        onKeyDown={(e) => {
          const dirs: Record<string, number> = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 };
          const step = dirs[e.key];
          if (!step) return;
          e.preventDefault();
          const i = TABS.findIndex((t) => t.id === tab);
          const next = TABS[(i + step + TABS.length) % TABS.length];
          setTab(next.id);
          document.getElementById(`tab-${next.id}`)?.focus();
        }}
        /* The strip scrolls on a phone, and a strip that scrolls with no sign
           that it scrolls is a strip whose last two sections nobody finds. The
           right edge fades so there is visibly more to reach; at md every tab
           fits in the column and the fade is removed. */
        className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 [mask-image:linear-gradient(to_right,black_calc(100%-28px),transparent)] md:mx-0 md:w-48 md:flex-col md:overflow-visible md:px-0 md:pb-0 md:[mask-image:none]"
      >
        {TABS.map((t) => {
          const Icon = t.icon;
          const active = tab === t.id;
          return (
            <button
              key={t.id}
              id={`tab-${t.id}`}
              role="tab"
              aria-selected={active}
              aria-controls="account-panel"
              tabIndex={active ? 0 : -1}
              onClick={() => setTab(t.id)}
              className={`group relative inline-flex min-h-[40px] shrink-0 items-center gap-2 rounded-btn px-3.5 py-2 text-sm font-bold lowercase transition-[background-color,color,transform] duration-fast ease-brand-out active:scale-[0.98] ${
                active ? "bg-ink text-cream shadow-soft" : "text-ink-soft hover:bg-cream-deep"
              }`}
            >
              <span
                aria-hidden="true"
                className={`absolute left-0 top-1/2 hidden w-[3px] -translate-y-1/2 rounded-pill bg-signal transition-[height,opacity] duration-base ease-brand-out md:block ${
                  active ? "h-5 opacity-100" : "h-0 opacity-0"
                }`}
              />
              <Icon
                size={15}
                strokeWidth={2.4}
                aria-hidden="true"
                className="transition-transform duration-fast ease-brand-out group-hover:-translate-y-px"
              />
              {t.label}
            </button>
          );
        })}
      </div>

      <div
        key={tab}
        id="account-panel"
        role="tabpanel"
        aria-labelledby={`tab-${tab}`}
        className="flex min-w-0 flex-1 animate-fade-through flex-col"
      >
        {tab === "profile" && <ProfilePanel />}
        {tab === "permissions" && <PermissionsPanel />}
        {tab === "usage" && <UsagePanel usage={usage} plan={plan} actions={actions} />}
        {tab === "integrations" && <IntegrationsPanel />}
        {tab === "security" && <SecurityPanel actions={actions} />}
      </div>
    </div>
  );
}

/** A small 3D keycap — a physical-looking key for shortcut hints. */
function Keycap({ children }: { children: React.ReactNode }) {
  return (
    <kbd className="inline-flex h-5 min-w-[1.25rem] items-center justify-center rounded-[5px] bg-cream px-1.5 font-mono text-[11px] font-bold text-ink ring-1 ring-inset ring-line shadow-[0_1px_0_1px_rgba(20,20,20,0.12)]">
      {children}
    </kbd>
  );
}

/**
 * One casing rule on this page, because the mix was visible: navigation (the
 * rail, the tabs) stays lowercase like the wordmark; anything that is content
 * — headings, labels, settings — is sentence case, which is what people
 * actually read fastest.
 */
function PanelHeading({ title, sub }: { title: string; sub: string }) {
  return (
    <div className="mb-4">
      <h2 className="text-lg font-extrabold">{title}</h2>
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
            className={`rounded-btn px-4 py-2 text-sm font-extrabold text-cream disabled:bg-cream-deep disabled:text-ink-soft disabled:shadow-none disabled:cursor-not-allowed ${danger ? "bg-ink" : "bg-signal !text-ink"}`}
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
    import("@/lib/supabaseAuth/client").then(
      ({ signOutEverywhere }) => void signOutEverywhere(),
      () => (window.location.href = "/")
    );
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
      <PanelHeading
        title="Profile"
        sub="Your name, your look, and what cosigno has worked out about how you like to work."
      />

      {/* THE IDENTITY CARD.
          The account page is the one surface in a working product that is
          about the person rather than the work, and treating it as an admin
          form wastes that. It gets the product's own 3D object — a stack of
          signed cards, which is what cosigno actually does — leaning toward
          the pointer on a device that can afford it, and rendering as a flat,
          fast card everywhere else. */}
      <Tilt3D
        maxTilt={4}
        className="relative overflow-hidden rounded-card bg-surface/70 p-5 shadow-depth"
      >
        {/* A deliberate bleed, not a clipped decoration: large enough that the
            corner of it reads as an object continuing past the card, rather
            than a sliver of something that didn't fit. Hidden below sm, where
            there is no room for it to be anything but clutter. */}
        <span
          aria-hidden="true"
          className="pointer-events-none absolute -bottom-20 -right-12 hidden opacity-60 sm:block"
        >
          <SignatureStack size={200} />
        </span>
        <DepthLayer z={18} className="relative flex items-center gap-4 sm:pr-24">
          <span className="flex h-14 w-14 items-center justify-center rounded-pill bg-ink text-xl font-extrabold uppercase text-cream shadow-lift">
            {initialsFor(display)}
          </span>
          <span className="min-w-0">
            <span className="block truncate font-bold lowercase">{display}</span>
            <span className="block truncate text-sm text-ink-soft">your cosigno operator</span>
          </span>
          <Button tone="ghost" size="sm" onClick={signOut} className="ml-auto">
            Sign out
          </Button>
        </DepthLayer>
      </Tilt3D>

      {/* Personalize: display name */}
      <div className="mt-6 rounded-card bg-surface/60 p-5 shadow-soft">
        <p className="text-sm font-bold">Display name</p>
        <p className="mt-0.5 text-xs text-ink-soft">
          What cosigno calls you across the app. Just for you — stored on this device.
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
        <p className="text-sm font-bold">Appearance</p>
        <p className="mt-0.5 text-xs text-ink-soft">
          Light, dark, or match your device. Changes instantly.
        </p>
        <div className="mt-3">
          <ThemeToggle />
        </div>
      </div>

      {/* Preferences */}
      <div className="mt-6">
        <Toggle
          checked={keyHints}
          onChange={setKeyHints}
          label="Keyboard shortcut hints"
          icon={<Keyboard size={20} strokeWidth={2.2} aria-hidden="true" />}
          description={
            <span className="flex flex-wrap items-center gap-x-1.5 gap-y-1">
              Show the <Keycap>a</Keycap> approve <span aria-hidden="true">·</span>{" "}
              <Keycap>v</Keycap> veto footer on focused action cards.
            </span>
          }
        />
      </div>

      {/* What cosigno has learned, and the switch that stops it. */}
      <LearnedPanel />

      {/* Danger zone — hazard-striped so a destructive area reads at a glance. */}
      <div className="tier3-texture mt-8 overflow-hidden rounded-card p-5 ring-1 ring-inset ring-signal/30">
        <div className="flex items-start gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-btn bg-signal/15 text-signal">
            <AlertTriangle size={20} strokeWidth={2.4} aria-hidden="true" />
          </span>
          <div className="min-w-0">
            <h3 className="text-sm font-extrabold text-signal">Danger zone</h3>
            <p className="mt-1 text-sm text-ink-soft">
              Deleting your account cancels any subscription and permanently erases
              your sessions, actions, audit trail, and settings. This can&apos;t be undone.
            </p>
          </div>
        </div>
        {error && (
          <p className="mt-3 rounded-btn bg-cream-deep px-3 py-2 text-xs font-semibold" role="alert">{error}</p>
        )}
        <button
          onClick={() => setConfirming(true)}
          className="mt-4 inline-flex min-h-[40px] items-center gap-2 rounded-btn px-4 py-2 text-sm font-bold text-signal ring-1 ring-inset ring-signal transition-all duration-fast hover:-translate-y-px hover:bg-signal hover:text-cream"
        >
          <Trash2 size={14} strokeWidth={2.4} aria-hidden="true" />
          Delete account
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

/**
 * The permissions tab is now the Trust Center itself, not a second, differently
 * worded copy of it.
 *
 * What used to live here was a three-column board of engine categories —
 * "update_record" in an "approve" column — which asked people to hold a mental
 * model of the dispatcher in order to answer a question about their own email.
 * The same settings are still here, still enforced by the same tiers; the
 * question is just asked in a language someone can answer.
 */
function PermissionsPanel() {
  return (
    <section>
      <PanelHeading
        title="Trust center"
        sub="Choose how much you trust cosigno to act on your behalf. Every change is logged in security."
      />
      <TrustCenter />

      {/* The Trust Center sets how much rope every category gets. A safety rule
          is the narrower instrument — one sentence about one kind of action —
          and it can be tried against real work before it binds anything. */}
      <Link
        href="/app/settings/rules"
        className="mt-5 flex items-center justify-between gap-3 rounded-card bg-surface/60 p-4 shadow-soft transition-all duration-fast hover:-translate-y-0.5 hover:shadow-depth"
      >
        <span>
          <span className="flex items-center gap-1.5 text-sm font-bold">
            <ShieldCheck size={14} aria-hidden="true" /> Safety rules
          </span>
          <span className="mt-0.5 block text-[11px] text-ink-soft">
            Test a rule against your past work, then turn it on.
          </span>
        </span>
        <span aria-hidden="true" className="shrink-0 text-sm font-bold text-ink-soft">
          →
        </span>
      </Link>
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
      <PanelHeading title="Plan &amp; usage" sub="What you've spent this cycle, and what's next." />
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
              <p className="mt-2 text-xs lowercase text-ink-soft">AI operations used this cycle · hover for detail</p>
              <p className="mt-1 text-[11px] text-ink-soft">
                every planning call and every executed action counts as one operation.
              </p>
            </div>
            <div className="flex-1 rounded-card bg-surface/60 p-5 shadow-soft">
              <div className="flex items-center justify-between">
                <span className="text-sm font-bold lowercase">{plan.name}</span>
                <span className="rounded-pill bg-cream-deep px-3 py-1 text-[11px] font-bold lowercase text-ink-soft">current plan</span>
              </div>
              <p className="mt-2 text-sm text-ink-soft">
                {usage.limit.toLocaleString()} AI operations / cycle · resets {reset}{plan.interval ? ` · ${plan.interval}` : ""}
              </p>
              {plan.cancelAtPeriodEnd && plan.activeUntil && (
                <p className="mt-1 text-sm font-semibold">{plan.name} until {fmtDate(plan.activeUntil)}, then free.</p>
              )}
              {isFree ? (
                <div className="mt-4 rounded-btn bg-cream-deep p-4">
                  <p className="text-sm font-bold lowercase">{PLANS.pro.name} unlocks more room</p>
                  <ul className="mt-2 flex flex-col gap-1 text-xs text-ink-soft">
                    {PLANS.pro.features.map((f) => (
                      <li key={f}>{f}</li>
                    ))}
                  </ul>
                  <button onClick={() => go("upgrade")} disabled={busy === "upgrade"} className="group relative mt-3 inline-flex overflow-hidden rounded-btn bg-ink px-5 py-2.5 text-sm font-extrabold text-cream disabled:bg-cream-deep disabled:text-ink-soft disabled:shadow-none disabled:cursor-not-allowed">
                    <span className="absolute inset-0 origin-left scale-x-0 bg-signal transition-transform duration-base ease-brand-out group-hover:scale-x-100" />
                    <span className="relative transition-colors group-hover:text-ink">{busy === "upgrade" ? "starting…" : `upgrade to ${PLANS.pro.name} — ${priceLabel(PLANS.pro, "monthly")}`}</span>
                  </button>
                </div>
              ) : (
                <>
                  <div className="mt-4 flex flex-wrap gap-2">
                    {plan.upgradeTo && (
                      <button onClick={() => go("upgrade")} disabled={busy === "upgrade"} className="rounded-btn bg-signal px-5 py-2.5 text-sm font-extrabold text-ink transition-transform duration-fast hover:-translate-y-px disabled:bg-cream-deep disabled:text-ink-soft disabled:shadow-none disabled:cursor-not-allowed">
                        {busy === "upgrade" ? "starting…" : `upgrade to ${plan.upgradeTo}`}
                      </button>
                    )}
                    <button onClick={() => go("portal")} disabled={busy === "portal"} className="rounded-btn ring-1 ring-inset ring-ink px-5 py-2.5 text-sm font-bold lowercase transition-all duration-fast hover:-translate-y-px hover:bg-cream-deep disabled:opacity-50 disabled:cursor-not-allowed">
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
                        <button onClick={takeRetention} disabled={retentionBusy} className="rounded-btn bg-signal px-4 py-2 text-sm font-extrabold text-ink disabled:bg-cream-deep disabled:text-ink-soft disabled:shadow-none disabled:cursor-not-allowed">
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
                            <button onClick={doRefund} disabled={refunding} className="rounded-btn bg-ink px-4 py-1.5 text-xs font-bold text-cream disabled:bg-cream-deep disabled:text-ink-soft disabled:shadow-none disabled:cursor-not-allowed">
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
/**
 * The connections tab was the only one of the five with no heading at all —
 * it dropped straight into the panel. Four sections announcing themselves and
 * one not is a hole in the page's outline: a screen reader jumping by heading
 * lands nowhere, and a sighted reader loses the thread of where they are.
 */
function IntegrationsPanel() {
  return (
    <section>
      <PanelHeading
        title="Connections"
        sub="The apps cosigno can work with. It can only touch an app after you connect it, and only in the ways you allow."
      />
      <ConnectionsPanel />
    </section>
  );
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
      <PanelHeading title="Security" sub="Everything cosigno did on your behalf, and everything it caught." />
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
                <span className="h-1.5 w-1.5 rounded-pill bg-signal" aria-hidden="true" />
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
