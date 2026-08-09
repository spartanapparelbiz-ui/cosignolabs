"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  Boxes,
  Gauge,
  ArrowRight,
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
import { SectionLabel } from "@/components/ui/Page";
import { badge, btn, card, field } from "@/components/ui/styles";
import { ConnectionsPanel } from "./ConnectionsPanel";
import { TrustCenter } from "@/components/trust/TrustCenter";

// Same words, same casing as the rail — this is a second navigation into the
// same product, so it cannot speak in a different voice.
const TABS = [
  { id: "profile", label: "Profile", icon: UserRound },
  { id: "permissions", label: "Trust", icon: SlidersHorizontal },
  { id: "usage", label: "Plan & usage", icon: Gauge },
  { id: "integrations", label: "Connections", icon: Boxes },
  { id: "security", label: "Security", icon: ShieldCheck },
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
    <div className="mt-12 flex flex-1 flex-col gap-8 md:flex-row md:gap-14">
      {/* On a phone the sections wrap onto two lines rather than scrolling
          sideways. A horizontal scroller hid "Connections" and "Security"
          behind a cut edge with nothing to say they were there — five short
          labels fit across two rows, so show all five. */}
      <nav
        aria-label="account sections"
        className="flex shrink-0 flex-wrap gap-1 md:w-44 md:flex-col md:flex-nowrap"
      >
        {TABS.map((t) => {
          const Icon = t.icon;
          const active = tab === t.id;
          return (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              aria-current={active ? "page" : undefined}
              className={`inline-flex shrink-0 items-center gap-2.5 rounded-btn px-3 py-2 text-[0.9375rem] transition-colors duration-fast ease-brand-out md:w-full ${
                active
                  ? "bg-ink/[0.07] font-semibold text-ink"
                  : "text-ink-soft hover:bg-ink/[0.04] hover:text-ink"
              }`}
            >
              <Icon size={15} strokeWidth={active ? 2.2 : 1.9} aria-hidden="true" />
              {t.label}
            </button>
          );
        })}
      </nav>

      <div key={tab} className="flex min-w-0 flex-1 flex-col animate-fade-through">
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
    <kbd className="inline-flex h-5 min-w-[1.25rem] items-center justify-center rounded-[5px] bg-cream px-1.5 font-mono text-[0.75rem] font-semibold text-ink ring-1 ring-inset ring-line shadow-[0_1px_0_1px_rgba(20,20,20,0.12)]">
      {children}
    </kbd>
  );
}

function PanelHeading({ title, sub }: { title: string; sub: string }) {
  return (
    <div className="mb-8">
      <h2 className="t-title text-[1.125rem]">{title}</h2>
      <p className="t-caption mt-1">{sub}</p>
    </div>
  );
}

/**
 * One setting: what it is, what it does, and its control. Rows separated by a
 * hairline — a settings page made of cards is a page where nothing looks
 * related to anything else.
 */
function SettingRow({
  title,
  detail,
  control,
  children,
}: {
  title: string;
  detail?: string;
  control?: React.ReactNode;
  children?: React.ReactNode;
}) {
  return (
    <div className="flex max-w-[46rem] flex-col gap-4 border-t border-line/40 py-6 first:border-t-0 first:pt-0 sm:flex-row sm:items-center">
      <div className="min-w-0 flex-1">
        <p className="text-[1rem] font-semibold">{title}</p>
        {detail && <p className="t-caption mt-0.5">{detail}</p>}
        {children}
      </div>
      {control && <div className="shrink-0">{control}</div>}
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
      <div className="w-full max-w-md origin-center animate-modal-in rounded-card bg-surface p-7 shadow-overlay">
        <h3 className="t-title">{title}</h3>
        <p className="t-body mt-3">{body}</p>
        <p className="t-caption mt-5">
          Type <code className="rounded bg-ink/[0.06] px-1.5 py-0.5 font-mono text-ink">{confirmWord}</code>{" "}
          to confirm
        </p>
        <input
          autoFocus
          value={typed}
          onChange={(e) => setTyped(e.target.value)}
          className={`${field("md")} mt-2 ${shake ? "animate-shake-x" : ""}`}
          aria-label={`type ${confirmWord} to confirm`}
        />
        <div className="mt-6 flex gap-1.5">
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
            className={btn(danger ? "danger" : "primary", "md")}
          >
            {busy ? "Working…" : title}
          </button>
          <button onClick={onCancel} disabled={busy} className={btn("ghost", "md")}>
            Cancel
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
        throw new Error(b.message || "Couldn't delete the account.");
      }
      window.location.href = "/";
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't delete the account.");
      setBusy(false);
      setConfirming(false);
    }
  }

  return (
    <section>
      <PanelHeading title="Profile" sub="Your name, your look." />

      {/* Identity */}
      <div className="flex max-w-[46rem] items-center gap-4">
        <div className="flex h-12 w-12 items-center justify-center rounded-pill bg-ink text-[1rem] font-semibold uppercase text-cream">
          {initialsFor(display)}
        </div>
        <div className="min-w-0">
          <p className="truncate text-[1rem] font-semibold">{display}</p>
          <p className="t-caption truncate">your cosigno operator</p>
        </div>
        <button onClick={signOut} className={btn("ghost", "sm", "ml-auto")}>
          Sign out
        </button>
      </div>

      <div className="mt-10">
        <SettingRow
          title="Display name"
          detail="What cosigno calls you. Stored on this device, just for you."
          control={
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={40}
              placeholder="operator"
              aria-label="display name"
              className={`${field("md")} sm:w-56`}
            />
          }
        />

        <SettingRow
          title="Appearance"
          detail="Light, dark, or match your device."
          control={<ThemeToggle />}
        />

        <SettingRow
          title="Keyboard hints"
          control={
            <button
              onClick={() => setKeyHints(!keyHints)}
              role="switch"
              aria-checked={keyHints}
              aria-label="toggle keyboard shortcut hints"
              className={`inline-flex h-6 w-11 shrink-0 items-center rounded-pill p-0.5 transition-colors duration-base ease-brand-out ${
                keyHints ? "bg-ink" : "bg-ink/15"
              }`}
            >
              {/* Flex + padding keeps the knob inside the track at both ends —
                  travel is exactly the free space, so it never overflows. */}
              <span
                className={`h-5 w-5 rounded-pill bg-surface shadow-rest transition-transform duration-base ease-brand-out ${
                  keyHints ? "translate-x-5" : "translate-x-0"
                }`}
              />
            </button>
          }
        >
          <p className="t-caption mt-0.5 flex flex-wrap items-center gap-x-1.5 gap-y-1">
            Show <Keycap>a</Keycap> approve <span aria-hidden="true">·</span> <Keycap>v</Keycap>{" "}
            veto on a focused card.
          </p>
        </SettingRow>
      </div>

      {/* The one irreversible control on the page. It gets a line, a plain
          sentence and a button that says what it does — not a hazard-striped
          panel, which is decoration standing in for the confirmation step that
          actually protects you. */}
      <div className="mt-14 max-w-[46rem] border-t border-line/40 pt-6">
        <p className="text-[1rem] font-semibold">Delete account</p>
        <p className="t-caption mt-1 max-w-[38rem]">
          Cancels any subscription and permanently erases your sessions, actions, audit
          trail and settings. This can&apos;t be undone.
        </p>
        {error && (
          <p className="t-body mt-3 border-l-2 border-danger pl-3.5 text-danger" role="alert">
            {error}
          </p>
        )}
        <button onClick={() => setConfirming(true)} className={btn("danger", "md", "mt-4")}>
          <Trash2 size={14} strokeWidth={1.9} aria-hidden="true" />
          Delete account
        </button>
      </div>

      {confirming && (
        <ConfirmModal
          title="Delete account"
          body="This cancels your subscription and erases all your data."
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
        title="Trust"
        sub="How much cosigno may do on its own. Every change is logged."
      />
      <TrustCenter />

      {/* The Trust Center sets how much rope every category gets. A safety rule
          is the narrower instrument — one sentence about one kind of action —
          and it can be tried against real work before it binds anything. */}
      <Link
        href="/app/settings/rules"
        className="group mt-10 flex items-center justify-between gap-3 rounded-btn px-3 py-3 transition-colors duration-fast hover:bg-ink/[0.035]"
      >
        <span>
          <span className="block text-[1rem]">Safety rules</span>
          <span className="t-caption mt-0.5 block">
            Test a rule against your past work, then turn it on.
          </span>
        </span>
        <ArrowRight
          size={14}
          strokeWidth={2}
          aria-hidden="true"
          className="shrink-0 text-ink-soft transition-transform duration-base ease-brand-out group-hover:translate-x-0.5"
        />
      </Link>
    </section>
  );
}

function fmtDate(unixOrIso: number | string): string {
  const d = typeof unixOrIso === "number" ? new Date(unixOrIso * 1000) : new Date(unixOrIso);
  return d.toLocaleDateString([], { month: "long", day: "numeric", year: "numeric" });
}

/**
 * Thirty days of work, one bar a day.
 *
 * This used to be a stretched polyline, which is the wrong shape for sparse
 * data: with a single action the line is a flat baseline and one diagonal
 * spike, and it reads as a rendering glitch rather than as a quiet week. Bars
 * degrade honestly — one day of work is one bar, and an empty month is an
 * empty row rather than something that looks broken.
 */
function Sparkline({ actions }: { actions: ActionRecord[] }) {
  const days = 30;
  const counts = useMemo(() => {
    const buckets: number[] = new Array(days).fill(0);
    const now = Date.now();
    for (const a of actions) {
      const age = Math.floor((now - new Date(a.created_at).getTime()) / 86400000);
      if (age >= 0 && age < days) buckets[days - 1 - age] += 1;
    }
    return buckets;
  }, [actions]);
  const max = Math.max(1, ...counts);
  const total = counts.reduce((a, b) => a + b, 0);
  const label = `${total} ${total === 1 ? "action" : "actions"}`;
  return (
    <div>
      <p className="t-eyebrow">Last 30 days · {label}</p>
      <div
        className="mt-2.5 flex h-10 max-w-[26rem] items-end gap-[3px]"
        role="img"
        aria-label={`${label} over the last 30 days`}
      >
        {counts.map((c, i) => (
          <div
            key={i}
            className={`min-w-0 flex-1 rounded-[2px] ${c > 0 ? "bg-ink/60" : "bg-ink/[0.07]"}`}
            style={{ height: c > 0 ? `${Math.max(18, (c / max) * 100)}%` : "2px" }}
          />
        ))}
      </div>
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
      if (!res.ok) throw new Error(b.message || "We couldn't process that refund.");
      window.location.reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : "We couldn't process that refund.");
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
      if (!res.ok) throw new Error(b.message || "That offer isn't available.");
      setRetention("saved");
    } catch (e) {
      setError(e instanceof Error ? e.message : "That offer isn't available.");
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
        if (!res.ok) throw new Error(b.message || "Couldn't open billing.");
        window.location.href = b.url;
      } else {
        // First purchase / upgrade goes to the embedded checkout with the plan
        // preselected — same giant-card experience as pricing.
        const target = plan?.upgradeTo ?? "pro";
        window.location.href = `/checkout?plan=${target}&interval=monthly`;
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong.");
      setBusy(null);
    }
  }

  const isFree = !plan || plan.id === "free";

  return (
    <section>
      <PanelHeading title="Plan &amp; usage" sub="What you've used this cycle, and what comes next." />
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
          <div className="flex flex-col gap-8 sm:flex-row sm:items-start sm:gap-10">
            <div className="shrink-0 text-center">
              <UsageRing used={usage.actions_executed} limit={usage.limit} daysLeft={daysLeft} resetLabel={reset} />
              <p className="t-caption mt-3 max-w-[14rem]">
                Operations used this cycle. Planning and every executed action count as one.
              </p>
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-3">
                <span className="t-title">{plan.name}</span>
                <span className={badge("neutral")}>current plan</span>
              </div>
              <p className="t-caption mt-1.5">
                {usage.limit.toLocaleString()} operations a cycle · resets {reset}
                {plan.interval ? ` · ${plan.interval}` : ""}
              </p>
              {plan.cancelAtPeriodEnd && plan.activeUntil && (
                <p className="mt-1 text-sm font-semibold">{plan.name} until {fmtDate(plan.activeUntil)}, then free.</p>
              )}
              {isFree ? (
                <div className="mt-7">
                  <p className="t-eyebrow">{PLANS.pro.name}</p>
                  <ul className="mt-2 flex flex-col gap-1">
                    {PLANS.pro.features.map((f) => (
                      <li key={f} className="t-body">
                        {f}
                      </li>
                    ))}
                  </ul>
                  <button onClick={() => go("upgrade")} disabled={busy === "upgrade"} className={btn("primary", "md", "mt-5")}>
                    {busy === "upgrade" ? "Starting…" : `Upgrade — ${priceLabel(PLANS.pro, "monthly")}`}
                  </button>
                </div>
              ) : (
                <>
                  <div className="mt-6 flex flex-wrap gap-1.5">
                    {plan.upgradeTo && (
                      <button onClick={() => go("upgrade")} disabled={busy === "upgrade"} className={btn("primary", "md")}>
                        {busy === "upgrade" ? "Starting…" : `Upgrade to ${plan.upgradeTo}`}
                      </button>
                    )}
                    <button onClick={() => go("portal")} disabled={busy === "portal"} className={btn("secondary", "md")}>
                      {busy === "portal" ? "Opening…" : "Manage billing"}
                    </button>
                    {retention === "idle" && (
                      <button onClick={() => setRetention("offer")} className={btn("ghost", "md")}>
                        Cancel plan
                      </button>
                    )}
                  </div>

                  {/* cancel-flow retention: 50% off next 2 months before the portal */}
                  {retention === "offer" && (
                    <div className={`${card()} mt-4 animate-card-in p-5`}>
                      <p className="t-title">Keep {plan.name} at half price</p>
                      <p className="t-caption mt-1">50% off your next two months, on the same card.</p>
                      <div className="mt-4 flex flex-wrap gap-1.5">
                        <button onClick={takeRetention} disabled={retentionBusy} className={btn("primary", "md")}>
                          {retentionBusy ? "Applying…" : "Keep it"}
                        </button>
                        <button onClick={() => go("portal")} disabled={busy === "portal"} className={btn("ghost", "md")}>
                          No thanks, cancel
                        </button>
                      </div>
                    </div>
                  )}
                  {retention === "saved" && (
                    <p className="t-body mt-4 border-l-2 border-positive pl-3.5">
                      Done — 50% off your next two months is applied.
                    </p>
                  )}

                  {/* 14-day refund guarantee */}
                  {plan.refundEligible && (
                    <div className="mt-6 border-t border-line/40 pt-4">
                      {!confirmRefund ? (
                        <p className="t-caption">
                          Within your first {plan.refundWindowDays ?? 14} days,{" "}
                          <button onClick={() => setConfirmRefund(true)} className="text-ink underline underline-offset-2 hover:text-signal">
                            request a full refund
                          </button>{" "}
                          — money back, plan ends immediately.
                        </p>
                      ) : (
                        <div className="animate-fade-through">
                          <p className="t-body">Refund and end {plan.name} now? This can only be used once.</p>
                          <div className="mt-3 flex gap-1.5">
                            <button onClick={doRefund} disabled={refunding} className={btn("danger", "sm")}>
                              {refunding ? "Processing…" : "Yes, refund me"}
                            </button>
                            <button onClick={() => setConfirmRefund(false)} className={btn("ghost", "sm")}>
                              Keep my plan
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </>
              )}
              {error && (
                <p className="t-body mt-4 border-l-2 border-danger pl-3.5 text-danger" role="alert">
                  {error}
                </p>
              )}
            </div>
          </div>
          {actions && actions.length > 0 && (
            <div className="mt-8">
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
  return (
    <section>
      <PanelHeading title="Connections" sub="The apps cosigno can work with, and what it may do in each." />
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
      <PanelHeading title="Security" sub="What cosigno did, and what it stopped." />
      {/* Three numbers, stated. They used to be three cards with 30px figures
          in them, which is a lot of furniture for three integers. */}
      <div className="grid gap-x-8 gap-y-6 sm:grid-cols-3">
        {[
          { label: "Held for review", value: injections, note: "External content that tried to give orders", link: "/app/activity" },
          { label: "Executed", value: stats.executed, note: "Each with a logged approval" },
          { label: "Vetoed", value: stats.vetoed, note: "Stopped before it ran" },
        ].map((t) => (
          <div key={t.label}>
            <p className="t-eyebrow">{t.label}</p>
            <p className="mt-1.5 font-display text-[1.75rem] leading-none tabular-nums">
              {actions === null ? "—" : t.value}
            </p>
            <p className="t-caption mt-2">{t.note}</p>
            {t.link && (
              <a href={t.link} className="t-caption mt-1 inline-block transition-colors duration-fast hover:text-ink">
                View in activity
              </a>
            )}
          </div>
        ))}
      </div>

      {/* Account changes log (auth events + tier/integration changes) */}
      <div className="mt-12">
        <SectionLabel className="mb-3">Recent account changes</SectionLabel>
        {audit === null ? (
          <SkeletonRows rows={3} />
        ) : audit.length === 0 ? (
          <p className="t-caption">
            Nothing yet. Permission changes and app connections show up here.
          </p>
        ) : (
          <ul className="-mx-3 flex flex-col">
            {audit.slice(0, 5).map((e) => (
              <li key={e.id} className="flex items-center gap-2 rounded-btn px-3 py-2.5 text-[0.9375rem]">
                <span>{AUDIT_LABEL[e.type] ?? e.type}</span>
                {typeof e.detail?.category === "string" && <span className="t-caption">· {e.detail.category}</span>}
                {typeof e.detail?.key === "string" && <span className="t-caption">· {e.detail.key}</span>}
                <span className="t-caption ml-auto shrink-0">
                  {new Date(e.created_at).toLocaleString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
                </span>
              </li>
            ))}
          </ul>
        )}
        <p className="t-caption mt-3">
          Sign-in events and active sessions appear here once the auth provider is connected.
        </p>
      </div>

      {/* Explainer */}
      <div className="mt-12">
        <SectionLabel className="mb-3">What holds, always</SectionLabel>
        <ul className="flex flex-col gap-2">
          <li className="t-body">cosigno can never send, spend or delete without your signature.</li>
          <li className="t-body">
            The most consequential actions need typed confirmation, and cosigno cannot
            lower its own limits.
          </li>
          <li className="t-body">Every proposal, approval and veto is logged. Nothing is silent.</li>
        </ul>
      </div>
    </section>
  );
}
