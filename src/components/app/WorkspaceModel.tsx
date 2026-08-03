"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  Boxes,
  GitBranch,
  Loader2,
  Lock,
  Minus,
  Plus,
  RotateCcw,
  Search,
  ShieldCheck,
  Undo2,
  Workflow,
} from "lucide-react";

/**
 * The Workspace Model — one live map of every connected system.
 *
 * Three surfaces over the same model, so a user never has to hold two mental
 * pictures at once:
 *   · Explorer — the universal object graph, navigable.
 *   · Query    — ask it a question in plain language.
 *   · Plan     — propose a change and read the changeset before approving it.
 *
 * The model is structural. Where a resource has no synced instances the UI says
 * "not synced" rather than "0", because the whole value of the map is that it
 * never claims state it hasn't observed.
 */

/* ------------------------------------------------------------------ types */

type NodeKind = "workspace" | "connector" | "resource" | "operation" | "permission";

interface GraphNode {
  id: string;
  kind: NodeKind;
  label: string;
  connector: string;
  canonical?: string;
  domain?: string;
  mutation?: "read" | "create" | "update" | "delete";
  tier?: number;
  reversible?: boolean;
  synced_count?: number | null;
  status?: string;
  risk?: "read" | "write" | "destructive";
}

interface GraphEdge {
  id: string;
  from: string;
  to: string;
  kind: string;
  label: string;
}

interface Graph {
  nodes: GraphNode[];
  edges: GraphEdge[];
  generated_at: string;
  stats: {
    connectors: number;
    resources: number;
    operations: number;
    permissions: number;
    relationships: number;
    synced_resources: number;
    synced_instances: number | null;
  };
}

interface SyncConnector {
  connector: string;
  name: string;
  mode: string;
  mode_reason: string;
  status: string;
  stale: boolean;
  note: string;
}

interface SyncReport {
  connectors: SyncConnector[];
  healthy: number;
  stale: number;
  summary: string;
}

interface ImpactedObject {
  node_id: string;
  label: string;
  connector: string;
  path: string[];
  synced_count: number | null;
  reason: string;
}

interface DependencyReport {
  origin: { node_id: string; label: string; connector: string; kind: string };
  affected: ImpactedObject[];
  systems: string[];
  broken_operations: { node_id: string; label: string; connector: string; risk?: string }[];
  permissions: string[];
  severity: string;
  summary: string;
  caveats: string[];
}

interface QueryResult {
  query: string;
  interpretation: { intent: string; reading: string; unmatched: string[] };
  nodes: GraphNode[];
  impact?: DependencyReport;
  answer: string;
}

interface ChangeEntry {
  kind: "added" | "modified" | "deleted";
  object: string;
  connector: string;
  field?: string;
  before?: unknown;
  after?: unknown;
}

interface PlanResponse {
  plan: {
    id: string;
    goal: string;
    steps: {
      index: number;
      kind: string;
      title: string;
      detail: string;
      status: "ready" | "blocked";
      blocked_reason?: string;
      mutates: boolean;
    }[];
    requires: string;
    executable: boolean;
    refusals: string[];
    changeset: {
      id: string;
      title: string;
      entries: ChangeEntry[];
      added: number;
      modified: number;
      deleted: number;
      affected_systems: string[];
      cost: { amount_cents: number | null; api_calls: number; basis: string };
      risk: { level: string; dimensions: { dimension: string; score: number; reason: string }[] };
      required_permissions: string[];
      requires: string;
      refused: boolean;
      refusal_reason: string | null;
      summary: string;
      rollback: {
        supported: string;
        steps: { title: string; detail: string; automatic: boolean }[];
        requires: string;
        estimated_recovery: string;
        caveats: string[];
      };
    };
  };
  predicted_diff: {
    rows: { label: string; before: string; after: string; delta?: string; emphasis?: string }[];
    counters: {
      objects_added: number;
      objects_modified: number;
      objects_deleted: number;
      secrets_changed: number | null;
      permissions_added: string[];
      systems_touched: string[];
    };
    summary: string;
  };
}

/* ----------------------------------------------------------------- layout */

interface Placed {
  node: GraphNode;
  x: number;
  y: number;
  r: number;
}

const SEVERITY_TONE: Record<string, string> = {
  none: "text-ink-soft",
  low: "text-ink-soft",
  moderate: "text-ink",
  high: "text-ink",
  severe: "text-ink",
};

/**
 * Deterministic radial layout: workspace at the origin, connectors on a ring,
 * each connector's resources on an arc facing outward, operations on a small
 * arc around their resource. Same model in, same picture out — the map doesn't
 * rearrange itself between visits.
 */
function layout(nodes: GraphNode[], showOperations: boolean): Placed[] {
  const placed: Placed[] = [];
  const connectors = nodes.filter((n) => n.kind === "connector");
  const root = nodes.find((n) => n.kind === "workspace");
  if (root) placed.push({ node: root, x: 0, y: 0, r: 26 });

  const ringRadius = Math.max(210, connectors.length * 52);

  connectors.forEach((c, ci) => {
    const angle = (ci / Math.max(connectors.length, 1)) * Math.PI * 2 - Math.PI / 2;
    const cx = Math.cos(angle) * ringRadius;
    const cy = Math.sin(angle) * ringRadius;
    placed.push({ node: c, x: cx, y: cy, r: 20 });

    const resources = nodes.filter((n) => n.kind === "resource" && n.connector === c.connector);
    const spread = Math.min(Math.PI * 1.15, 0.34 * resources.length);
    resources.forEach((r, ri) => {
      const t = resources.length === 1 ? 0 : ri / (resources.length - 1) - 0.5;
      const a = angle + t * spread;
      const dist = 132 + (ri % 2) * 34;
      const rx = cx + Math.cos(a) * dist;
      const ry = cy + Math.sin(a) * dist;
      placed.push({ node: r, x: rx, y: ry, r: 12 });

      if (!showOperations) return;
      const ops = nodes.filter(
        (n) => n.kind === "operation" && n.connector === c.connector && n.canonical === r.canonical
      );
      ops.forEach((o, oi) => {
        const oa = a + (oi - (ops.length - 1) / 2) * 0.3;
        placed.push({ node: o, x: rx + Math.cos(oa) * 62, y: ry + Math.sin(oa) * 62, r: 7 });
      });
    });
  });

  // Permissions sit in an inner ring: shared across connectors, so they belong
  // to the workspace rather than to any one system.
  const permissions = nodes.filter((n) => n.kind === "permission");
  permissions.forEach((p, pi) => {
    const a = (pi / Math.max(permissions.length, 1)) * Math.PI * 2;
    placed.push({ node: p, x: Math.cos(a) * 88, y: Math.sin(a) * 88, r: 8 });
  });

  return placed;
}

/* -------------------------------------------------------------- component */

type Tab = "explorer" | "query" | "plan";

export function WorkspaceModel() {
  const [graph, setGraph] = useState<Graph | null>(null);
  const [sync, setSync] = useState<SyncReport | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>("explorer");

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/workspace-model?available=1", { cache: "no-store" });
        if (!res.ok) throw new Error(`the model is unavailable right now (${res.status}).`);
        const data = await res.json();
        setGraph(data.graph);
        setSync(data.sync);
      } catch (e) {
        setError(e instanceof Error ? e.message : "couldn't load the workspace model.");
      }
    })();
  }, []);

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-8">
      <header>
        <p className="text-xs font-black uppercase tracking-[0.28em] text-signal">workspace model</p>
        <h1 className="mt-2 font-display text-3xl font-bold lowercase tracking-tight sm:text-4xl">
          one live map of every system you&apos;ve connected.
        </h1>
        <p className="mt-2 max-w-2xl text-sm font-semibold text-ink-soft">
          Objects, relationships, permissions and reversibility — modelled once, in one vocabulary.
          cosigno reasons here first: it plans, simulates and prices a change against the model, and
          only an approved changeset ever reaches production.
        </p>
      </header>

      {error && (
        <p className="mt-6 rounded-card border border-line bg-surface p-4 text-sm font-semibold">{error}</p>
      )}

      {graph && <Stats graph={graph} sync={sync} />}

      <nav className="mt-6 flex flex-wrap gap-2" aria-label="Workspace model views">
        {(
          [
            ["explorer", "explorer", Boxes],
            ["query", "query", Search],
            ["plan", "plan a change", Workflow],
          ] as const
        ).map(([key, label, Icon]) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            aria-current={tab === key ? "page" : undefined}
            className={`inline-flex items-center gap-1.5 rounded-pill px-3.5 py-1.5 text-xs font-black uppercase tracking-wider transition-colors duration-fast focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-signal ${
              tab === key ? "bg-ink text-cream" : "bg-surface text-ink-soft ring-1 ring-inset ring-line hover:text-ink"
            }`}
          >
            <Icon size={12} aria-hidden="true" />
            {label}
          </button>
        ))}
      </nav>

      {!graph && !error ? (
        <div className="mt-6 h-[420px] animate-pulse rounded-card border border-line bg-surface" aria-hidden="true" />
      ) : graph && graph.stats.connectors === 0 ? (
        <EmptyModel />
      ) : graph ? (
        <div className="mt-4">
          {tab === "explorer" && <Explorer graph={graph} sync={sync} />}
          {tab === "query" && <QueryPanel graph={graph} />}
          {tab === "plan" && <PlanPanel graph={graph} />}
        </div>
      ) : null}

      <p className="mt-10 text-center text-[11px] leading-relaxed text-ink-soft">
        The Workspace Model is not a copy of your data. It models structure — what exists, what it
        relates to, who may change it, and whether that change can be undone. Record counts appear
        only where a connector genuinely synced them.{" "}
        <Link href="/app/twins" className="font-bold underline decoration-line underline-offset-2 hover:text-ink">
          See each app&apos;s own capability model
        </Link>
        .
      </p>
    </div>
  );
}

function Stats({ graph, sync }: { graph: Graph; sync: SyncReport | null }) {
  const items: [string, string][] = [
    ["systems", String(graph.stats.connectors)],
    ["objects", String(graph.stats.resources)],
    ["actions", String(graph.stats.operations)],
    ["permissions", String(graph.stats.permissions)],
    ["relationships", String(graph.stats.relationships)],
    [
      "synced records",
      graph.stats.synced_instances === null ? "not synced" : graph.stats.synced_instances.toLocaleString(),
    ],
  ];
  return (
    <div className="mt-6">
      <dl className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
        {items.map(([label, value]) => (
          <div key={label} className="rounded-card border border-line bg-surface px-3 py-2.5 shadow-soft">
            <dt className="text-[10px] font-black uppercase tracking-wider text-ink-soft">{label}</dt>
            <dd className="mt-0.5 font-display text-lg font-bold tabular-nums">{value}</dd>
          </div>
        ))}
      </dl>
      {sync && (
        <p className="mt-2 flex items-center gap-1.5 text-xs font-semibold text-ink-soft">
          {sync.stale > 0 ? (
            <AlertTriangle size={12} className="shrink-0" aria-hidden="true" />
          ) : (
            <ShieldCheck size={12} className="shrink-0" aria-hidden="true" />
          )}
          {sync.summary}
        </p>
      )}
    </div>
  );
}

function EmptyModel() {
  return (
    <div className="mt-6 rounded-card border border-dashed border-line bg-surface/60 p-10 text-center">
      <Boxes size={22} className="mx-auto text-ink-soft" aria-hidden="true" />
      <p className="mt-3 text-sm font-bold">Nothing modelled yet</p>
      <p className="mx-auto mt-1 max-w-sm text-sm text-ink-soft">
        Connect a tool and cosigno builds its model automatically — objects, actions, permissions and
        the relationships between them.
      </p>
    </div>
  );
}

/* ---------------------------------------------------------------- explorer */

function Explorer({ graph, sync }: { graph: Graph; sync: SyncReport | null }) {
  const [selected, setSelected] = useState<string | null>(null);
  const [showOperations, setShowOperations] = useState(false);
  const [showPermissions, setShowPermissions] = useState(false);
  const [connectorFilter, setConnectorFilter] = useState<string[]>([]);
  const [riskFilter, setRiskFilter] = useState<string[]>([]);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const dragging = useRef<{ x: number; y: number } | null>(null);

  const connectors = useMemo(
    () => graph.nodes.filter((n) => n.kind === "connector"),
    [graph]
  );

  const visible = useMemo(() => {
    return graph.nodes.filter((n) => {
      if (n.kind === "permission" && !showPermissions) return false;
      if (n.kind === "operation" && !showOperations) return false;
      if (connectorFilter.length && n.connector && !connectorFilter.includes(n.connector)) return false;
      if (riskFilter.length && n.kind === "operation" && !riskFilter.includes(n.risk ?? "read")) return false;
      return true;
    });
  }, [graph, showOperations, showPermissions, connectorFilter, riskFilter]);

  const placed = useMemo(() => layout(visible, showOperations), [visible, showOperations]);
  const byId = useMemo(() => new Map(placed.map((p) => [p.node.id, p])), [placed]);
  const edges = useMemo(
    () => graph.edges.filter((e) => byId.has(e.from) && byId.has(e.to)),
    [graph, byId]
  );

  const extent = useMemo(() => {
    const pad = 80;
    const xs = placed.map((p) => p.x);
    const ys = placed.map((p) => p.y);
    const minX = Math.min(-200, ...xs) - pad;
    const minY = Math.min(-200, ...ys) - pad;
    const maxX = Math.max(200, ...xs) + pad;
    const maxY = Math.max(200, ...ys) + pad;
    return { minX, minY, width: maxX - minX, height: maxY - minY };
  }, [placed]);

  const viewBox = `${extent.minX + pan.x} ${extent.minY + pan.y} ${extent.width / zoom} ${extent.height / zoom}`;

  const onPointerDown = (e: React.PointerEvent) => {
    dragging.current = { x: e.clientX, y: e.clientY };
    (e.target as Element).setPointerCapture?.(e.pointerId);
  };
  const onPointerMove = (e: React.PointerEvent) => {
    if (!dragging.current) return;
    const dx = ((e.clientX - dragging.current.x) * extent.width) / (zoom * 800);
    const dy = ((e.clientY - dragging.current.y) * extent.height) / (zoom * 520);
    dragging.current = { x: e.clientX, y: e.clientY };
    setPan((p) => ({ x: p.x - dx, y: p.y - dy }));
  };
  const onPointerUp = () => {
    dragging.current = null;
  };

  const selectedNode = selected ? graph.nodes.find((n) => n.id === selected) ?? null : null;

  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
      <div className="overflow-hidden rounded-card border border-line bg-surface shadow-soft">
        <div className="flex flex-wrap items-center gap-2 border-b border-line px-3 py-2.5">
          <Toggle on={showOperations} onClick={() => setShowOperations((v) => !v)} label="actions" />
          <Toggle on={showPermissions} onClick={() => setShowPermissions((v) => !v)} label="permissions" />
          <span className="mx-1 h-4 w-px bg-line" aria-hidden="true" />
          {connectors.map((c) => (
            <Toggle
              key={c.id}
              on={connectorFilter.includes(c.connector)}
              onClick={() =>
                setConnectorFilter((f) =>
                  f.includes(c.connector) ? f.filter((x) => x !== c.connector) : [...f, c.connector]
                )
              }
              label={c.label.toLowerCase()}
            />
          ))}
          {showOperations && (
            <>
              <span className="mx-1 h-4 w-px bg-line" aria-hidden="true" />
              {["read", "write", "destructive"].map((r) => (
                <Toggle
                  key={r}
                  on={riskFilter.includes(r)}
                  onClick={() =>
                    setRiskFilter((f) => (f.includes(r) ? f.filter((x) => x !== r) : [...f, r]))
                  }
                  label={r}
                />
              ))}
            </>
          )}
          <div className="ml-auto flex items-center gap-1">
            <IconButton label="zoom out" onClick={() => setZoom((z) => Math.max(0.5, z - 0.25))}>
              <Minus size={13} aria-hidden="true" />
            </IconButton>
            <IconButton label="zoom in" onClick={() => setZoom((z) => Math.min(4, z + 0.25))}>
              <Plus size={13} aria-hidden="true" />
            </IconButton>
            <IconButton
              label="reset view"
              onClick={() => {
                setZoom(1);
                setPan({ x: 0, y: 0 });
              }}
            >
              <RotateCcw size={13} aria-hidden="true" />
            </IconButton>
          </div>
        </div>

        <svg
          viewBox={viewBox}
          className="h-[460px] w-full cursor-grab touch-none select-none active:cursor-grabbing"
          role="img"
          aria-label={`Workspace model graph: ${placed.length} nodes, ${edges.length} relationships`}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerLeave={onPointerUp}
        >
          <g>
            {edges.map((e) => {
              const a = byId.get(e.from)!;
              const b = byId.get(e.to)!;
              const highlighted = selected === e.from || selected === e.to;
              return (
                <line
                  key={e.id}
                  x1={a.x}
                  y1={a.y}
                  x2={b.x}
                  y2={b.y}
                  stroke="currentColor"
                  className={highlighted ? "text-signal" : "text-ink-soft"}
                  strokeOpacity={highlighted ? 0.9 : 0.22}
                  strokeWidth={highlighted ? 1.6 : 0.8}
                  strokeDasharray={e.kind === "same_as" ? "4 3" : undefined}
                />
              );
            })}
          </g>
          <g>
            {placed.map((p) => {
              const isSelected = p.node.id === selected;
              return (
                <g
                  key={p.node.id}
                  transform={`translate(${p.x} ${p.y})`}
                  onClick={() => setSelected(p.node.id)}
                  className="cursor-pointer"
                >
                  <circle
                    r={p.r}
                    fill={nodeFill(p.node)}
                    stroke="currentColor"
                    className={isSelected ? "text-signal" : "text-line"}
                    strokeWidth={isSelected ? 2.5 : 1}
                  />
                  {(p.node.kind === "connector" || p.node.kind === "workspace" || isSelected) && (
                    <text
                      y={p.r + 12}
                      textAnchor="middle"
                      className="pointer-events-none fill-current text-ink"
                      style={{ fontSize: 10, fontWeight: 700 }}
                    >
                      {p.node.label}
                    </text>
                  )}
                  <title>{`${p.node.kind}: ${p.node.label}`}</title>
                </g>
              );
            })}
          </g>
        </svg>
      </div>

      <NodeDetail node={selectedNode} graph={graph} sync={sync} onSelect={setSelected} />
    </div>
  );
}

function nodeFill(node: GraphNode): string {
  if (node.kind === "workspace") return "rgb(var(--c-ink))";
  if (node.kind === "connector") return "rgb(var(--c-signal))";
  if (node.kind === "permission") return "rgb(var(--c-cream-deep))";
  if (node.kind === "operation") {
    return node.risk === "destructive"
      ? "rgb(var(--c-ink))"
      : node.risk === "write"
        ? "rgb(var(--c-signal) / 0.55)"
        : "rgb(var(--c-cream-deep))";
  }
  return "rgb(var(--c-surface))";
}

function Toggle({ on, onClick, label }: { on: boolean; onClick: () => void; label: string }) {
  return (
    <button
      onClick={onClick}
      aria-pressed={on}
      className={`rounded-pill px-2.5 py-1 text-[10px] font-black uppercase tracking-wider transition-colors duration-fast focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-signal ${
        on ? "bg-ink text-cream" : "bg-cream-deep text-ink-soft hover:text-ink"
      }`}
    >
      {label}
    </button>
  );
}

function IconButton({
  label,
  onClick,
  children,
}: {
  label: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      aria-label={label}
      className="rounded-btn border border-line bg-cream/40 p-1.5 text-ink-soft transition-colors duration-fast hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-signal"
    >
      {children}
    </button>
  );
}

function NodeDetail({
  node,
  graph,
  sync,
  onSelect,
}: {
  node: GraphNode | null;
  graph: Graph;
  sync: SyncReport | null;
  onSelect: (id: string) => void;
}) {
  const [impact, setImpact] = useState<DependencyReport | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    setImpact(null);
    if (!node || (node.kind !== "resource" && node.kind !== "operation")) return;
    let cancelled = false;
    setLoading(true);
    (async () => {
      try {
        const res = await fetch(
          `/api/workspace-model/dependencies?node=${encodeURIComponent(node.id)}&action=delete`,
          { cache: "no-store" }
        );
        if (!res.ok) return;
        const data = await res.json();
        if (!cancelled) setImpact(data);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [node]);

  if (!node) {
    return (
      <aside className="rounded-card border border-line bg-surface p-4 shadow-soft">
        <p className="text-sm font-bold">Nothing selected</p>
        <p className="mt-1 text-xs text-ink-soft">
          Pick any node to see what it is, what it relates to, and what would break if it changed.
          Drag to pan, use the buttons to zoom.
        </p>
        {sync && sync.connectors.length > 0 && (
          <div className="mt-4">
            <p className="text-[10px] font-black uppercase tracking-wider text-ink-soft">live sync</p>
            <ul className="mt-2 flex flex-col gap-2">
              {sync.connectors.map((c) => (
                <li key={c.connector} className="rounded-btn border border-line/70 bg-cream/40 px-3 py-2">
                  <p className="flex items-center justify-between gap-2 text-xs font-bold">
                    {c.name}
                    <span className="rounded-pill bg-cream-deep px-2 py-0.5 font-mono text-[9px] font-bold uppercase text-ink-soft">
                      {c.mode}
                    </span>
                  </p>
                  <p className="mt-0.5 text-[11px] leading-relaxed text-ink-soft">{c.note}</p>
                </li>
              ))}
            </ul>
          </div>
        )}
      </aside>
    );
  }

  const related = graph.edges
    .filter((e) => e.from === node.id || e.to === node.id)
    .slice(0, 12);

  return (
    <aside className="rounded-card border border-line bg-surface p-4 shadow-soft">
      <p className="text-[10px] font-black uppercase tracking-wider text-signal">{node.kind}</p>
      <h2 className="mt-1 font-display text-lg font-bold">{node.label}</h2>
      <p className="mt-0.5 text-xs text-ink-soft">
        {node.connector || "workspace-wide"}
        {node.canonical && ` · ${node.canonical.replace(/_/g, " ")}`}
        {node.kind === "resource" &&
          ` · ${node.synced_count === null || node.synced_count === undefined ? "not synced" : `${node.synced_count.toLocaleString()} synced`}`}
      </p>

      {node.kind === "operation" && (
        <div className="mt-3 flex flex-wrap gap-1.5">
          <Pill>{node.mutation}</Pill>
          <Pill>{node.tier === 3 ? "sign" : node.tier === 2 ? "approve" : "auto"}</Pill>
          {node.reversible === false && (
            <span className="inline-flex items-center gap-1 rounded-pill bg-ink px-2 py-0.5 text-[10px] font-black uppercase tracking-wider text-cream">
              <Lock size={9} aria-hidden="true" /> irreversible
            </span>
          )}
        </div>
      )}

      {loading && (
        <p className="mt-4 flex items-center gap-1.5 text-xs text-ink-soft">
          <Loader2 size={12} className="animate-spin" aria-hidden="true" /> working out what depends on this…
        </p>
      )}

      {impact && (
        <div className="mt-4">
          <p className="text-[10px] font-black uppercase tracking-wider text-ink-soft">
            impact if deleted · {impact.severity}
          </p>
          <p className={`mt-1 text-xs font-semibold ${SEVERITY_TONE[impact.severity] ?? "text-ink"}`}>
            {impact.summary}
          </p>
          {impact.affected.length > 0 && (
            <ul className="mt-2 flex flex-col gap-1">
              {impact.affected.slice(0, 8).map((a) => (
                <li key={a.node_id} className="rounded-btn border border-line/70 bg-cream/40 px-2.5 py-1.5">
                  <button
                    onClick={() => onSelect(a.node_id)}
                    className="text-left text-xs font-bold hover:text-signal focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-signal"
                  >
                    {a.label} · {a.connector}
                  </button>
                  <p className="text-[11px] leading-relaxed text-ink-soft">{a.reason}</p>
                </li>
              ))}
            </ul>
          )}
          {impact.caveats.map((c) => (
            <p key={c} className="mt-2 text-[11px] leading-relaxed text-ink-soft">
              {c}
            </p>
          ))}
        </div>
      )}

      {related.length > 0 && (
        <div className="mt-4">
          <p className="text-[10px] font-black uppercase tracking-wider text-ink-soft">relationships</p>
          <ul className="mt-1.5 flex flex-col gap-1">
            {related.map((e) => (
              <li key={e.id} className="flex items-start gap-1.5 text-[11px] leading-relaxed text-ink-soft">
                <GitBranch size={10} className="mt-0.5 shrink-0" aria-hidden="true" />
                <button
                  onClick={() => onSelect(e.from === node.id ? e.to : e.from)}
                  className="text-left hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-signal"
                >
                  {e.label}
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </aside>
  );
}

function Pill({ children }: { children: React.ReactNode }) {
  return (
    <span className="rounded-pill bg-cream-deep px-2 py-0.5 text-[10px] font-black uppercase tracking-wider text-ink-soft">
      {children}
    </span>
  );
}

/* ------------------------------------------------------------------- query */

const EXAMPLES = [
  "which permissions can delete data",
  "show every action on customers",
  "what would be affected if invoices are deleted",
  "find irreversible actions in github",
];

function QueryPanel({ graph }: { graph: Graph }) {
  const [text, setText] = useState("");
  const [result, setResult] = useState<QueryResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const ask = useCallback(async (query: string) => {
    if (query.trim().length < 2) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/workspace-model/query", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ query }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message ?? "that query didn't run.");
      setResult(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "that query didn't run.");
    } finally {
      setBusy(false);
    }
  }, []);

  return (
    <div className="rounded-card border border-line bg-surface p-4 shadow-soft">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          ask(text);
        }}
        className="flex gap-2"
      >
        <label htmlFor="wm-query" className="sr-only">
          Ask the workspace model
        </label>
        <input
          id="wm-query"
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="ask the model — e.g. what depends on customers?"
          className="min-w-0 flex-1 rounded-btn border border-line bg-cream/40 px-3 py-2 text-sm font-semibold placeholder:text-ink-soft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-signal"
        />
        <button
          type="submit"
          disabled={busy}
          className="inline-flex items-center gap-1.5 rounded-btn bg-ink px-4 py-2 text-xs font-black uppercase tracking-wider text-cream transition-opacity duration-fast disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-signal"
        >
          {busy ? <Loader2 size={12} className="animate-spin" aria-hidden="true" /> : <Search size={12} aria-hidden="true" />}
          ask
        </button>
      </form>

      <div className="mt-2 flex flex-wrap gap-1.5">
        {EXAMPLES.map((ex) => (
          <button
            key={ex}
            onClick={() => {
              setText(ex);
              ask(ex);
            }}
            className="rounded-pill bg-cream-deep px-2.5 py-1 text-[10px] font-bold text-ink-soft transition-colors duration-fast hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-signal"
          >
            {ex}
          </button>
        ))}
      </div>

      {error && <p className="mt-4 text-sm font-semibold">{error}</p>}

      {result && (
        <div className="mt-5">
          <p className="text-sm font-bold">{result.answer}</p>
          <p className="mt-1 text-xs text-ink-soft">
            Read as: {result.interpretation.reading}
            {result.interpretation.unmatched.length > 0 &&
              ` · couldn't use: ${result.interpretation.unmatched.join(", ")}`}
          </p>

          {result.impact && (
            <div className="mt-3 rounded-btn border border-line/70 bg-cream/40 px-3 py-2">
              <p className="text-[10px] font-black uppercase tracking-wider text-ink-soft">
                dependency impact · {result.impact.severity}
              </p>
              <p className="mt-1 text-xs font-semibold">{result.impact.summary}</p>
            </div>
          )}

          <ul className="mt-3 flex flex-col gap-1.5">
            {result.nodes.slice(0, 40).map((n) => (
              <li
                key={n.id}
                className="flex flex-wrap items-center gap-2 rounded-btn border border-line/70 bg-cream/40 px-3 py-2"
              >
                <Pill>{n.kind}</Pill>
                <span className="min-w-0 flex-1 truncate text-sm font-semibold">{n.label}</span>
                {n.connector && <span className="text-[11px] text-ink-soft">{n.connector}</span>}
                {n.reversible === false && (
                  <span className="inline-flex items-center gap-1 text-[10px] font-bold text-ink-soft">
                    <Lock size={10} aria-hidden="true" /> irreversible
                  </span>
                )}
              </li>
            ))}
          </ul>
          {result.nodes.length > 40 && (
            <p className="mt-2 text-[11px] text-ink-soft">
              Showing the first 40 of {result.nodes.length} matches.
            </p>
          )}
          <p className="mt-3 text-[11px] leading-relaxed text-ink-soft">
            Queries are parsed deterministically — no model call — so the same question always returns
            the same answer, and every word it couldn&apos;t use is listed above rather than ignored.
          </p>
        </div>
      )}

      {!result && !error && (
        <p className="mt-4 text-xs text-ink-soft">
          {graph.stats.operations} actions across {graph.stats.connectors} systems are searchable.
        </p>
      )}
    </div>
  );
}

/* -------------------------------------------------------------------- plan */

function PlanPanel({ graph }: { graph: Graph }) {
  const operations = useMemo(
    () => graph.nodes.filter((n) => n.kind === "operation"),
    [graph]
  );
  const [operationId, setOperationId] = useState<string>(operations[0]?.id ?? "");
  const [goal, setGoal] = useState("");
  const [payload, setPayload] = useState('{\n  "amount_cents": 1994,\n  "reason": "duplicate charge"\n}');
  const [result, setResult] = useState<PlanResponse | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const selected = operations.find((o) => o.id === operationId);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selected) return;
    let after: Record<string, unknown> = {};
    if (payload.trim()) {
      try {
        const parsed = JSON.parse(payload);
        if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
          throw new Error("the payload needs to be a JSON object.");
        }
        after = parsed as Record<string, unknown>;
      } catch (err) {
        setError(err instanceof Error ? err.message : "the payload isn't valid JSON.");
        return;
      }
    }
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/workspace-model/plan", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          goal: goal.trim() || `Run ${selected.label.toLowerCase()}`,
          connector: selected.connector,
          // The graph node id is `operation:<connector>:<operation id>`.
          operation: selected.id.split(":").slice(2).join(":"),
          after,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message ?? "planning failed.");
      setResult(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "planning failed.");
    } finally {
      setBusy(false);
    }
  };

  if (operations.length === 0) {
    return (
      <div className="rounded-card border border-dashed border-line bg-surface/60 p-8 text-center text-sm text-ink-soft">
        No modelled actions to plan against yet. Connect a tool first.
      </div>
    );
  }

  return (
    <div className="grid gap-4 lg:grid-cols-[320px_1fr]">
      <form onSubmit={submit} className="rounded-card border border-line bg-surface p-4 shadow-soft">
        <label htmlFor="wm-goal" className="text-[10px] font-black uppercase tracking-wider text-ink-soft">
          goal
        </label>
        <input
          id="wm-goal"
          value={goal}
          onChange={(e) => setGoal(e.target.value)}
          placeholder="refund the duplicate payment"
          className="mt-1 w-full rounded-btn border border-line bg-cream/40 px-3 py-2 text-sm font-semibold placeholder:text-ink-soft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-signal"
        />

        <label
          htmlFor="wm-operation"
          className="mt-4 block text-[10px] font-black uppercase tracking-wider text-ink-soft"
        >
          action
        </label>
        <select
          id="wm-operation"
          value={operationId}
          onChange={(e) => setOperationId(e.target.value)}
          className="mt-1 w-full rounded-btn border border-line bg-cream/40 px-3 py-2 text-sm font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-signal"
        >
          {operations.map((o) => (
            <option key={o.id} value={o.id}>
              {o.connector} · {o.label}
            </option>
          ))}
        </select>

        <label
          htmlFor="wm-payload"
          className="mt-4 block text-[10px] font-black uppercase tracking-wider text-ink-soft"
        >
          proposed values (json)
        </label>
        <textarea
          id="wm-payload"
          value={payload}
          onChange={(e) => setPayload(e.target.value)}
          rows={6}
          spellCheck={false}
          className="mt-1 w-full rounded-btn border border-line bg-cream/40 px-3 py-2 font-mono text-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-signal"
        />

        <button
          type="submit"
          disabled={busy}
          className="mt-4 inline-flex w-full items-center justify-center gap-1.5 rounded-btn bg-ink px-4 py-2.5 text-xs font-black uppercase tracking-wider text-cream transition-opacity duration-fast disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-signal"
        >
          {busy ? <Loader2 size={12} className="animate-spin" aria-hidden="true" /> : <Workflow size={12} aria-hidden="true" />}
          build the plan
        </button>
        <p className="mt-2 text-[11px] leading-relaxed text-ink-soft">
          Planning is read-only. It reasons against the model and never calls the connected system.
        </p>
        {error && <p className="mt-2 text-xs font-semibold">{error}</p>}
      </form>

      <div>{result ? <PlanResult data={result} /> : <PlanPlaceholder />}</div>
    </div>
  );
}

function PlanPlaceholder() {
  return (
    <div className="rounded-card border border-dashed border-line bg-surface/60 p-8 text-center">
      <Workflow size={20} className="mx-auto text-ink-soft" aria-hidden="true" />
      <p className="mt-3 text-sm font-bold">No plan yet</p>
      <p className="mx-auto mt-1 max-w-sm text-sm text-ink-soft">
        Pick an action and cosigno will build the execution plan: locate, verify, evaluate policy,
        simulate, price it, and produce a changeset you can read before anything runs.
      </p>
    </div>
  );
}

function PlanResult({ data }: { data: PlanResponse }) {
  const { plan, predicted_diff: diff } = data;
  const cs = plan.changeset;

  return (
    <div className="flex flex-col gap-4">
      <section className="rounded-card border border-line bg-surface p-4 shadow-soft">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <p className="text-[10px] font-black uppercase tracking-wider text-signal">execution plan</p>
            <h2 className="mt-0.5 font-display text-lg font-bold">{plan.goal}</h2>
          </div>
          <span className="rounded-pill bg-ink px-2.5 py-1 text-[10px] font-black uppercase tracking-wider text-cream">
            requires {plan.requires}
          </span>
        </div>

        <ol className="mt-3 flex flex-col gap-1.5">
          {plan.steps.map((s) => (
            <li
              key={s.index}
              className={`rounded-btn border px-3 py-2 ${
                s.status === "blocked" ? "border-ink/40 bg-ink/5" : "border-line/70 bg-cream/40"
              }`}
            >
              <p className="flex items-center gap-2 text-xs font-bold">
                <span className="inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-cream-deep font-mono text-[9px] text-ink-soft">
                  {s.index}
                </span>
                {s.title}
                {s.status === "blocked" && (
                  <span className="inline-flex items-center gap-1 text-[10px] font-black uppercase tracking-wider">
                    <AlertTriangle size={10} aria-hidden="true" /> blocked
                  </span>
                )}
              </p>
              <p className="mt-0.5 pl-6 text-[11px] leading-relaxed text-ink-soft">
                {s.blocked_reason ?? s.detail}
              </p>
            </li>
          ))}
        </ol>

        {plan.refusals.map((r) => (
          <p key={r} className="mt-2 text-[11px] font-semibold leading-relaxed">
            {r}
          </p>
        ))}
      </section>

      <section className="rounded-card border border-line bg-surface p-4 shadow-soft">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <p className="text-[10px] font-black uppercase tracking-wider text-signal">changeset {cs.id}</p>
            <h3 className="mt-0.5 font-display text-base font-bold">{cs.title}</h3>
          </div>
          <div className="flex gap-1.5">
            <Pill>+{cs.added}</Pill>
            <Pill>~{cs.modified}</Pill>
            <Pill>−{cs.deleted}</Pill>
          </div>
        </div>
        <p className="mt-2 text-xs font-semibold text-ink-soft">{cs.summary}</p>

        {cs.entries.length > 0 && (
          <table className="mt-3 w-full text-left text-xs">
            <thead>
              <tr className="text-[10px] font-black uppercase tracking-wider text-ink-soft">
                <th className="py-1 pr-2 font-black">field</th>
                <th className="py-1 pr-2 font-black">before</th>
                <th className="py-1 font-black">after</th>
              </tr>
            </thead>
            <tbody>
              {diff.rows.map((r) => (
                <tr key={r.label} className="border-t border-line/60">
                  <td className="py-1.5 pr-2 font-bold">{r.label}</td>
                  <td className="py-1.5 pr-2 font-mono text-[11px] text-ink-soft line-through">{r.before}</td>
                  <td className="py-1.5 font-mono text-[11px]">
                    {r.after}
                    {r.delta && <span className="ml-1.5 text-ink-soft">{r.delta}</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        <dl className="mt-4 grid gap-2 sm:grid-cols-2">
          <Fact label="risk" value={cs.risk.level} />
          <Fact
            label="cost"
            value={
              cs.cost.amount_cents === null
                ? "none declared"
                : (cs.cost.amount_cents / 100).toLocaleString("en-US", { style: "currency", currency: "USD" })
            }
          />
          <Fact label="systems" value={cs.affected_systems.join(", ") || "none"} />
          <Fact label="permissions" value={cs.required_permissions.join(", ") || "none"} />
          <Fact
            label="secrets changed"
            value={diff.counters.secrets_changed === null ? "not reported" : String(diff.counters.secrets_changed)}
          />
          <Fact label="api calls" value={String(cs.cost.api_calls)} />
        </dl>
        <p className="mt-2 text-[11px] leading-relaxed text-ink-soft">{cs.cost.basis}</p>
      </section>

      <section className="rounded-card border border-line bg-surface p-4 shadow-soft">
        <p className="flex items-center gap-1.5 text-[10px] font-black uppercase tracking-wider text-signal">
          <Undo2 size={11} aria-hidden="true" /> rollback · {cs.rollback.supported}
        </p>
        {cs.rollback.steps.length > 0 ? (
          <ul className="mt-2 flex flex-col gap-1.5">
            {cs.rollback.steps.map((s) => (
              <li key={s.title} className="rounded-btn border border-line/70 bg-cream/40 px-3 py-2">
                <p className="text-xs font-bold">{s.title}</p>
                <p className="mt-0.5 text-[11px] leading-relaxed text-ink-soft">{s.detail}</p>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-2 text-xs font-semibold">
            cosigno has no automatic undo for this change.
          </p>
        )}
        <p className="mt-2 text-[11px] text-ink-soft">
          Recovery: {cs.rollback.estimated_recovery} · rolling back requires {cs.rollback.requires}.
        </p>
        {cs.rollback.caveats.map((c) => (
          <p key={c} className="mt-1 text-[11px] leading-relaxed text-ink-soft">
            {c}
          </p>
        ))}
      </section>
    </div>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-btn border border-line/70 bg-cream/40 px-3 py-2">
      <dt className="text-[10px] font-black uppercase tracking-wider text-ink-soft">{label}</dt>
      <dd className="mt-0.5 break-words text-xs font-bold">{value}</dd>
    </div>
  );
}
