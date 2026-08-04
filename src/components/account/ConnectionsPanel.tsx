"use client";

import { useEffect, useState } from "react";
import {
  AlertTriangle,
  Check,
  Plug,
  Plus,
  RefreshCw,
  ShieldAlert,
  X,
} from "lucide-react";
import { ConnectorLogo } from "@/components/integrations/ConnectorLogo";
import { ConnectionInsight } from "@/components/account/ConnectionInsight";

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

async function api(url: string, init?: RequestInit) {
  const res = await fetch(url, {
    ...init,
    headers: { "Content-Type": "application/json", ...init?.headers },
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.message || body.error || "something went wrong.");
  return body;
}

export function ConnectionsPanel() {
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

  async function connect(key: string) {
    setBusy(key);
    setError(null);
    try {
      const { url } = await api(`/api/connections/${key}/connect`);
      window.location.href = url;
    } catch (e) {
      setError(e instanceof Error ? e.message : "couldn't start that connection.");
      setBusy(null);
    }
  }
  async function disconnect(id: string) {
    setBusy(id);
    try {
      await api(`/api/connections/${id}/disconnect`, { method: "POST" });
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "couldn't disconnect.");
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
      setError(e instanceof Error ? e.message : "couldn't propose that action.");
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
      setError(e instanceof Error ? e.message : "couldn't preview that action.");
    } finally {
      setBusy(null);
    }
  }

  if (unavailable) {
    return <ConnectionsComingSoon />;
  }
  if (!data && !error) {
    return <ConnectionsSkeleton />;
  }

  return (
    <div className="flex flex-1 flex-col gap-6">
      <div>
        <h3 className="text-sm font-extrabold lowercase tracking-widest text-ink-soft">
          connections
        </h3>
        <p className="mt-1 text-xs text-ink-soft">
          the apps and MCP servers cosigno can act across — each stays off until
          you connect it, and every action still waits for your signature.
        </p>
      </div>

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
      {data && !data.vaultReady && (
        <p className="flex items-start gap-2 rounded-btn bg-signal/10 px-3 py-2 text-xs font-semibold text-signal ring-1 ring-inset ring-signal/30">
          <ShieldAlert size={14} className="mt-px shrink-0" />
          the server isn&apos;t configured to store credentials yet
          (INTEGRATIONS_ENCRYPTION_KEY). connecting is disabled until it is.
        </p>
      )}

      {/* ---- third-party apps ---- */}
      <section className="flex flex-col gap-2.5">
        <h4 className="text-xs font-bold lowercase tracking-wide text-ink-soft">apps</h4>
        {data?.providers.map((p, i) => {
          const conn = connByProvider.get(p.key);
          return (
            <div
              key={p.key}
              style={{ animationDelay: `${i * 70}ms` }}
              className="rounded-card bg-surface/60 p-4 shadow-soft transition-all duration-base ease-brand-out animate-rise-in hover:-translate-y-0.5 hover:shadow-depth"
            >
              <div className="flex flex-wrap items-center gap-2">
                <ConnectorLogo kind="app" providerKey={p.key} displayName={p.name} size={26} />
                <span className="text-sm font-extrabold">{p.name}</span>
                {conn && <StatusPill status={conn.status} />}
                {!p.configured && !conn && (
                  <span className="rounded-pill bg-cream-deep px-2 py-0.5 text-[10px] font-bold lowercase text-ink-soft">
                    coming soon
                  </span>
                )}
                <span className="ml-auto flex gap-2">
                  {conn ? (
                    <>
                      {conn.status === "needs_reauth" && (
                        <button
                          onClick={() => connect(p.key)}
                          className="rounded-btn bg-signal px-3 py-1.5 text-xs font-bold text-ink"
                        >
                          reconnect
                        </button>
                      )}
                      <button
                        onClick={() => recheck(conn.id)}
                        disabled={busy === conn.id}
                        className="rounded-btn px-2 py-1.5 text-xs font-bold text-ink-soft hover:bg-cream-deep"
                        title="re-check status"
                      >
                        <RefreshCw size={12} className={busy === conn.id ? "animate-spin" : ""} />
                      </button>
                      <button
                        onClick={() => disconnect(conn.id)}
                        disabled={busy === conn.id}
                        className="rounded-btn px-3 py-1.5 text-xs font-bold ring-1 ring-inset ring-ink hover:bg-cream-deep"
                      >
                        disconnect
                      </button>
                    </>
                  ) : (
                    <button
                      onClick={() => connect(p.key)}
                      disabled={!p.configured || !data.vaultReady || busy === p.key}
                      className="rounded-btn bg-ink px-3 py-1.5 text-xs font-bold text-cream disabled:bg-cream-deep disabled:text-ink-soft disabled:shadow-none disabled:cursor-not-allowed"
                    >
                      {busy === p.key ? "…" : "connect"}
                    </button>
                  )}
                </span>
              </div>
              <p className="mt-1.5 text-xs text-ink-soft">{p.detail}</p>

              {/* Once connected, show what's really in the account and exactly
                  what cosigno may do with it — measured live, never examples. */}
              {conn && conn.status === "connected" && (
                <ConnectionInsight connectionId={conn.id} providerName={p.name} />
              )}
              <p className="mt-0.5 text-[11px] text-ink-soft/80">
                {conn?.metadata?.account
                  ? `${String(conn.metadata.account)} · `
                  : ""}
                {p.scopeSummary}
              </p>

              {/* What it can do + the tier each capability is proposed at. */}
              {p.actions.length > 0 && (
                <details className="group mt-2">
                  <summary className="cursor-pointer list-none text-xs font-bold lowercase text-ink-soft underline underline-offset-2 marker:content-['']">
                    <span className="group-open:hidden">what it can do ({p.actions.length})</span>
                    <span className="hidden group-open:inline">hide capabilities</span>
                  </summary>
                  <div className="mt-2 flex flex-col gap-1.5">
                    {p.actions.map((a) => (
                      <div key={a.id} className="flex items-center gap-2 rounded-btn bg-cream-deep/60 px-3 py-1.5">
                        <span className="font-mono text-[11px] font-bold">{a.id}</span>
                        <TierBadge tier={a.tier} />
                        <span className="min-w-0 flex-1 truncate text-[11px] text-ink-soft" title={a.summary}>
                          {a.summary}
                        </span>
                        {conn && conn.status === "connected" && (
                          <>
                            <button
                              onClick={() => runPreview(conn.id, a.id)}
                              disabled={busy === `preview:${conn.id}:${a.id}`}
                              className="shrink-0 rounded-pill px-2.5 py-1 text-[10px] font-bold lowercase text-ink-soft hover:bg-cream-deep disabled:opacity-50 disabled:cursor-not-allowed"
                              title="dry-run: see what this would do, without doing it"
                            >
                              {busy === `preview:${conn.id}:${a.id}` ? "…" : "dry run"}
                            </button>
                            <button
                              onClick={() => propose(conn.id, a.id)}
                              disabled={busy === `${conn.id}:${a.id}`}
                              className="shrink-0 rounded-pill px-2.5 py-1 text-[10px] font-bold lowercase ring-1 ring-inset ring-ink hover:bg-cream-deep disabled:opacity-50 disabled:cursor-not-allowed"
                              title="propose this action to your workspace"
                            >
                              {busy === `${conn.id}:${a.id}` ? "…" : "propose"}
                            </button>
                          </>
                        )}
                      </div>
                    ))}
                    <p className="mt-0.5 text-[10px] text-ink-soft/70">
                      tiers are set by cosigno, not the app — t1 runs automatically, t2 waits for
                      your signature, t3 needs typed confirmation.
                    </p>
                    {p.boundary && (
                      <div className="mt-2 grid gap-1.5 rounded-btn bg-cream-deep/40 p-2.5 sm:grid-cols-2">
                        <div>
                          <p className="text-[9px] font-bold uppercase tracking-wide text-ink-soft">can access</p>
                          <ul className="mt-0.5 space-y-0.5">
                            {p.boundary.data.canAccess.map((s, k) => (
                              <li key={k} className="text-[10px] text-ink-soft">• {s}</li>
                            ))}
                          </ul>
                        </div>
                        <div>
                          <p className="text-[9px] font-bold uppercase tracking-wide text-ink-soft">cannot</p>
                          <ul className="mt-0.5 space-y-0.5">
                            {p.boundary.data.cannotAccess.map((s, k) => (
                              <li key={k} className="text-[10px] text-ink-soft">• {s}</li>
                            ))}
                          </ul>
                        </div>
                      </div>
                    )}
                  </div>
                </details>
              )}
            </div>
          );
        })}
      </section>

      {/* ---- custom MCP servers ---- */}
      <section className="flex flex-col gap-2.5">
        <div className="flex items-center justify-between">
          <h4 className="text-xs font-bold lowercase tracking-wide text-ink-soft">
            custom MCP servers
          </h4>
          <button
            onClick={() => setAddOpen((v) => !v)}
            disabled={!data?.vaultReady}
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
            onClick={() => setAddApiOpen((v) => !v)}
            disabled={!data?.vaultReady}
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
function ConnectionsComingSoon() {
  return (
    <div className="flex flex-1 flex-col gap-6">
      <div>
        <h3 className="text-sm font-extrabold lowercase tracking-widest text-ink-soft">
          connections
        </h3>
        <p className="mt-1 text-xs text-ink-soft">
          the apps and MCP servers cosigno can act across — each stays off until
          you connect it, and every action still waits for your signature.
        </p>
      </div>
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
      setError(e instanceof Error ? e.message : "couldn't update that tool.");
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
        <span className="font-mono text-[12px] font-bold">{tool.name}</span>
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
      setError(e instanceof Error ? e.message : "couldn't add that server.");
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
            <span className="font-mono text-[10px] font-bold uppercase text-ink-soft">{a.method}</span>
            <span className="font-mono text-[11px] font-bold">{a.id}</span>
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
      setImportMsg(e instanceof Error ? e.message : "couldn't parse that spec.");
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
      onError(e instanceof Error ? e.message : "couldn't add that tool.");
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
