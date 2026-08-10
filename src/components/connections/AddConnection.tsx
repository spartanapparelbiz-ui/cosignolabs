"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowLeft,
  Check,
  ChevronRight,
  ExternalLink,
  Loader2,
  Search,
  ShieldAlert,
  Terminal,
  X,
} from "lucide-react";

/**
 * ADD CONNECTION — the front door.
 *
 * The old model asked "which of our seven apps do you want?", which meant the
 * answer to "can cosigno connect to X?" was a list someone had to maintain.
 * This asks "what kind of thing are you connecting?", and for the recommended
 * answer — an MCP server — the entire flow is: paste a configuration, test it,
 * connect. Whatever tools that server advertises are discovered and classified
 * automatically, and inherit the approval layer with no code written for them.
 *
 * Everything here is a thin client over routes that already enforce the rules:
 * the vault gate, the plan limit, SSRF checks, tool validation and the
 * server-assigned tier all live behind /api/connections. This component's job
 * is to make the honest state legible — including "we parsed this correctly and
 * still cannot run it", which is the truthful answer for a local process.
 */

export type ConnectionType = "mcp" | "openapi" | "oauth" | "http" | "local";

interface CatalogItem {
  id: string;
  name: string;
  tagline: string;
  group: string;
  groupLabel: string;
  deployment: "remote" | "local" | "native";
  icon: string;
  docsUrl?: string;
  config?: string;
  providerKey?: string;
  configured?: boolean;
}

interface TestedTool {
  name: string;
  description: string;
  category: string | null;
  categoryLabel: string | null;
  confidence: number | null;
  needsReview: boolean;
  tier: number;
}

interface TestedServer {
  config: Record<string, unknown>;
  name: string;
  transport: string;
  runnable: boolean;
  reachable?: boolean;
  serverName?: string;
  toolCount?: number;
  tools?: TestedTool[];
  needsReview?: string[];
  rejected?: { name: string; reason: string }[];
  flagged?: string[];
  note?: string;
}

const TYPES: {
  id: ConnectionType;
  label: string;
  detail: string;
  recommended?: boolean;
}[] = [
  {
    id: "mcp",
    label: "MCP server",
    detail: "paste a configuration. every tool it offers is discovered for you.",
    recommended: true,
  },
  { id: "openapi", label: "OpenAPI", detail: "import a spec and pick the operations to allow." },
  { id: "oauth", label: "OAuth app", detail: "sign in to one of the apps cosigno speaks natively." },
  { id: "http", label: "HTTP API", detail: "a base URL, an API key, and the calls you map." },
  { id: "local", label: "local process", detail: "a server that runs on your own machine (stdio)." },
];

const TIER_WORD: Record<number, string> = {
  1: "runs on its own",
  2: "waits for your signature",
  3: "needs typed confirmation",
};

const TIER_CLASS: Record<number, string> = {
  1: "bg-cream-deep text-ink-soft",
  2: "bg-signal/20 text-ink",
  3: "bg-ink text-cream",
};

async function api(url: string, init?: RequestInit) {
  const res = await fetch(url, {
    ...init,
    headers: { "Content-Type": "application/json", ...init?.headers },
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(String(body.message ?? "")) as Error & { code?: string };
    err.code = String(body.error ?? "internal");
    throw err;
  }
  return body;
}

/** A failure the user can act on, or a generic one they can't. */
function readable(err: unknown, fallback: string): string {
  const message = err instanceof Error ? err.message : "";
  // Server messages for these flows are already written for a customer (the
  // API layer strips anything naming a setting), so showing one is better
  // than replacing a specific reason with a vague one.
  return message || fallback;
}

export function AddConnection({
  open,
  onClose,
  onAdded,
  vaultReady,
  onConnectProvider,
}: {
  open: boolean;
  onClose: () => void;
  onAdded: (message: string) => Promise<void> | void;
  vaultReady: boolean;
  /** Native adapters connect through the existing OAuth redirect. */
  onConnectProvider: (providerKey: string) => void;
}) {
  const [type, setType] = useState<ConnectionType | null>(null);
  const [query, setQuery] = useState("");
  const [catalog, setCatalog] = useState<CatalogItem[]>([]);
  const [name, setName] = useState("");
  const [config, setConfig] = useState("");
  const [catalogId, setCatalogId] = useState<string | null>(null);
  const [tested, setTested] = useState<TestedServer[] | null>(null);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [testing, setTesting] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const dialogRef = useRef<HTMLDivElement>(null);

  const reset = useCallback(() => {
    setType(null);
    setQuery("");
    setName("");
    setConfig("");
    setCatalogId(null);
    setTested(null);
    setWarnings([]);
    setError(null);
  }, []);

  /* Escape closes, and focus lands inside the dialog when it opens — a modal
     that traps neither is a modal a keyboard user cannot leave. */
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    dialogRef.current?.focus();
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  useEffect(() => {
    if (!open) reset();
  }, [open, reset]);

  /* The gallery is fetched once and filtered locally: a search box that waits
     on the network per keystroke feels broken even when it isn't. */
  useEffect(() => {
    if (!open || catalog.length > 0) return;
    api("/api/connections/catalog")
      .then((d) => setCatalog(Array.isArray(d.entries) ? d.entries : []))
      .catch(() => setCatalog([]));
  }, [open, catalog.length]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const byType = catalog.filter((e) => {
      if (type === "oauth") return e.deployment === "native";
      if (type === "local") return e.deployment === "local";
      if (type === "mcp") return e.deployment !== "native";
      return true;
    });
    if (!q) return byType;
    return byType.filter((e) =>
      `${e.name} ${e.tagline} ${e.groupLabel} ${e.deployment}`.toLowerCase().includes(q)
    );
  }, [catalog, query, type]);

  if (!open) return null;

  function pickCatalog(entry: CatalogItem) {
    setError(null);
    if (entry.deployment === "native") {
      if (entry.configured === false) {
        setError(
          `${entry.name} isn't switched on for this workspace yet — an administrator can enable it.`
        );
        return;
      }
      if (entry.providerKey) onConnectProvider(entry.providerKey);
      return;
    }
    setType(entry.deployment === "local" ? "local" : "mcp");
    setName(entry.name);
    setConfig(entry.config ?? "");
    setCatalogId(entry.id);
    setTested(null);
  }

  async function test() {
    setTesting(true);
    setError(null);
    setTested(null);
    try {
      const res = await api("/api/connections/mcp/parse", {
        method: "POST",
        body: JSON.stringify({ config }),
      });
      setTested(Array.isArray(res.servers) ? res.servers : []);
      setWarnings(Array.isArray(res.warnings) ? res.warnings : []);
    } catch (e) {
      setError(readable(e, "that configuration couldn't be read."));
    } finally {
      setTesting(false);
    }
  }

  async function connect(serverName?: string) {
    if (!vaultReady) {
      setError(
        "connecting isn't switched on for this workspace yet. cosigno won't hold a server's keys until secure storage is turned on."
      );
      return;
    }
    setConnecting(true);
    setError(null);
    try {
      const res = await api("/api/connections/mcp", {
        method: "POST",
        body: JSON.stringify({
          config,
          ...(name.trim() ? { displayName: name.trim() } : {}),
          ...(serverName ? { serverName } : {}),
          ...(catalogId ? { catalogId } : {}),
        }),
      });
      await onAdded(
        res.pending
          ? "saved. this server runs on your machine, so it waits for the local bridge."
          : `connected — ${res.toolCount ?? 0} tool${res.toolCount === 1 ? "" : "s"} discovered and classified.`
      );
      onClose();
    } catch (e) {
      setError(readable(e, "that connection didn't go through."));
    } finally {
      setConnecting(false);
    }
  }

  const showPaste = type === "mcp" || type === "local";
  const canConnect = tested?.some((s) => s.reachable || !s.runnable) ?? false;

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-ink/40 p-4 backdrop-blur-sm sm:p-8"
      role="presentation"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        ref={dialogRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-label="add a connection"
        className="w-full max-w-3xl rounded-card bg-surface shadow-depth-lift outline-none animate-rise-in"
      >
        {/* ---------------------------------------------------------- header */}
        <div className="flex items-center gap-3 border-b border-line px-5 py-4">
          {type && (
            <button
              onClick={() => {
                setType(null);
                setTested(null);
                setError(null);
              }}
              className="rounded-btn p-1 text-ink-soft hover:bg-cream-deep hover:text-ink"
              aria-label="back"
            >
              <ArrowLeft size={16} />
            </button>
          )}
          <h2 className="font-display text-lg font-bold lowercase">
            {type ? TYPES.find((t) => t.id === type)?.label : "add a connection"}
          </h2>
          <button
            onClick={onClose}
            className="ml-auto rounded-btn p-1 text-ink-soft hover:bg-cream-deep hover:text-ink"
            aria-label="close"
          >
            <X size={16} />
          </button>
        </div>

        <div className="flex max-h-[70vh] flex-col gap-5 overflow-y-auto p-5">
          {error && (
            <p
              className="rounded-btn bg-signal/10 px-3 py-2 text-xs font-semibold text-signal ring-1 ring-inset ring-signal/30"
              role="alert"
            >
              {error}
            </p>
          )}

          {/* ------------------------------------------------ type chooser */}
          {!type && (
            <>
              <div className="grid gap-2 sm:grid-cols-2">
                {TYPES.map((t) => (
                  <button
                    key={t.id}
                    onClick={() => setType(t.id)}
                    className={`group flex items-start gap-3 rounded-card px-4 py-3 text-left transition-all duration-fast ease-brand-out hover:-translate-y-0.5 hover:shadow-soft ${
                      t.recommended
                        ? "bg-cream-deep ring-1 ring-inset ring-ink/15 sm:col-span-2"
                        : "bg-cream-deep/50"
                    }`}
                  >
                    <div className="min-w-0 flex-1">
                      <p className="flex items-center gap-2 text-sm font-extrabold lowercase">
                        {t.label}
                        {t.recommended && (
                          <span className="rounded-pill bg-ink px-2 py-0.5 text-[9px] font-black uppercase tracking-wider text-cream">
                            recommended
                          </span>
                        )}
                      </p>
                      <p className="mt-0.5 text-xs text-ink-soft">{t.detail}</p>
                    </div>
                    <ChevronRight
                      size={16}
                      className="mt-0.5 shrink-0 text-ink-soft transition-transform duration-fast group-hover:translate-x-0.5"
                    />
                  </button>
                ))}
              </div>

              <Gallery
                items={filtered}
                query={query}
                onQuery={setQuery}
                onPick={pickCatalog}
                heading="or start from a known server"
              />
            </>
          )}

          {/* -------------------------------------------- paste + test flow */}
          {showPaste && (
            <>
              <label className="flex flex-col gap-1.5">
                <span className="text-xs font-bold lowercase text-ink-soft">connection name</span>
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="what you'll call it"
                  className="rounded-btn bg-cream-deep px-3 py-2 text-sm font-semibold outline-none ring-1 ring-inset ring-transparent focus:ring-ink/25"
                />
              </label>

              <label className="flex flex-col gap-1.5">
                <span className="flex items-center justify-between text-xs font-bold lowercase text-ink-soft">
                  <span>MCP configuration</span>
                  <span className="font-semibold normal-case text-ink-soft/70">
                    paste the JSON block, or just the server URL
                  </span>
                </span>
                <textarea
                  value={config}
                  onChange={(e) => {
                    setConfig(e.target.value);
                    setTested(null);
                  }}
                  rows={8}
                  spellCheck={false}
                  placeholder={'{\n  "mcpServers": {\n    "example": {\n      "url": "https://mcp.example.com/mcp"\n    }\n  }\n}'}
                  className="rounded-btn bg-cream-deep px-3 py-2 font-mono text-xs outline-none ring-1 ring-inset ring-transparent focus:ring-ink/25"
                />
              </label>

              <div className="flex flex-wrap items-center gap-2">
                <button
                  onClick={test}
                  disabled={!config.trim() || testing}
                  className="inline-flex items-center gap-1.5 rounded-btn px-3.5 py-2 text-xs font-bold ring-1 ring-inset ring-ink hover:bg-cream-deep disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {testing ? <Loader2 size={13} className="animate-spin" /> : <Check size={13} />}
                  {testing ? "testing…" : "test connection"}
                </button>
                {tested && canConnect && (
                  <button
                    onClick={() => connect(tested.length > 1 ? tested[0].name : undefined)}
                    disabled={connecting}
                    className="inline-flex items-center gap-1.5 rounded-btn bg-ink px-3.5 py-2 text-xs font-bold text-cream disabled:opacity-60"
                  >
                    {connecting && <Loader2 size={13} className="animate-spin" />}
                    {connecting ? "connecting…" : "connect"}
                  </button>
                )}
                <p className="text-[11px] text-ink-soft">
                  testing contacts the server and stores nothing.
                </p>
              </div>

              {warnings.length > 0 && (
                <ul className="flex flex-col gap-1">
                  {warnings.map((w, i) => (
                    <li key={i} className="text-[11px] text-ink-soft">
                      • {w}
                    </li>
                  ))}
                </ul>
              )}

              {tested?.map((server) => (
                <TestedServerCard key={server.name} server={server} />
              ))}

              {!tested && (
                <Gallery
                  items={filtered}
                  query={query}
                  onQuery={setQuery}
                  onPick={pickCatalog}
                  heading="popular servers"
                />
              )}
            </>
          )}

          {/* --------------------------------------- native adapter gallery */}
          {type === "oauth" && (
            <Gallery
              items={filtered}
              query={query}
              onQuery={setQuery}
              onPick={pickCatalog}
              heading="apps cosigno speaks natively"
              note="these are adapters over each vendor's own API, for vendors that don't publish an MCP server yet. They present the same tools, tiers and audit trail as an MCP connection."
            />
          )}

          {/* --------------------------------- OpenAPI / HTTP hand-off note */}
          {(type === "openapi" || type === "http") && (
            <div className="flex flex-col gap-3 rounded-card bg-cream-deep/60 p-4">
              <p className="text-sm font-bold lowercase">
                {type === "openapi" ? "import an OpenAPI spec" : "map an HTTP API"}
              </p>
              <p className="text-xs text-ink-soft">
                {type === "openapi"
                  ? "paste a spec and cosigno detects each operation, assigns it a risk tier, and lets you pick which ones to allow."
                  : "give a base URL and an API key, then map the calls cosigno may make. each one is tiered by risk."}
              </p>
              <p className="flex items-start gap-2 text-[11px] text-ink-soft">
                <ShieldAlert size={13} className="mt-px shrink-0" />
                prefer an MCP server when one exists — it discovers its own tools,
                so there is nothing to map and nothing to keep in sync.
              </p>
              <button
                onClick={() => {
                  onClose();
                  // The custom-API builder lives on the page beneath this
                  // dialog; closing and flagging it is less disorienting than
                  // rebuilding a second copy of a form that already works.
                  window.dispatchEvent(new CustomEvent("cosigno:open-api-tool"));
                }}
                className="self-start rounded-btn bg-ink px-3.5 py-2 text-xs font-bold text-cream"
              >
                continue
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ gallery */

function Gallery({
  items,
  query,
  onQuery,
  onPick,
  heading,
  note,
}: {
  items: CatalogItem[];
  query: string;
  onQuery: (v: string) => void;
  onPick: (e: CatalogItem) => void;
  heading: string;
  note?: string;
}) {
  return (
    <section className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-xs font-bold lowercase tracking-wide text-ink-soft">{heading}</h3>
        <label className="relative w-full sm:w-56">
          <Search
            size={13}
            aria-hidden="true"
            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-soft"
          />
          <input
            value={query}
            onChange={(e) => onQuery(e.target.value)}
            placeholder="search connections"
            aria-label="search connections"
            className="w-full rounded-pill bg-cream-deep py-1.5 pl-8 pr-3 text-xs font-semibold outline-none ring-1 ring-inset ring-transparent focus:ring-ink/25"
          />
        </label>
      </div>
      {note && <p className="text-[11px] text-ink-soft">{note}</p>}
      {items.length === 0 ? (
        <p className="rounded-card bg-cream-deep/40 px-4 py-6 text-center text-xs text-ink-soft">
          nothing matches &ldquo;{query}&rdquo;. any MCP server works — paste its
          configuration above.
        </p>
      ) : (
        <div className="grid gap-2 sm:grid-cols-2">
          {items.map((e) => (
            <button
              key={e.id}
              onClick={() => onPick(e)}
              className="group flex items-start gap-3 rounded-card bg-cream-deep/50 px-3.5 py-3 text-left transition-all duration-fast ease-brand-out hover:-translate-y-0.5 hover:bg-cream-deep hover:shadow-soft"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={e.icon} alt="" aria-hidden="true" width={22} height={22} className="mt-0.5 shrink-0 rounded" />
              <span className="min-w-0 flex-1">
                <span className="flex flex-wrap items-center gap-1.5">
                  <span className="text-sm font-extrabold">{e.name}</span>
                  {e.deployment === "local" && (
                    <span className="inline-flex items-center gap-1 rounded-pill bg-cream px-1.5 py-0.5 text-[9px] font-bold lowercase text-ink-soft">
                      <Terminal size={9} /> local
                    </span>
                  )}
                  {e.deployment === "native" && e.configured === false && (
                    <span className="rounded-pill bg-cream px-1.5 py-0.5 text-[9px] font-bold lowercase text-ink-soft">
                      needs setup
                    </span>
                  )}
                </span>
                <span className="mt-0.5 block text-[11px] text-ink-soft">{e.tagline}</span>
              </span>
            </button>
          ))}
        </div>
      )}
    </section>
  );
}

/* ------------------------------------------------------- test result card */

/**
 * What the server actually offered, before anything is stored. This is the
 * screen that makes the promise concrete: every tool listed with the approval
 * it will require, decided by cosigno, visible BEFORE you connect.
 */
function TestedServerCard({ server }: { server: TestedServer }) {
  const ok = server.reachable === true;
  const local = !server.runnable;
  return (
    <div className="flex flex-col gap-3 rounded-card bg-cream-deep/50 p-4">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm font-extrabold">{server.serverName || server.name}</span>
        <span
          className={`rounded-pill px-2 py-0.5 text-[9px] font-black uppercase tracking-wider ${
            ok ? "bg-signal text-on-signal" : local ? "bg-cream text-ink-soft" : "bg-ink text-cream"
          }`}
        >
          {ok ? "reachable" : local ? "local process" : "not reachable"}
        </span>
        <span className="text-[11px] text-ink-soft">{server.transport}</span>
        {typeof server.toolCount === "number" && (
          <span className="ml-auto text-[11px] font-semibold text-ink-soft">
            {server.toolCount} tool{server.toolCount === 1 ? "" : "s"}
          </span>
        )}
      </div>

      {server.note && <p className="text-xs text-ink-soft">{server.note}</p>}

      {server.flagged && server.flagged.length > 0 && (
        <p className="flex items-start gap-2 rounded-btn bg-signal/10 px-3 py-2 text-[11px] font-semibold text-signal">
          <ShieldAlert size={13} className="mt-px shrink-0" />
          {server.flagged.length} tool description{server.flagged.length === 1 ? "" : "s"} contained
          agent-directed text and {server.flagged.length === 1 ? "was" : "were"} withheld.
        </p>
      )}

      {server.tools && server.tools.length > 0 && (
        <div className="flex flex-col gap-1">
          {server.tools.map((t) => (
            <div
              key={t.name}
              className="flex flex-wrap items-center gap-2 rounded-btn bg-surface/70 px-3 py-1.5"
            >
              <span className="font-mono text-[11px] font-bold">{t.name}</span>
              <span
                className={`rounded-pill px-1.5 py-0.5 text-[9px] font-black uppercase tracking-wider ${TIER_CLASS[t.tier] ?? TIER_CLASS[2]}`}
                title={`tier ${t.tier}`}
              >
                {t.category ?? "unclassified"}
              </span>
              <span className="text-[10px] text-ink-soft">{TIER_WORD[t.tier] ?? TIER_WORD[2]}</span>
              {t.needsReview && (
                <span className="rounded-pill bg-cream px-1.5 py-0.5 text-[9px] font-bold lowercase text-ink-soft">
                  we&apos;ll ask you about this one
                </span>
              )}
            </div>
          ))}
        </div>
      )}

      {server.rejected && server.rejected.length > 0 && (
        <p className="text-[11px] text-ink-soft">
          {server.rejected.length} tool{server.rejected.length === 1 ? "" : "s"} rejected:{" "}
          {server.rejected.map((r) => `${r.name} (${r.reason})`).join(", ")}.
        </p>
      )}

      <details className="group">
        <summary className="cursor-pointer list-none text-[11px] font-bold lowercase text-ink-soft underline underline-offset-2 marker:content-['']">
          <span className="group-open:hidden">what cosigno read</span>
          <span className="hidden group-open:inline">hide</span>
        </summary>
        <pre className="mt-1.5 overflow-x-auto rounded-btn bg-cream-deep p-2.5 font-mono text-[10px] text-ink-soft">
          {JSON.stringify(server.config, null, 2)}
        </pre>
        <p className="mt-1 text-[10px] text-ink-soft/80">
          credentials are masked here and encrypted before storage — cosigno never
          shows a token back to you.
        </p>
      </details>
    </div>
  );
}

/** A link out to a server's own documentation, used by the gallery cards. */
export function DocsLink({ href }: { href: string }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer noopener"
      className="inline-flex items-center gap-1 text-[11px] font-bold text-ink-soft hover:text-ink"
    >
      docs <ExternalLink size={10} aria-hidden="true" />
    </a>
  );
}
