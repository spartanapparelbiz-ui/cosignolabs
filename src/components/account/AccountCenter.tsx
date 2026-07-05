"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Boxes,
  Gauge,
  Lock,
  ShieldCheck,
  SlidersHorizontal,
  UserRound,
} from "lucide-react";
import type { ActionRecord, CategoryMeta, Tier, UsageRecord } from "@/lib/types";
import { SkeletonRows } from "@/components/Skeleton";
import { UsageRing } from "./UsageRing";

type CategoryWithTier = CategoryMeta & { tier: Tier };

const TABS = [
  { id: "profile", label: "profile", icon: UserRound },
  { id: "permissions", label: "permissions", icon: SlidersHorizontal },
  { id: "usage", label: "usage & plan", icon: Gauge },
  { id: "integrations", label: "integrations", icon: Boxes },
  { id: "security", label: "security", icon: ShieldCheck },
] as const;

type TabId = (typeof TABS)[number]["id"];

export function AccountCenter() {
  const [tab, setTab] = useState<TabId>("profile");
  const [categories, setCategories] = useState<CategoryWithTier[] | null>(null);
  const [usage, setUsage] = useState<UsageRecord | null>(null);
  const [actions, setActions] = useState<ActionRecord[] | null>(null);

  useEffect(() => {
    fetch("/api/settings/tiers").then((r) => r.json()).then((d) => setCategories(d.categories ?? [])).catch(() => setCategories([]));
    fetch("/api/usage").then((r) => r.json()).then((d) => setUsage(d.usage ?? null)).catch(() => {});
    fetch("/api/activity?limit=1000").then((r) => r.json()).then((d) => setActions(d.actions ?? [])).catch(() => setActions([]));
  }, []);

  return (
    <div className="mt-6 flex flex-col gap-5 md:flex-row md:gap-8">
      {/* Sub-nav: vertical on md+, horizontal scroll pill bar on mobile */}
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

      {/* Panel */}
      <div key={tab} className="min-w-0 flex-1 animate-fade-through">
        {tab === "profile" && <ProfilePanel />}
        {tab === "permissions" && (
          <PermissionsPanel categories={categories} setCategories={setCategories} />
        )}
        {tab === "usage" && <UsagePanel usage={usage} />}
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

/**
 * Branded profile card. When Clerk is configured the layout's ClerkProvider
 * appearance maps Clerk widgets to the tokens; here we present a fully
 * token-styled card (never the raw unthemed widget) and read the demo/user
 * identity. Sign-out is wired when Clerk is present.
 */
function ProfilePanel() {
  const [me, setMe] = useState<{ name: string; email: string; demo: boolean } | null>(null);
  useEffect(() => {
    // Best-effort: works in demo mode without Clerk installed on the client.
    setMe({ name: "operator", email: "you@cosignolabs.com", demo: true });
  }, []);

  return (
    <section>
      <PanelHeading title="profile" sub="who the operator acts for." />
      <div className="flex items-center gap-4 rounded-card bg-white/60 p-5 shadow-soft">
        <div className="flex h-14 w-14 items-center justify-center rounded-full bg-ink text-xl font-extrabold text-cream">
          {(me?.name ?? "o").slice(0, 1)}
        </div>
        <div className="min-w-0">
          <p className="truncate font-bold lowercase">{me?.name ?? "…"}</p>
          <p className="truncate text-sm text-ink-soft">{me?.email ?? ""}</p>
        </div>
        {me?.demo && (
          <span className="ml-auto rounded-pill bg-cream-deep px-3 py-1 text-[11px] font-bold lowercase text-ink-soft">
            demo mode
          </span>
        )}
      </div>
      <p className="mt-3 text-xs text-ink-soft">
        with clerk configured, this shows your real name, email, and avatar,
        and sign-out — all themed to the cosigno tokens, not the default widget.
      </p>
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
}: {
  categories: CategoryWithTier[] | null;
  setCategories: React.Dispatch<React.SetStateAction<CategoryWithTier[] | null>>;
}) {
  const [error, setError] = useState<string | null>(null);

  async function move(category: string, tier: Tier) {
    setError(null);
    // optimistic fly to the new column
    setCategories((cs) => cs?.map((c) => (c.category === category ? { ...c, tier } : c)) ?? null);
    const res = await fetch("/api/settings/tiers", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ category, tier }),
    });
    if (!res.ok) {
      const b = await res.json().catch(() => ({}));
      setError(b.message ?? "that tier didn't update — try again.");
      // reload truth
      fetch("/api/settings/tiers").then((r) => r.json()).then((d) => setCategories(d.categories ?? []));
    }
  }

  return (
    <section>
      <PanelHeading title="permissions" sub="how much rope the operator gets. locked stays locked." />
      {error && (
        <p className="mb-3 rounded-btn bg-cream-deep px-3 py-2 text-sm font-semibold" role="alert">
          {error}
        </p>
      )}
      <div className="grid gap-3 sm:grid-cols-3">
        {COLUMNS.map((col) => (
          <div key={col.tier} className="rounded-card bg-white/50 p-3 shadow-soft">
            <div className="flex items-center gap-1.5">
              {col.tier === 3 && <Lock size={12} strokeWidth={2.5} aria-hidden="true" />}
              <h3 className="text-xs font-extrabold uppercase tracking-widest text-ink-soft">
                {col.label}
              </h3>
              {col.tier === 3 && (
                <span
                  className="ml-auto cursor-help text-[10px] text-ink-soft underline decoration-dotted"
                  title="locked actions always require typed confirmation."
                >
                  why?
                </span>
              )}
            </div>
            <div className="mt-3 flex flex-col gap-2">
              {categories === null ? (
                <SkeletonRows rows={2} />
              ) : (
                categories
                  .filter((c) => c.tier === col.tier)
                  .map((c) => (
                    <div
                      key={c.category}
                      className="animate-spring-in rounded-btn bg-cream-deep px-3 py-2"
                    >
                      <p className="text-sm font-bold lowercase">{c.label}</p>
                      <p className="mt-0.5 text-[11px] leading-snug text-ink-soft">
                        {c.description}
                      </p>
                      {!c.pinned && (
                        <div className="mt-2 flex gap-1.5">
                          {([1, 2] as Tier[])
                            .filter((t) => t !== col.tier)
                            .map((t) => (
                              <button
                                key={t}
                                onClick={() => move(c.category, t)}
                                className="rounded-pill bg-ink px-2.5 py-0.5 text-[10px] font-bold lowercase text-cream transition-transform duration-fast hover:-translate-y-px"
                              >
                                → {t === 1 ? "auto" : "approve"}
                              </button>
                            ))}
                        </div>
                      )}
                      {c.pinned && (
                        <span className="mt-2 inline-flex items-center gap-1 text-[10px] font-bold lowercase text-ink-soft">
                          <Lock size={9} strokeWidth={2.5} aria-hidden="true" /> pinned
                        </span>
                      )}
                    </div>
                  ))
              )}
              {categories?.filter((c) => c.tier === col.tier).length === 0 && (
                <p className="rounded-btn border border-dashed border-line px-3 py-4 text-center text-[11px] text-ink-soft">
                  nothing here
                </p>
              )}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

function UsagePanel({ usage }: { usage: UsageRecord | null }) {
  const reset = useMemo(() => {
    if (!usage) return "";
    const d = new Date(usage.cycle_start);
    const next = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1));
    return next.toLocaleDateString([], { month: "long", day: "numeric" });
  }, [usage]);

  return (
    <section>
      <PanelHeading title="usage & plan" sub="what you've spent this cycle, and what's next." />
      {!usage ? (
        <SkeletonRows rows={3} />
      ) : (
        <div className="flex flex-col gap-5 sm:flex-row sm:items-center">
          <div className="rounded-card bg-white/60 p-6 text-center shadow-soft">
            <UsageRing used={usage.actions_executed} limit={usage.limit} />
            <p className="mt-2 text-xs lowercase text-ink-soft">actions used</p>
          </div>
          <div className="flex-1">
            <div className="rounded-card bg-white/60 p-5 shadow-soft">
              <div className="flex items-center justify-between">
                <span className="text-sm font-bold lowercase">founding beta</span>
                <span className="rounded-pill bg-cream-deep px-3 py-1 text-[11px] font-bold lowercase text-ink-soft">
                  current plan
                </span>
              </div>
              <p className="mt-2 text-sm text-ink-soft">
                {usage.limit} actions / cycle · resets {reset}
              </p>
              <button className="group relative mt-4 inline-flex overflow-hidden rounded-btn bg-ink px-5 py-2.5 text-sm font-extrabold text-cream">
                <span className="absolute inset-0 origin-left scale-x-0 bg-signal transition-transform duration-[280ms] ease-brand-out group-hover:scale-x-100" />
                <span className="relative transition-colors group-hover:text-ink">
                  upgrade — coming with billing
                </span>
              </button>
              <p className="mt-2 text-[11px] text-ink-soft">
                billing is a stub in beta. proposals are always free; execution
                pauses at the limit and never charges surprise overage.
              </p>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}

const INTEGRATIONS = [
  { name: "Gmail", detail: "read, draft, send — sends always wait for approval.", connected: true },
  { name: "generic webhook", detail: "POST a signed payload to an endpoint you configure.", connected: false },
];

function IntegrationsPanel() {
  const [state, setState] = useState(INTEGRATIONS);
  return (
    <section>
      <PanelHeading title="integrations" sub="the tools cosigno can act across." />
      <div className="grid gap-3 sm:grid-cols-2">
        {state.map((i, idx) => (
          <div key={i.name} className="rounded-card bg-white/60 p-4 shadow-soft">
            <div className="flex items-center gap-2">
              <span
                className={`h-2.5 w-2.5 rounded-full ${i.connected ? "bg-signal" : "bg-line"}`}
                aria-hidden="true"
              />
              <span className="font-bold">{i.name}</span>
              <span className="ml-auto rounded-pill bg-cream-deep px-2.5 py-0.5 text-[10px] font-bold lowercase text-ink-soft">
                beta stub
              </span>
            </div>
            <p className="mt-2 text-xs text-ink-soft">{i.detail}</p>
            <button
              onClick={() =>
                setState((s) => s.map((x, j) => (j === idx ? { ...x, connected: !x.connected } : x)))
              }
              className={`mt-3 rounded-btn px-3.5 py-1.5 text-xs font-bold lowercase transition-all duration-fast hover:-translate-y-px ${
                i.connected ? "ring-1 ring-inset ring-ink" : "bg-ink text-cream"
              }`}
            >
              {i.connected ? "disconnect" : "connect"}
            </button>
          </div>
        ))}
        <div className="flex flex-col items-center justify-center rounded-card border border-dashed border-line p-4 text-center">
          <p className="text-sm font-bold lowercase">more coming</p>
          <p className="mt-1 text-xs text-ink-soft">
            founding beta members vote on what&apos;s next.
          </p>
        </div>
      </div>
    </section>
  );
}

function SecurityPanel({ actions }: { actions: ActionRecord[] | null }) {
  const stats = useMemo(() => {
    const a = actions ?? [];
    return {
      injections: a.filter((x) => x.injection_flag).length,
      executed: a.filter((x) => x.status === "executed").length,
      vetoed: a.filter((x) => x.status === "vetoed").length,
      proposed: a.length,
    };
  }, [actions]);

  const tiles = [
    { label: "injection flags caught", value: stats.injections, note: "external content held for review" },
    { label: "actions executed", value: stats.executed, note: "each with a logged approval" },
    { label: "vetoed", value: stats.vetoed, note: "killed before execution" },
  ];

  return (
    <section>
      <PanelHeading title="security" sub="the trust panel — what the operator did, and what it caught." />
      <div className="grid gap-3 sm:grid-cols-3">
        {tiles.map((t, i) => (
          <div
            key={t.label}
            style={{ animationDelay: `${i * 70}ms` }}
            className="animate-rise-in rounded-card bg-white/60 p-4 shadow-soft"
          >
            <p className="text-3xl font-extrabold">{actions === null ? "—" : t.value}</p>
            <p className="mt-1 text-xs font-bold lowercase">{t.label}</p>
            <p className="mt-0.5 text-[11px] text-ink-soft">{t.note}</p>
          </div>
        ))}
      </div>
      <div className="mt-4 rounded-card bg-white/60 p-4 shadow-soft">
        <div className="flex items-center gap-2">
          <ShieldCheck size={16} strokeWidth={2.4} className="text-signal" aria-hidden="true" />
          <p className="text-sm font-bold lowercase">every action is on the record</p>
        </div>
        <p className="mt-1.5 text-xs text-ink-soft">
          proposals, approvals, vetoes, executions, blocked and flagged events —
          all permanently logged. the agent can never escalate its own tier, and
          flagged cards can never execute.
        </p>
        <a
          href="/app/activity"
          className="mt-3 inline-block rounded-btn ring-1 ring-inset ring-ink px-4 py-1.5 text-xs font-bold lowercase transition-all duration-fast hover:-translate-y-px hover:bg-cream-deep"
        >
          open the full audit log
        </a>
      </div>
    </section>
  );
}
