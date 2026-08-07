"use client";

import { useEffect, useState } from "react";
import {
  AlertTriangle,
  Check,
  Plug,
  Plus,
  Loader2,
  RefreshCw,
  Search,
  ShieldAlert,
  X,
} from "lucide-react";
import { providersWithoutConnector } from "@/lib/ruleIntents";
import { ConnectorLogo } from "@/components/integrations/ConnectorLogo";
import { ConnectionInsight } from "@/components/account/ConnectionInsight";
import { humanizeActionId, humanizeEndpoint } from "@/lib/integrations/engine/humanize";
import { outcomesFor } from "@/components/account/providerOutcomes";

/**
 * The Connections screen: available third-party apps, the user's connected
 * accounts, and custom MCP servers — each with a status pill and
 * connect / disconnect / re-auth controls — plus the "add custom MCP" flow
 * with inline validation, a test-connection step, and per-tool enable/consent.
 * All secrets stay server-side; this only ever sees status + non-secret views.
 */

interface Capability {
  id: string;
  summary: string;
  mutates: boolean;
  tier: 1 | 2 | 3;
}
interface IntegrationBoundary {
  data: { canAccess: string[]; cannotAccess: string[] };
  actions: { id: string; summary: string; tier: 1 | 2 | 3; requirement: string }[];
}
interface ProviderMeta {
  key: string;
  name: string;
  detail: string;
  authType: string;
  scopeSummary: string;
  configured: boolean;
  /** Env var NAMES needed to connect it. Names only — never values. */
  setupEnv?: string[];
  icon: string;
  actions: Capability[];
  boundary?: IntegrationBoundary;
}

interface PreviewResult {
  ok: boolean;
  tier?: 1 | 2 | 3;
  wouldRequire?: string;
  rules: { text: string; effect: string }[];
  request?: { kind: string; description: string; method?: string; url?: string; keyPlacement?: string; args: Record<string, unknown> };
  note: string;
  error?: string;
}

const TIER_META: Record<number, { label: string; cls: string }> = {
  1: { label: "auto", cls: "bg-cream-deep text-ink-soft" },
  2: { label: "approve", cls: "ring-1 ring-inset ring-signal/50 text-signal" },
  3: { label: "confirm", cls: "bg-signal text-cream" },
};

/** A small badge showing the tier a capability would be proposed at. */
function TierBadge({ tier }: { tier: number }) {
  const t = TIER_META[tier] ?? TIER_META[2];
  return (
    <span
      className={`rounded-pill px-2 py-0.5 text-[9px] font-bold uppercase tracking-wide ${t.cls}`}
      title={`tier ${tier} — ${t.label}`}
    >
      t{tier} · {t.label}
    </span>
  );
}
interface ConnectionView {
  id: string;
  provider_key: string;
  kind: "app" | "mcp" | "custom";
  display_name: string;
  status: "connected" | "needs_reauth" | "error" | "revoked";
  scopes: string | null;
  metadata: Record<string, unknown>;
}

interface CustomApiActionView {
  id: string;
  summary: string;
  method: string;
  path: string;
  risk: "read" | "write" | "destructive";
}
const RISK_TIER_UI: Record<string, 1 | 2 | 3> = { read: 1, write: 2, destructive: 3 };
interface McpTool {
  connection_id: string;
  name: string;
  description: string;
  enabled: boolean;
  sensitive: boolean;
  consented_at: string | null;
  tier?: 1 | 2 | 3;
}
interface Data {
  providers: ProviderMeta[];
  connections: ConnectionView[];
  tools: Record<string, McpTool[]>;
  vaultReady: boolean;
}

const STATUS_STYLE: Record<ConnectionView["status"], { label: string; cls: string }> = {
  connected: { label: "connected", cls: "bg-signal text-cream" },
  needs_reauth: { label: "needs re-auth", cls: "ring-1 ring-inset ring-signal text-signal" },
  error: { label: "error", cls: "ring-1 ring-inset ring-ink/40 text-ink-soft" },
  revoked: { label: "disconnected", cls: "ring-1 ring-inset ring-ink/30 text-ink-soft" },
};

/**
 * An API failure, kept structured rather than flattened to a string.
 *
 * Flattening was the original sin here: `throw new Error(body.message)` turned
 * every backend failure into text the UI then rendered verbatim, so ANY layer
 * — a provider, the crypto module, a rate limiter — could put its own wording
 * in front of a customer. Keeping the code means the UI decides what a person
 * reads, and the server's own sentence is only ever a fallback.
 */
class ApiFailure extends Error {
  constructor(
    public code: string,
    /** The server's sentence. Only shown when no mapping covers the code. */
    public serverMessage: string,
    /** Setting names — present in development builds only. */
    public developer?: string[]
  ) {
    super(serverMessage);
  }
}

/** What a person reads, by failure code. The server's wording is not used. */
const FAILURE_MESSAGE: Record<string, string> = {
  vault_unconfigured:
    "Connecting apps isn't available right now. Please try again later, or contact support.",
  not_configured: "That app isn't available to connect right now. Please try again later, or contact support.",
  unknown_provider: "We don't recognise that app.",
  rate_limited: "That was a lot at once — give it a moment and try again.",
  plan_limit: "You've reached the number of connected apps your plan includes.",
  internal: "Something went wrong on our side. Please try again in a moment.",
};

function readable(err: unknown): string {
  if (err instanceof ApiFailure) {
    return FAILURE_MESSAGE[err.code] ?? "That didn't work. Please try again in a moment.";
  }
  return "That didn't work. Please try again in a moment.";
}

async function api(url: string, init?: RequestInit) {
  const res = await fetch(url, {
    ...init,
    headers: { "Content-Type": "application/json", ...init?.headers },
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new ApiFailure(
      String(body.error ?? "internal"),
      String(body.message ?? ""),
      Array.isArray(body.developer) ? body.developer : undefined
    );
  }
  return body;
}

/**
 * `heading` renders the panel's own "connections" title. It belongs inside the
 * account center, where the panel is one tab among several — but /app/connections
 * is already titled "connections", so that page turns it off rather than
 * stacking the same word twice with two near-identical descriptions under it.
 */
export function ConnectionsPanel({ heading = true }: { heading?: boolean } = {}) {
  const [data, setData] = useState<Data | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [unavailable, setUnavailable] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [addApiOpen, setAddApiOpen] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [preview, setPreview] = useState<PreviewResult | null>(null);

  async function load() {
    try {
      setData(await api("/api/connections"));
      setUnavailable(false);
    } catch {
      // The connections backend isn't fully provisioned on this deployment
      // yet (login + database + per-app setup). Rather than show a scary
      // error, present a calm "coming soon" state — nothing here is broken,
      // the feature just isn't switched on for this site.
      setUnavailable(true);
    }
  }
  useEffect(() => {
    load();
    // Surface the OAuth callback outcome (?status=…) once, then clean the URL.
    const p = new URLSearchParams(window.location.search);
    const s = p.get("status");
    if (s) {
      setNotice(
        s === "connected"
          ? "connected."
          : s === "denied"
            ? "you cancelled that connection."
            : s === "expired"
              ? "that link expired — try connecting again."
              : "that connection didn't complete — try again."
      );
      p.delete("status");
      window.history.replaceState({}, "", `${window.location.pathname}?${p.toString()}`);
    }
  }, []);

  const connByProvider = new Map(
    (data?.connections ?? []).filter((c) => c.kind === "app").map((c) => [c.provider_key, c])
  );
  const mcps = (data?.connections ?? []).filter((c) => c.kind === "mcp");
  const customs = (data?.connections ?? []).filter((c) => c.kind === "custom");

  /**
   * Start connecting an app — or say exactly why it can't be started.
   *
   * This used to be guarded by `disabled`, which meant a provider without
   * credentials had a button that could not be clicked and said nothing. To
   * the person in front of it that is indistinguishable from a broken button,
   * and it hides the one fact that would let them fix it: which environment
   * variables are missing.
   */
  /**
   * The vault key is what makes storing any credential safe. Rather than
   * greying these out — which reads as broken — the control opens and says
   * what is missing.
   */
  function requireVault(): boolean {
    if (data && !data.vaultReady) {
      /**
       * What happened, why, and who can fix it — in that order, with no
       * variable names. The person reading this cannot set an environment
       * variable from a browser, so naming one only tells them they are not
       * the audience. The name lives in account → diagnostics, for whoever is.
       */
      setError(
        "connecting apps isn't switched on for this workspace yet. cosigno won't hold an account's keys until secure storage is turned on, so nothing can be connected until an administrator enables it."
      );
      return false;
    }
    return true;
  }

  async function connect(key: string) {
    const provider = data?.providers.find((p) => p.key === key);
    setError(null);

    if (!requireVault()) return;
    if (provider && !provider.configured) {
      /* The exact key names are a setup task for an administrator, and they
         live in account → diagnostics. Here we say what a person can act on:
         which app, that it is off, and who can switch it on. */
      setError(
        `${provider.name} isn't switched on for this workspace yet. an administrator can enable it — there's nothing to fix on your side.`
      );
      return;
    }

    setBusy(key);
    try {
      const { url } = await api(`/api/connections/${key}/connect`);
      if (!url) throw new Error("the server didn't return a sign-in link for that app.");
      window.location.href = url;
    } catch (e) {
      setError(readable(e));
      setBusy(null);
    }
  }
  async function disconnect(id: string) {
    setBusy(id);
    try {
      await api(`/api/connections/${id}/disconnect`, { method: "POST" });
      await load();
    } catch (e) {
      setError(readable(e));
    } finally {
      setBusy(null);
    }
  }
  async function recheck(id: string) {
    setBusy(id);
    try {
      await api(`/api/connections/${id}/health`, { method: "POST" });
      await load();
    } finally {
      setBusy(null);
    }
  }
  async function propose(connectionId: string, capability: string) {
    setBusy(`${connectionId}:${capability}`);
    setError(null);
    try {
      const { action } = await api(`/api/connections/${connectionId}/propose`, {
        method: "POST",
        body: JSON.stringify({ capability }),
      });
      // Tier-1 (read-only) actions auto-run immediately; tier-2/3 wait at the
      // boundary. Say which actually happened rather than implying it's pending.
      if (action?.status === "executed") {
        setNotice("that was read-only (tier 1), so it ran now — it's logged in activity.");
      } else if (action?.status === "failed") {
        setNotice("that read-only action ran but the endpoint didn't respond — see activity.");
      } else {
        setNotice("prepared — review and approve it at the boundary.");
      }
    } catch (e) {
      setError(readable(e));
    } finally {
      setBusy(null);
    }
  }
  async function runPreview(connectionId: string, capability: string) {
    setBusy(`preview:${connectionId}:${capability}`);
    setError(null);
    try {
      const { preview: p } = await api(`/api/connections/${connectionId}/preview`, {
        method: "POST",
        body: JSON.stringify({ capability }),
      });
      setPreview(p);
    } catch (e) {
      setError(readable(e));
    } finally {
      setBusy(null);
    }
  }

  if (unavailable) {
    return <ConnectionsComingSoon heading={heading} />;
  }
  if (!data && !error) {
    return <ConnectionsSkeleton />;
  }

  return (
    <div className="flex flex-1 flex-col gap-6">
      {heading && <ConnectionsHeading />}

      {notice && (
        <p className="rounded-btn bg-cream-deep px-3 py-2 text-sm font-semibold" role="status">
          {notice}
        </p>
      )}
      {error && (
        <p className="rounded-btn bg-cream-deep px-3 py-2 text-sm font-semibold text-signal" role="alert">
          {error}
        </p>
      )}
      {/* ---- third-party apps ---- */}
      {/*
        Connected first, always. Someone opening this page is far more often
        checking on what already works than shopping for something new, and
        making them scroll past seven things they cannot use to reach the one
        they can is the difference between a product and an admin panel.
      */}
      <AppsSection
        providers={data?.providers ?? []}
        connByProvider={connByProvider}
        vaultReady={data?.vaultReady !== false}
        busy={busy}
        onConnect={connect}
        onDisconnect={disconnect}
        onRecheck={recheck}
      />

      <NotYetAvailable />

      {/* ---- custom MCP servers ---- */}
      <section className="flex flex-col gap-2.5">
        <div className="flex items-center justify-between">
          <h4 className="text-xs font-bold lowercase tracking-wide text-ink-soft">
            custom MCP servers
          </h4>
          <button
            onClick={() => requireVault() && setAddOpen((v) => !v)}
            className="inline-flex items-center gap-1 rounded-btn bg-ink px-3 py-1.5 text-xs font-bold text-cream disabled:bg-cream-deep disabled:text-ink-soft disabled:shadow-none disabled:cursor-not-allowed"
          >
            {addOpen ? <X size={12} /> : <Plus size={12} />}
            {addOpen ? "cancel" : "add server"}
          </button>
        </div>

        {addOpen && <AddMcpForm onAdded={async () => { setAddOpen(false); await load(); }} />}

        {mcps.length === 0 && !addOpen && (
          <p className="rounded-card bg-surface/40 px-4 py-5 text-xs text-ink-soft shadow-soft">
            no custom servers yet. add a remote MCP endpoint to expose its tools
            to your operator — each tool stays off until you enable it.
          </p>
        )}

        {mcps.map((c) => (
          <McpCard
            key={c.id}
            conn={c}
            tools={data?.tools[c.id] ?? []}
            busy={busy}
            onDisconnect={() => disconnect(c.id)}
            onTest={async () => {
              setBusy(c.id);
              try {
                const r = await api(`/api/connections/mcp/${c.id}/test`, { method: "POST" });
                setNotice(r.ok ? `re-tested: ${r.toolCount} tools.` : "the server didn't respond as expected.");
                await load();
              } finally {
                setBusy(null);
              }
            }}
            onReload={load}
          />
        ))}
      </section>

      {/* ---- custom API-key tools ---- */}
      <section className="flex flex-col gap-2.5">
        <div className="flex items-center justify-between">
          <h4 className="text-xs font-bold lowercase tracking-wide text-ink-soft">
            custom API tools
          </h4>
          <button
            onClick={() => requireVault() && setAddApiOpen((v) => !v)}
            className="inline-flex items-center gap-1 rounded-btn bg-ink px-3 py-1.5 text-xs font-bold text-cream disabled:bg-cream-deep disabled:text-ink-soft disabled:shadow-none disabled:cursor-not-allowed"
          >
            {addApiOpen ? <X size={12} /> : <Plus size={12} />}
            {addApiOpen ? "cancel" : "add API tool"}
          </button>
        </div>

        <p className="flex items-start gap-2 rounded-btn bg-cream-deep/60 px-3 py-2 text-[11px] text-ink-soft">
          <ShieldAlert size={13} className="mt-px shrink-0" />
          you&apos;re responsible for custom tools you add. cosigno still requires
          your approval for every action, tiers each one by risk, and treats all
          responses as untrusted.
        </p>

        {addApiOpen && (
          <AddApiToolForm
            onAdded={async () => { setAddApiOpen(false); setNotice("added. review its actions below."); await load(); }}
            onError={(m) => setError(m)}
          />
        )}

        {customs.length === 0 && !addApiOpen && (
          <p className="rounded-card bg-surface/40 px-4 py-5 text-xs text-ink-soft shadow-soft">
            no custom API tools yet. connect any tool with a base URL + API key,
            map its actions, and each one is tiered by risk and waits for your
            signature.
          </p>
        )}

        {customs.map((c) => (
          <CustomApiCard
            key={c.id}
            conn={c}
            busy={busy}
            onDisconnect={() => disconnect(c.id)}
            onPropose={(actionId) => propose(c.id, actionId)}
            onPreview={(actionId) => runPreview(c.id, actionId)}
          />
        ))}
      </section>

      {preview && <PreviewModal preview={preview} onClose={() => setPreview(null)} />}
    </div>
  );
}

/**
 * The dry-run result: exactly what an action WOULD do — its tier, what it would
 * require, the request (with the key's placement but never its value), and any
 * permission rule that applies — with an unmissable "nothing happened" note.
 */
function PreviewModal({ preview, onClose }: { preview: PreviewResult; onClose: () => void }) {
  const req = preview.request;
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-ink/45 p-4 backdrop-blur-[2px]"
      role="dialog"
      aria-modal="true"
      aria-label="action preview"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="w-full max-w-md animate-spring-in rounded-card bg-surface p-6 shadow-depth-lift">
        <div className="flex items-start justify-between gap-3">
          <p className="text-[11px] font-extrabold uppercase tracking-widest text-ink-soft">cosigno would</p>
          <button onClick={onClose} className="rounded-btn p-1 text-ink-soft hover:bg-cream-deep hover:text-ink" aria-label="close preview">
            <X size={16} />
          </button>
        </div>
        {preview.error ? (
          <p className="mt-3 text-sm font-semibold text-signal">{preview.error}</p>
        ) : (
          <>
            {req && (
              <div className="mt-3 rounded-btn bg-cream-deep/60 p-3">
                {req.method && req.url ? (
                  <p className="break-all font-mono text-xs font-bold">
                    <span className="text-signal">{req.method}</span> {req.url}
                  </p>
                ) : (
                  <p className="text-sm font-bold">{req.description}</p>
                )}
                {req.keyPlacement && (
                  <p className="mt-1 font-mono text-[10px] text-ink-soft">{req.keyPlacement}</p>
                )}
                {Object.keys(req.args).length > 0 && (
                  <pre className="mt-1.5 overflow-x-auto rounded bg-surface/70 p-2 font-mono text-[10px] text-ink-soft">
                    {JSON.stringify(req.args, null, 2)}
                  </pre>
                )}
              </div>
            )}
            <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
              <span className="font-bold">then it would require:</span>
              <span
                className={`rounded-pill px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wide ${
                  preview.wouldRequire === "blocked"
                    ? "bg-ink text-cream"
                    : preview.wouldRequire === "auto"
                      ? "bg-cream-deep text-ink-soft"
                      : "bg-signal text-cream"
                }`}
              >
                {preview.wouldRequire}
              </span>
              {preview.tier && <span className="text-ink-soft">tier {preview.tier}</span>}
            </div>
            {preview.rules.length > 0 && (
              <div className="mt-2 flex flex-col gap-1">
                {preview.rules.map((r, i) => (
                  <p key={i} className="text-[11px] text-ink-soft">
                    <span className="font-bold">rule:</span> “{r.text}” — {r.effect}
                  </p>
                ))}
              </div>
            )}
            <p className="mt-3 text-[10px] text-ink-soft/80">
              computed with no arguments — rules that depend on a specific amount or recipient
              are evaluated when the real action runs, and can only tighten this further.
            </p>
            <p className="mt-2 rounded-btn bg-signal/10 px-3 py-2 text-[11px] font-semibold text-signal ring-1 ring-inset ring-signal/30">
              {preview.note}
            </p>
          </>
        )}
      </div>
    </div>
  );
}

/**
 * Calm "coming soon" state, shown when the connections backend isn't fully
 * provisioned for this deployment yet. Nothing is broken — the feature just
 * isn't switched on — so we say exactly that, warmly, instead of an error.
 */
/* ================================================================== apps == */

type Filter = "all" | "connected" | "available" | "setup";

/** The four states a provider can be in, as one badge vocabulary. */
function AppBadge({ state }: { state: "connected" | "attention" | "ready" | "setup" }) {
  const META = {
    connected: { label: "Connected", dot: "bg-signal", text: "text-ink" },
    attention: { label: "Attention", dot: "bg-ink", text: "text-ink" },
    ready: { label: "Ready", dot: "bg-ink/30", text: "text-ink-soft" },
    // Distinct from the "not yet available" section below, which is for tools
    // with no connector at all. This one exists and is simply switched off.
    setup: { label: "Needs setup", dot: "bg-ink/15", text: "text-ink-soft" },
  } as const;
  const m = META[state];
  return (
    <span className={`inline-flex shrink-0 items-center gap-1.5 text-[11px] font-bold ${m.text}`}>
      <span className={`h-1.5 w-1.5 rounded-pill ${m.dot}`} aria-hidden="true" />
      {m.label}
    </span>
  );
}

/**
 * The apps list: a short summary line, a filter, then connected apps before
 * everything else.
 */
function AppsSection({
  providers,
  connByProvider,
  vaultReady,
  busy,
  onConnect,
  onDisconnect,
  onRecheck,
}: {
  providers: ProviderMeta[];
  connByProvider: Map<string, ConnectionView>;
  vaultReady: boolean;
  busy: string | null;
  onConnect: (key: string) => void;
  onDisconnect: (id: string) => void;
  onRecheck: (id: string) => void;
}) {
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Filter>("all");

  const stateOf = (p: ProviderMeta): "connected" | "attention" | "ready" | "setup" => {
    const conn = connByProvider.get(p.key);
    if (conn) return conn.status === "connected" ? "connected" : "attention";
    return p.configured && vaultReady ? "ready" : "setup";
  };

  const counts = {
    connected: providers.filter((p) => stateOf(p) === "connected").length,
    ready: providers.filter((p) => stateOf(p) === "ready").length,
    setup: providers.filter((p) => stateOf(p) === "setup").length,
  };

  const q = query.trim().toLowerCase();
  const visible = providers
    .filter((p) => (q ? p.name.toLowerCase().includes(q) : true))
    .filter((p) => {
      const st = stateOf(p);
      if (filter === "connected") return st === "connected" || st === "attention";
      if (filter === "available") return st === "ready";
      if (filter === "setup") return st === "setup";
      return true;
    });

  /* Connected first — see the note at the call site. */
  const ORDER = { connected: 0, attention: 1, ready: 2, setup: 3 } as const;
  const sorted = [...visible].sort((a, b) => ORDER[stateOf(a)] - ORDER[stateOf(b)]);

  const FILTERS: { id: Filter; label: string; n?: number }[] = [
    { id: "all", label: "All", n: providers.length },
    { id: "connected", label: "Connected", n: counts.connected },
    { id: "available", label: "Available", n: counts.ready },
    { id: "setup", label: "Needs setup", n: counts.setup },
  ];

  return (
    <section className="flex flex-col gap-5">
      <div>
        <h2 className="font-display text-xl font-bold">
          Connected apps let cosigno do real work for you.
        </h2>
        <p className="mt-1 max-w-2xl text-sm text-ink-soft">
          Nothing is touched until you connect it, and anything that changes something
          still waits for your approval.
        </p>
        {/*
          One quiet line, not a red banner across a page about seven apps. The
          reason still has to be readable without opening anything — otherwise
          seven cards say "Needs setup" and none of them says why.
        */}
        {!vaultReady && (
          <p className="mt-2.5 inline-flex items-center gap-2 rounded-pill bg-cream-deep px-3 py-1.5 text-xs font-semibold text-ink-soft">
            <ShieldAlert size={13} className="shrink-0" aria-hidden="true" />
            Connecting apps isn&apos;t switched on for this workspace yet — an administrator
            can enable it.
          </p>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <label className="relative flex-1 sm:max-w-xs">
          <Search
            size={14}
            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-soft"
            aria-hidden="true"
          />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search apps…"
            aria-label="search apps"
            className="h-9 w-full rounded-pill bg-cream-deep pl-8 pr-3 text-sm outline-none transition focus:ring-2 focus:ring-signal"
          />
        </label>
        <div className="flex flex-wrap gap-1.5">
          {FILTERS.map((f) => (
            <button
              key={f.id}
              onClick={() => setFilter(f.id)}
              aria-pressed={filter === f.id}
              className={`rounded-pill px-3 py-1.5 text-xs font-bold transition-colors duration-fast ${
                filter === f.id
                  ? "bg-ink text-cream"
                  : "text-ink-soft hover:bg-cream-deep hover:text-ink"
              }`}
            >
              {f.label}
              {typeof f.n === "number" && <span className="ml-1 opacity-60">{f.n}</span>}
            </button>
          ))}
        </div>
      </div>

      {sorted.length === 0 ? (
        <p className="rounded-card bg-surface/60 px-5 py-10 text-center text-sm text-ink-soft shadow-soft">
          {q ? `No app matches “${query}”.` : "Nothing here."}
        </p>
      ) : (
        <div className="flex flex-col gap-2">
          {sorted.map((p, i) => (
            <AppRow
              key={p.key}
              provider={p}
              connection={connByProvider.get(p.key)}
              state={stateOf(p)}
              vaultReady={vaultReady}
              busy={busy}
              index={i}
              onConnect={onConnect}
              onDisconnect={onDisconnect}
              onRecheck={onRecheck}
            />
          ))}
        </div>
      )}
    </section>
  );
}

/**
 * One app, one row.
 *
 * Collapsed it answers the only question that matters at a glance — is this
 * on, and what does it do for me. Everything else (the operations, the
 * approval level each one lands at, what an administrator would need to
 * switch on) is real and stays available, one disclosure down, where it does
 * not compete with the decision.
 */
function AppRow({
  provider,
  connection,
  state,
  vaultReady,
  busy,
  index,
  onConnect,
  onDisconnect,
  onRecheck,
}: {
  provider: ProviderMeta;
  connection?: ConnectionView;
  state: "connected" | "attention" | "ready" | "setup";
  vaultReady: boolean;
  busy: string | null;
  index: number;
  onConnect: (key: string) => void;
  onDisconnect: (id: string) => void;
  onRecheck: (id: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const outcomes = outcomesFor(provider.key);
  const account = connection?.metadata?.account;

  return (
    <div
      style={{ animationDelay: `${Math.min(index, 8) * 45}ms` }}
      className="rounded-card bg-surface/60 shadow-soft transition-shadow duration-base ease-brand-out animate-rise-in hover:shadow-depth"
    >
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3.5">
        <ConnectorLogo kind="app" providerKey={provider.key} displayName={provider.name} size={28} />

        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2.5">
            <p className="truncate text-sm font-extrabold">{provider.name}</p>
            <AppBadge state={state} />
          </div>
          <p className="mt-0.5 truncate text-xs text-ink-soft">
            {account ? `${String(account)} · ` : ""}
            {outcomes.headline}
          </p>
        </div>

        <div className="flex shrink-0 items-center gap-1.5">
          <button
            onClick={() => setOpen((v) => !v)}
            aria-expanded={open}
            className="rounded-btn px-2.5 py-1.5 text-xs font-bold text-ink-soft transition-colors duration-fast hover:bg-cream-deep hover:text-ink"
          >
            {open ? "Less" : "Details"}
          </button>
          {connection ? (
            <>
              {connection.status !== "connected" && (
                <button
                  onClick={() => onConnect(provider.key)}
                  className="rounded-btn bg-signal px-3 py-1.5 text-xs font-bold text-ink transition-transform duration-fast active:scale-95"
                >
                  Reconnect
                </button>
              )}
              <button
                onClick={() => onRecheck(connection.id)}
                disabled={busy === connection.id}
                title="check this connection"
                aria-label={`check ${provider.name}`}
                className="rounded-btn px-2 py-1.5 text-ink-soft transition-colors duration-fast hover:bg-cream-deep hover:text-ink"
              >
                <RefreshCw size={13} className={busy === connection.id ? "animate-spin" : ""} />
              </button>
              <button
                onClick={() => onDisconnect(connection.id)}
                disabled={busy === connection.id}
                className="rounded-btn px-3 py-1.5 text-xs font-bold text-ink-soft transition-colors duration-fast hover:bg-cream-deep hover:text-ink"
              >
                Disconnect
              </button>
            </>
          ) : (
            <button
              onClick={() => onConnect(provider.key)}
              disabled={busy === provider.key}
              className="inline-flex items-center gap-1.5 rounded-btn bg-ink px-3.5 py-1.5 text-xs font-bold text-cream transition-transform duration-fast active:scale-95 disabled:opacity-60"
            >
              {busy === provider.key ? (
                <>
                  <Loader2 size={12} className="animate-spin" aria-hidden="true" /> Connecting…
                </>
              ) : (
                "Connect"
              )}
            </button>
          )}
        </div>
      </div>

      {open && (
        <div className="border-t border-line/60 px-4 py-4">
          <AppDetails provider={provider} connection={connection} state={state} vaultReady={vaultReady} />
        </div>
      )}
    </div>
  );
}

function AppDetails({
  provider,
  connection,
  state,
  vaultReady,
}: {
  provider: ProviderMeta;
  connection?: ConnectionView;
  state: "connected" | "attention" | "ready" | "setup";
  vaultReady: boolean;
}) {
  const outcomes = outcomesFor(provider.key);
  return (
    <div className="flex flex-col gap-4">
      {outcomes.can.length > 0 && (
        <div>
          <p className="text-[11px] font-black uppercase tracking-[0.16em] text-ink-soft">
            What it can do for you
          </p>
          <ul className="mt-2 grid gap-1.5 sm:grid-cols-2">
            {outcomes.can.slice(0, 4).map((line) => (
              <li key={line} className="flex items-start gap-2 text-sm">
                <Check size={14} className="mt-0.5 shrink-0 text-signal" aria-hidden="true" />
                {line}
              </li>
            ))}
          </ul>
          <p className="mt-2 text-xs font-semibold text-ink-soft">{outcomes.never}</p>
        </div>
      )}

      {/*
        The setup gap belongs HERE, on the app it affects, not as a banner
        across a page about seven other apps that are fine.
      */}
      {state === "setup" && (
        <div className="rounded-btn bg-cream-deep px-3 py-2.5">
          <p className="text-xs font-bold">
            {vaultReady
              ? `${provider.name} isn't switched on for this workspace yet.`
              : "Connecting apps isn't switched on for this workspace yet."}
          </p>
          <p className="mt-0.5 text-xs text-ink-soft">
            An administrator can enable it — there&apos;s nothing to fix on your side.
          </p>
          <DeveloperDetails provider={provider} vaultReady={vaultReady} />
        </div>
      )}

      {connection && <ConnectionInsight connectionId={connection.id} providerName={provider.name} />}

      {/*
        Operations, and the approval level each lands at. Real, exact, and
        deliberately not the first thing anyone reads — this is the answer to
        "prove it", not to "what is this".
      */}
      <details className="group">
        <summary className="cursor-pointer list-none text-xs font-bold text-ink-soft transition-colors hover:text-ink">
          <span className="underline decoration-dotted underline-offset-4">Technical details</span>
        </summary>
        <div className="mt-3 flex flex-col gap-2">
          <p className="text-xs text-ink-soft">{provider.scopeSummary}</p>
          <ul className="flex flex-col gap-1">
            {provider.actions.map((a) => (
              <li
                key={a.id}
                className="flex flex-wrap items-center gap-2 rounded-btn bg-cream/40 px-3 py-1.5 text-xs"
              >
                <span className="font-mono text-[11px] text-ink-soft">{a.id}</span>
                <span className="min-w-0 flex-1 text-ink-soft">{a.summary}</span>
                <TierBadge tier={a.tier} />
              </li>
            ))}
          </ul>
        </div>
      </details>
    </div>
  );
}

/**
 * Setting names, for the person who can act on them — and only in development.
 *
 * In a real workspace an end user seeing GOOGLE_CLIENT_ID learns nothing they
 * can use; it just tells them they are not the audience. There is no admin
 * role in this product yet, so rather than invent one this discloses in
 * development builds only, and says so.
 */
function DeveloperDetails({ provider, vaultReady }: { provider: ProviderMeta; vaultReady: boolean }) {
  if (process.env.NODE_ENV !== "development") return null;
  const names = [...(vaultReady ? [] : ["INTEGRATIONS_ENCRYPTION_KEY"]), ...(provider.setupEnv ?? [])];
  if (names.length === 0) return null;
  return (
    <details className="mt-2">
      <summary className="cursor-pointer list-none text-[11px] font-bold text-ink-soft underline decoration-dotted underline-offset-4">
        Developer details (shown in development only)
      </summary>
      <ul className="mt-1.5 flex flex-col gap-0.5">
        {names.map((n) => (
          <li key={n} className="font-mono text-[11px] text-ink-soft">
            {n} — not set
          </li>
        ))}
      </ul>
    </details>
  );
}

/**
 * Systems cosigno understands the words for but has no connector to — Stripe
 * and Dropbox today.
 *
 * They are listed because a rule can name them, and a page that showed only
 * what works would let a person assume anything unmentioned is handled. The
 * list is derived from the connector tables, so it empties itself the day
 * those connectors ship rather than needing to be remembered.
 */
function NotYetAvailable() {
  const missing = providersWithoutConnector();
  if (missing.length === 0) return null;
  return (
    <section className="flex flex-col gap-2.5">
      <h4 className="text-xs font-bold lowercase tracking-wide text-ink-soft">not yet available</h4>
      <div className="rounded-card bg-surface/60 p-4 shadow-soft">
        <div className="flex flex-wrap items-center gap-2">
          {missing.map((m) => (
            <span
              key={m.provider}
              className="inline-flex items-center gap-1.5 rounded-pill bg-cream-deep px-2.5 py-1 text-xs font-bold text-ink-soft"
            >
              {m.label}
              <span className="text-[10px] font-black uppercase tracking-wider">
                no connector
              </span>
            </span>
          ))}
        </div>
        <p className="mt-2.5 text-[11px] text-ink-soft">
          cosigno can&apos;t work with these at all yet — not switched off, not built. a safety
          rule naming one is saved and understood, but it protects nothing until support
          arrives. nothing here is hidden: if a tool isn&apos;t listed anywhere above,
          cosigno can&apos;t touch it.
        </p>
      </div>
    </section>
  );
}

/** The panel's own title — one definition, shared by every state it can be in. */
function ConnectionsHeading() {
  return (
    <div>
      <h3 className="text-sm font-extrabold lowercase tracking-widest text-ink-soft">
        connections
      </h3>
      <p className="mt-1 text-xs text-ink-soft">
        the apps and MCP servers cosigno can act across — each stays off until
        you connect it, and every action still waits for your signature.
      </p>
    </div>
  );
}

function ConnectionsComingSoon({ heading }: { heading: boolean }) {
  return (
    <div className="flex flex-1 flex-col gap-6">
      {heading && <ConnectionsHeading />}
      <div className="group flex flex-1 flex-col items-center justify-center rounded-card bg-surface/60 px-8 py-16 text-center shadow-soft transition-all duration-slow ease-brand-out animate-spring-in hover:-translate-y-0.5 hover:shadow-depth">
        {/* Icon badge: radiating signal rings behind a gently floating plug. */}
        <div
          className="relative mb-6 animate-rise-in"
          style={{ animationDelay: "80ms" }}
        >
          <span
            aria-hidden="true"
            className="absolute inset-0 rounded-card ring-2 ring-signal/40 animate-orb-ring"
          />
          <span
            aria-hidden="true"
            className="absolute inset-0 rounded-card ring-2 ring-signal/30 animate-orb-ring [animation-delay:900ms]"
          />
          <div className="relative flex h-16 w-16 items-center justify-center rounded-card bg-cream-deep shadow-soft transition-transform duration-slow ease-brand-out group-hover:scale-105">
            <Plug size={28} className="text-ink animate-float" />
          </div>
        </div>
        <p
          className="text-lg font-extrabold animate-rise-in"
          style={{ animationDelay: "160ms" }}
        >
          connections are coming soon
        </p>
        <p
          className="mx-auto mt-2 max-w-md text-sm text-ink-soft animate-rise-in"
          style={{ animationDelay: "240ms" }}
        >
          this is where you&apos;ll link the apps cosigno can act across — like
          GitHub, Google, and Slack — each one off until you connect it, and every
          action still waiting for your signature. we&apos;re putting the final
          pieces in place. check back shortly.
        </p>
      </div>
    </div>
  );
}

/**
 * A layout-matched placeholder shown while the first load is in flight. It
 * mirrors the real Connections shell — heading, four app-card rows with a
 * fixed-size logo box, and the MCP section — so nothing shifts when the data
 * arrives (no CLS, no flash from a spinner to a full page).
 */
function ConnectionsSkeleton() {
  return (
    <div className="flex flex-col gap-6" aria-busy="true" aria-label="loading connections">
      <div>
        <div className="h-3.5 w-28 rounded-pill bg-cream-deep" />
        <div className="mt-2 h-3 w-3/4 rounded-pill bg-cream-deep/70" />
      </div>
      <section className="flex flex-col gap-2.5">
        <div className="h-3 w-10 rounded-pill bg-cream-deep/70" />
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="rounded-card bg-surface/60 p-4 shadow-soft">
            <div className="flex items-center gap-2">
              <span className="h-[26px] w-[26px] shrink-0 rounded-btn bg-cream-deep" />
              <span className="h-3.5 w-24 rounded-pill bg-cream-deep" />
              <span className="ml-auto h-7 w-20 rounded-btn bg-cream-deep" />
            </div>
            <div className="mt-2.5 h-2.5 w-2/3 rounded-pill bg-cream-deep/70" />
            <div className="mt-1.5 h-2.5 w-1/3 rounded-pill bg-cream-deep/50" />
          </div>
        ))}
      </section>
      <section className="flex flex-col gap-2.5">
        <div className="h-3 w-32 rounded-pill bg-cream-deep/70" />
        <div className="rounded-card bg-surface/40 px-4 py-5 shadow-soft">
          <div className="h-2.5 w-4/5 rounded-pill bg-cream-deep/60" />
        </div>
      </section>
    </div>
  );
}

function StatusPill({ status }: { status: ConnectionView["status"] }) {
  const s = STATUS_STYLE[status];
  return (
    <span className={`inline-flex items-center gap-1 rounded-pill px-2.5 py-0.5 text-[10px] font-bold lowercase tracking-wide ${s.cls}`}>
      {status === "connected" && <Check size={10} strokeWidth={3} />}
      {status === "needs_reauth" && <AlertTriangle size={10} />}
      {s.label}
    </span>
  );
}

function McpCard({
  conn,
  tools,
  busy,
  onDisconnect,
  onTest,
  onReload,
}: {
  conn: ConnectionView;
  tools: McpTool[];
  busy: string | null;
  onDisconnect: () => void;
  onTest: () => void;
  onReload: () => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const url = String(conn.metadata?.url ?? "");

  return (
    <div className="rounded-card bg-surface/60 p-4 shadow-soft">
      <div className="flex flex-wrap items-center gap-2">
        <ConnectorLogo
          kind="mcp"
          providerKey="mcp"
          displayName={conn.display_name}
          customIcon={conn.metadata?.icon}
          size={26}
        />
        <span className="text-sm font-extrabold">{conn.display_name}</span>
        <StatusPill status={conn.status} />
        <span className="rounded-pill bg-cream-deep px-2 py-0.5 text-[10px] font-bold lowercase text-ink-soft">
          {tools.length} tools
        </span>
        <span className="ml-auto flex gap-2">
          <button onClick={onTest} disabled={busy === conn.id} className="rounded-btn px-2 py-1.5 text-xs font-bold text-ink-soft hover:bg-cream-deep" title="test connection">
            <RefreshCw size={12} className={busy === conn.id ? "animate-spin" : ""} />
          </button>
          <button onClick={onDisconnect} disabled={busy === conn.id} className="rounded-btn px-3 py-1.5 text-xs font-bold ring-1 ring-inset ring-ink hover:bg-cream-deep">
            disconnect
          </button>
        </span>
      </div>
      <p className="mt-1 truncate text-[11px] text-ink-soft" title={url}>{url}</p>

      <button
        onClick={() => setOpen((v) => !v)}
        className="mt-2 text-xs font-bold lowercase text-ink-soft underline underline-offset-2"
      >
        {open ? "hide tools" : "manage tools"}
      </button>
      {open && (
        <div className="mt-2 flex flex-col gap-1.5">
          {tools.length === 0 && <p className="text-xs text-ink-soft">this server advertised no usable tools.</p>}
          {tools.map((t) => (
            <ToolRow key={t.name} conn={conn} tool={t} onReload={onReload} />
          ))}
        </div>
      )}
    </div>
  );
}

function ToolRow({
  conn,
  tool,
  onReload,
}: {
  conn: ConnectionView;
  tool: McpTool;
  onReload: () => Promise<void>;
}) {
  const [busy, setBusy] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function set(enabled: boolean, consent = false) {
    setBusy(true);
    setError(null);
    try {
      await api(`/api/connections/mcp/${conn.id}/tools`, {
        method: "POST",
        body: JSON.stringify({ name: tool.name, enabled, consent }),
      });
      setConfirming(false);
      await onReload();
    } catch (e) {
      setError(readable(e));
    } finally {
      setBusy(false);
    }
  }

  function toggle() {
    if (tool.enabled) return set(false);
    if (tool.sensitive && !tool.consented_at) {
      setConfirming(true);
      return;
    }
    return set(true);
  }

  return (
    <div className="rounded-btn bg-cream-deep/60 px-3 py-2">
      <div className="flex items-center gap-2">
        {/* An MCP tool name is a developer identifier from a third-party
            server. Lead with what it does; keep the raw name for whoever
            needs to match it against the server's own docs. */}
        <span className="text-[12px] font-bold">{humanizeActionId(tool.name)}</span>
        <span className="font-mono text-[10px] text-ink-soft/70">{tool.name}</span>
        {tool.tier && <TierBadge tier={tool.tier} />}
        {tool.sensitive && (
          <span className="inline-flex items-center gap-1 rounded-pill bg-signal/15 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-signal">
            <ShieldAlert size={9} /> sensitive
          </span>
        )}
        <button
          onClick={toggle}
          disabled={busy}
          aria-pressed={tool.enabled}
          className={`ml-auto rounded-pill px-3 py-1 text-[11px] font-bold lowercase ${
            tool.enabled ? "bg-signal text-cream" : "ring-1 ring-inset ring-ink text-ink"
          }`}
        >
          {busy ? "…" : tool.enabled ? "enabled" : "enable"}
        </button>
      </div>
      <p className="mt-0.5 text-[11px] text-ink-soft">{tool.description || "(no description)"}</p>
      {confirming && (
        <div className="mt-2 rounded-btn bg-cream p-2 ring-1 ring-inset ring-signal/40">
          <p className="text-[11px] font-semibold text-ink">
            this tool can read or change data. enable it for your operator to use?
          </p>
          <div className="mt-1.5 flex gap-2">
            <button onClick={() => set(true, true)} disabled={busy} className="rounded-btn bg-signal px-3 py-1 text-[11px] font-bold text-ink">
              yes, enable
            </button>
            <button onClick={() => setConfirming(false)} className="rounded-btn px-3 py-1 text-[11px] font-bold text-ink-soft hover:bg-cream-deep">
              cancel
            </button>
          </div>
        </div>
      )}
      {error && <p className="mt-1 text-[11px] font-semibold text-signal">{error}</p>}
    </div>
  );
}

function AddMcpForm({ onAdded }: { onAdded: () => Promise<void> }) {
  const [displayName, setDisplayName] = useState("");
  const [url, setUrl] = useState("");
  const [transport, setTransport] = useState<"http" | "sse">("http");
  const [bearer, setBearer] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<string | null>(null);

  const urlValid = /^https:\/\/.+/.test(url.trim()) || /^http:\/\/(localhost|127\.0\.0\.1)/.test(url.trim());
  const ready = displayName.trim().length > 0 && urlValid && !busy;

  async function submit() {
    setBusy(true);
    setError(null);
    setResult(null);
    try {
      const r = await api("/api/connections/mcp", {
        method: "POST",
        body: JSON.stringify({
          displayName: displayName.trim(),
          url: url.trim(),
          transport,
          bearer: bearer.trim() || undefined,
        }),
      });
      const bits = [`${r.toolCount} tools discovered`];
      if (r.rejected?.length) bits.push(`${r.rejected.length} rejected`);
      if (r.flagged?.length) bits.push(`${r.flagged.length} flagged`);
      setResult(bits.join(" · ") + " — all off until you enable them.");
      await onAdded();
    } catch (e) {
      setError(readable(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-card bg-surface/70 p-4 shadow-depth">
      <p className="text-xs font-bold lowercase tracking-wide text-ink-soft">add a remote MCP server</p>
      <div className="mt-3 flex flex-col gap-3">
        <Labeled label="name">
          <input value={displayName} onChange={(e) => setDisplayName(e.target.value)} placeholder="my knowledge server" className="w-full rounded-btn bg-cream-deep px-3 py-2 text-sm" />
        </Labeled>
        <Labeled label="server URL" hint={url && !urlValid ? "use an https:// URL (or http://localhost)" : undefined}>
          <input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://mcp.example.com/rpc" className={`w-full rounded-btn bg-cream-deep px-3 py-2 text-sm ${url && !urlValid ? "ring-1 ring-inset ring-signal" : ""}`} />
        </Labeled>
        <div className="flex gap-3">
          <Labeled label="transport">
            <select value={transport} onChange={(e) => setTransport(e.target.value as "http" | "sse")} className="rounded-btn bg-cream-deep px-3 py-2 text-sm">
              <option value="http">HTTP (streamable)</option>
              <option value="sse">SSE</option>
            </select>
          </Labeled>
          <Labeled label="bearer token (optional)" className="flex-1">
            <input value={bearer} onChange={(e) => setBearer(e.target.value)} type="password" placeholder="if the server needs auth" className="w-full rounded-btn bg-cream-deep px-3 py-2 text-sm" />
          </Labeled>
        </div>
        {error && <p className="text-xs font-semibold text-signal">{error}</p>}
        {result && <p className="text-xs font-semibold text-ink">{result}</p>}
        <button onClick={submit} disabled={!ready} className="self-start rounded-btn bg-signal px-4 py-2 text-sm font-extrabold text-ink disabled:bg-cream-deep disabled:text-ink-soft disabled:shadow-none disabled:cursor-not-allowed">
          {busy ? "testing connection…" : "test & add"}
        </button>
      </div>
    </div>
  );
}

function Labeled({
  label,
  hint,
  className = "",
  children,
}: {
  label: string;
  hint?: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <label className={`flex flex-col gap-1 ${className}`}>
      <span className="text-[11px] font-bold lowercase tracking-wide text-ink-soft">{label}</span>
      {children}
      {hint && <span className="text-[11px] font-semibold text-signal">{hint}</span>}
    </label>
  );
}

/**
 * A connected custom API tool: its endpoint, status, and mapped actions — each
 * with the SERVER-assigned tier and a "propose" control. Disconnect (with a
 * confirm) is the kill switch. No secret is ever shown here.
 */
function CustomApiCard({
  conn,
  busy,
  onDisconnect,
  onPropose,
  onPreview,
}: {
  conn: ConnectionView;
  busy: string | null;
  onDisconnect: () => void;
  onPropose: (actionId: string) => void;
  onPreview: (actionId: string) => void;
}) {
  const meta = conn.metadata as { base_url?: string; actions?: CustomApiActionView[] };
  const actions = meta.actions ?? [];
  return (
    <div className="rounded-card bg-surface/60 p-4 shadow-soft">
      <div className="flex flex-wrap items-center gap-2">
        <Plug size={18} className="text-ink-soft" />
        <span className="text-sm font-extrabold">{conn.display_name}</span>
        <StatusPill status={conn.status} />
        <button
          onClick={() => {
            if (confirm(`disconnect "${conn.display_name}"? this stops all its actions immediately.`)) onDisconnect();
          }}
          disabled={busy === conn.id}
          className="ml-auto rounded-btn px-3 py-1.5 text-xs font-bold ring-1 ring-inset ring-ink hover:bg-cream-deep"
        >
          disconnect
        </button>
      </div>
      {meta.base_url && (
        <p className="mt-1 font-mono text-[11px] text-ink-soft/80">{meta.base_url}</p>
      )}
      <div className="mt-2 flex flex-col gap-1.5">
        {actions.map((a) => (
          <div key={a.id} className="flex items-center gap-2 rounded-btn bg-cream-deep/60 px-3 py-1.5">
            {/* Business language leads; the endpoint stays as context. The
                thing read immediately before approving should say what the
                action DOES, not which verb and path implement it. */}
            <span className="text-[11px] font-bold">{humanizeEndpoint(a.method, a.path)}</span>
            <span className="font-mono text-[10px] text-ink-soft/70">
              {a.method} {a.path}
            </span>
            <TierBadge tier={RISK_TIER_UI[a.risk] ?? 2} />
            <span className="min-w-0 flex-1 truncate text-[11px] text-ink-soft" title={a.summary}>
              {a.summary}
            </span>
            {conn.status === "connected" && (
              <>
                <button
                  onClick={() => onPreview(a.id)}
                  disabled={busy === `preview:${conn.id}:${a.id}`}
                  className="shrink-0 rounded-pill px-2.5 py-1 text-[10px] font-bold lowercase text-ink-soft hover:bg-cream-deep disabled:opacity-50 disabled:cursor-not-allowed"
                  title="dry-run: see what this would do, without doing it"
                >
                  {busy === `preview:${conn.id}:${a.id}` ? "…" : "dry run"}
                </button>
                <button
                  onClick={() => onPropose(a.id)}
                  disabled={busy === `${conn.id}:${a.id}`}
                  className="shrink-0 rounded-pill px-2.5 py-1 text-[10px] font-bold lowercase ring-1 ring-inset ring-ink hover:bg-cream-deep disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {busy === `${conn.id}:${a.id}` ? "…" : "propose"}
                </button>
              </>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

type DraftAction = { id: string; summary: string; method: string; path: string };

/**
 * "Add custom API tool" — base URL + API key + one or more mapped actions.
 * The server SSRF-checks the URL, tiers each action by risk, and encrypts the
 * key; this form only collects and posts.
 */
function AddApiToolForm({
  onAdded,
  onError,
}: {
  onAdded: () => void | Promise<void>;
  onError: (m: string) => void;
}) {
  const [name, setName] = useState("");
  const [baseUrl, setBaseUrl] = useState("");
  const [placement, setPlacement] = useState<"bearer" | "header" | "query">("bearer");
  const [authName, setAuthName] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [actions, setActions] = useState<DraftAction[]>([
    { id: "", summary: "", method: "GET", path: "" },
  ]);
  const [busy, setBusy] = useState(false);

  // OpenAPI import — paste a spec, detect its operations, prefill the builder.
  const [importOpen, setImportOpen] = useState(false);
  const [spec, setSpec] = useState("");
  const [importing, setImporting] = useState(false);
  const [importMsg, setImportMsg] = useState<string | null>(null);

  function setAction(i: number, patch: Partial<DraftAction>) {
    setActions((prev) => prev.map((a, j) => (j === i ? { ...a, ...patch } : a)));
  }

  async function importSpec() {
    setImporting(true);
    setImportMsg(null);
    try {
      const { detected } = await api("/api/connections/openapi", {
        method: "POST",
        body: JSON.stringify({ spec }),
      });
      const found = detected.actions as { id: string; summary: string; method: string; path: string }[];
      const capped = found.slice(0, 20);
      if (!name.trim() && detected.title) setName(detected.title);
      if (!baseUrl.trim() && detected.base_url) setBaseUrl(detected.base_url);
      setActions(capped.map((a) => ({ id: a.id, summary: a.summary, method: a.method, path: a.path })));
      const extra = found.length > 20 ? ` (showing the first 20 of ${found.length})` : "";
      setImportMsg(`detected ${found.length} action${found.length === 1 ? "" : "s"}${extra}. review the tiers, add your key, then activate.`);
      setImportOpen(false);
    } catch (e) {
      setImportMsg(readable(e));
    } finally {
      setImporting(false);
    }
  }

  async function submit() {
    setBusy(true);
    try {
      await api("/api/connections/custom", {
        method: "POST",
        body: JSON.stringify({
          name: name.trim(),
          base_url: baseUrl.trim(),
          auth: { placement, ...(placement !== "bearer" && authName.trim() ? { name: authName.trim() } : {}) },
          api_key: apiKey,
          actions: actions
            .filter((a) => a.id.trim() && a.path.trim() && a.summary.trim())
            .map((a) => ({ id: a.id.trim(), summary: a.summary.trim(), method: a.method, path: a.path.trim() })),
        }),
      });
      await onAdded();
    } catch (e) {
      onError(readable(e));
    } finally {
      setBusy(false);
    }
  }

  const inputCls = "w-full rounded-btn bg-surface px-3 py-2 text-sm shadow-soft focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-signal";

  return (
    <div className="flex flex-col gap-3 rounded-card bg-surface/60 p-4 shadow-soft">
      {/* Import from an OpenAPI / Swagger spec — detects actions + risk tiers. */}
      <div className="rounded-btn bg-cream-deep/50 p-3">
        <button
          type="button"
          onClick={() => setImportOpen((v) => !v)}
          className="text-xs font-bold lowercase text-ink underline underline-offset-2"
        >
          {importOpen ? "hide OpenAPI import" : "import from an OpenAPI spec"}
        </button>
        {importOpen && (
          <div className="mt-2 flex flex-col gap-2">
            <textarea
              value={spec}
              onChange={(e) => setSpec(e.target.value)}
              rows={4}
              placeholder='paste the OpenAPI/Swagger JSON — cosigno detects each operation and its risk tier. nothing is fetched or stored; you review and add your key below.'
              className="w-full resize-y rounded-btn bg-surface px-3 py-2 font-mono text-[11px] shadow-soft"
            />
            <button
              type="button"
              onClick={importSpec}
              disabled={importing || spec.trim().length < 2}
              className="self-start rounded-btn bg-ink px-3 py-1.5 text-xs font-bold text-cream disabled:bg-cream-deep disabled:text-ink-soft disabled:shadow-none disabled:cursor-not-allowed"
            >
              {importing ? "detecting…" : "detect actions"}
            </button>
          </div>
        )}
        {importMsg && <p className="mt-2 text-[11px] font-semibold text-ink">{importMsg}</p>}
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <Labeled label="name">
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Acme API" className={inputCls} />
        </Labeled>
        <Labeled label="base URL" hint="must be a public https endpoint">
          <input value={baseUrl} onChange={(e) => setBaseUrl(e.target.value)} placeholder="https://api.acme.com" className={inputCls} />
        </Labeled>
        <Labeled label="auth">
          <select value={placement} onChange={(e) => setPlacement(e.target.value as typeof placement)} className={inputCls}>
            <option value="bearer">bearer token</option>
            <option value="header">custom header</option>
            <option value="query">query param</option>
          </select>
        </Labeled>
        {placement !== "bearer" ? (
          <Labeled label={placement === "header" ? "header name" : "param name"}>
            <input value={authName} onChange={(e) => setAuthName(e.target.value)} placeholder={placement === "header" ? "X-API-Key" : "api_key"} className={inputCls} />
          </Labeled>
        ) : (
          <div />
        )}
        <Labeled label="API key" className="sm:col-span-2">
          <input type="password" value={apiKey} onChange={(e) => setApiKey(e.target.value)} placeholder="sk_…" className={inputCls} autoComplete="off" />
        </Labeled>
      </div>

      <div className="flex flex-col gap-2">
        <span className="text-[11px] font-bold lowercase tracking-wide text-ink-soft">actions</span>
        {actions.map((a, i) => (
          <div key={i} className="grid gap-2 sm:grid-cols-[5rem_1fr_1fr]">
            <select value={a.method} onChange={(e) => setAction(i, { method: e.target.value })} className={inputCls}>
              {["GET", "POST", "PUT", "PATCH", "DELETE"].map((m) => <option key={m}>{m}</option>)}
            </select>
            <input value={a.id} onChange={(e) => setAction(i, { id: e.target.value })} placeholder="action_id" className={`${inputCls} font-mono`} />
            <input value={a.path} onChange={(e) => setAction(i, { path: e.target.value })} placeholder="/v1/things/{id}" className={`${inputCls} font-mono`} />
            <input value={a.summary} onChange={(e) => setAction(i, { summary: e.target.value })} placeholder="what this action does" className={`${inputCls} sm:col-span-3`} />
          </div>
        ))}
        <button
          onClick={() => setActions((p) => [...p, { id: "", summary: "", method: "GET", path: "" }])}
          className="self-start rounded-btn px-3 py-1.5 text-xs font-bold ring-1 ring-inset ring-ink hover:bg-cream-deep"
        >
          + another action
        </button>
      </div>

      <p className="flex items-start gap-1.5 text-[11px] text-ink-soft">
        <AlertTriangle size={12} className="mt-px shrink-0" />
        cosigno tiers each action by risk automatically — writes wait for approval,
        deletes/payments need typed confirmation. it never runs auto unless it&apos;s
        provably read-only.
      </p>

      <button
        onClick={submit}
        disabled={busy || !name.trim() || !baseUrl.trim() || !apiKey.trim()}
        className="inline-flex items-center justify-center gap-1.5 rounded-btn bg-ink px-4 py-2.5 text-sm font-extrabold text-cream disabled:bg-cream-deep disabled:text-ink-soft disabled:shadow-none disabled:cursor-not-allowed"
      >
        {busy ? "adding…" : <><Check size={14} /> add tool</>}
      </button>
    </div>
  );
}
