"use client";

import { useEffect, useState } from "react";
import {
  AlertTriangle,
  Check,
  Loader2,
  Plug,
  Plus,
  RefreshCw,
  ShieldAlert,
  X,
} from "lucide-react";

/**
 * The Connections screen: available third-party apps, the user's connected
 * accounts, and custom MCP servers — each with a status pill and
 * connect / disconnect / re-auth controls — plus the "add custom MCP" flow
 * with inline validation, a test-connection step, and per-tool enable/consent.
 * All secrets stay server-side; this only ever sees status + non-secret views.
 */

interface ProviderMeta {
  key: string;
  name: string;
  detail: string;
  authType: string;
  scopeSummary: string;
  configured: boolean;
}
interface ConnectionView {
  id: string;
  provider_key: string;
  kind: "app" | "mcp";
  display_name: string;
  status: "connected" | "needs_reauth" | "error" | "revoked";
  scopes: string | null;
  metadata: Record<string, unknown>;
}
interface McpTool {
  connection_id: string;
  name: string;
  description: string;
  enabled: boolean;
  sensitive: boolean;
  consented_at: string | null;
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
  const [busy, setBusy] = useState<string | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  async function load() {
    try {
      setData(await api("/api/connections"));
    } catch {
      setError("couldn't load your connections.");
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

  if (!data && !error) {
    return (
      <div className="flex items-center gap-2 py-10 text-sm text-ink-soft">
        <Loader2 size={16} className="animate-spin" /> loading connections…
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
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
        {data?.providers.map((p) => {
          const conn = connByProvider.get(p.key);
          return (
            <div key={p.key} className="rounded-card bg-white/60 p-4 shadow-soft">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-sm font-extrabold">{p.name}</span>
                {conn && <StatusPill status={conn.status} />}
                {!p.configured && !conn && (
                  <span className="rounded-pill bg-cream-deep px-2 py-0.5 text-[10px] font-bold lowercase text-ink-soft">
                    not set up on server
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
                      className="rounded-btn bg-ink px-3 py-1.5 text-xs font-bold text-cream disabled:opacity-40"
                    >
                      {busy === p.key ? "…" : "connect"}
                    </button>
                  )}
                </span>
              </div>
              <p className="mt-1.5 text-xs text-ink-soft">{p.detail}</p>
              <p className="mt-0.5 text-[11px] text-ink-soft/80">
                {conn?.metadata?.account
                  ? `${String(conn.metadata.account)} · `
                  : ""}
                {p.scopeSummary}
              </p>
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
            className="inline-flex items-center gap-1 rounded-btn bg-ink px-3 py-1.5 text-xs font-bold text-cream disabled:opacity-40"
          >
            {addOpen ? <X size={12} /> : <Plus size={12} />}
            {addOpen ? "cancel" : "add server"}
          </button>
        </div>

        {addOpen && <AddMcpForm onAdded={async () => { setAddOpen(false); await load(); }} />}

        {mcps.length === 0 && !addOpen && (
          <p className="rounded-card bg-white/40 px-4 py-5 text-xs text-ink-soft shadow-soft">
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
    <div className="rounded-card bg-white/60 p-4 shadow-soft">
      <div className="flex flex-wrap items-center gap-2">
        <Plug size={14} className="text-ink-soft" />
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
    <div className="rounded-card bg-white/70 p-4 shadow-depth">
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
        <button onClick={submit} disabled={!ready} className="self-start rounded-btn bg-signal px-4 py-2 text-sm font-extrabold text-ink disabled:opacity-40">
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
