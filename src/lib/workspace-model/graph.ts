/**
 * The Universal Object Graph — the Workspace Model's spine.
 *
 * Every connected system is projected onto ONE graph of typed nodes and typed
 * edges: workspace → connector → resource → operation, plus the permission each
 * operation demands and the cross-connector links between resources that mean
 * the same thing (a Stripe customer and a Salesforce account are the same
 * business object seen twice).
 *
 * WHAT THIS IS NOT: a copy of your data. The graph models STRUCTURE —
 * capability, relationship, permission, reversibility. Instance counts appear
 * only on resources a connector has genuinely synced; everywhere else the node
 * reports `synced_count: null` and the UI says "not synced" rather than "0".
 * The model is trustworthy precisely because it never asserts state it hasn't
 * observed.
 *
 * The graph is derived deterministically from digital twins, which are
 * themselves derived from providers' real declared actions. Nothing here is
 * invented, so the same connections always produce the same graph — which is
 * what lets a plan built against it be replayed and audited.
 */

import type { DigitalTwin, Mutation, TwinOperation } from "@/lib/twin/model";
import { canonicalize, permissionFor, type CanonicalType } from "./canonical";
import { businessAction } from "@/lib/actionLibrary";

export type NodeKind = "workspace" | "connector" | "resource" | "operation" | "permission";

export type EdgeKind =
  | "contains" // workspace → connector, connector → resource
  | "exposes" // resource → operation
  | "requires" // operation → permission
  | "reads" // operation → resource it reads
  | "writes" // operation → resource it changes
  | "deletes" // operation → resource it destroys
  | "same_as" // resource ↔ resource across connectors (same canonical object)
  | "references"; // resource → resource it depends on within a connector

export interface GraphNode {
  id: string;
  kind: NodeKind;
  label: string;
  /** Connector this node belongs to ("" for the workspace root). */
  connector: string;
  /** Canonical object type, for resource + operation nodes. */
  canonical?: string;
  domain?: string;
  /** Operation-only facts, carried so the UI never re-derives them. */
  mutation?: Mutation;
  tier?: number;
  reversible?: boolean;
  category?: string;
  /** Resource-only. `null` means un-synced — never zero-as-unknown. */
  synced_count?: number | null;
  /** Connector-only: live status from the connection record. */
  status?: string;
  /** Risk band used for filtering + colouring in the explorer. */
  risk?: "read" | "write" | "destructive";
}

export interface GraphEdge {
  id: string;
  from: string;
  to: string;
  kind: EdgeKind;
  /** Plain-language reading of the edge, e.g. "invoice belongs to customer". */
  label: string;
}

export interface WorkspaceGraph {
  nodes: GraphNode[];
  edges: GraphEdge[];
  generated_at: string;
  stats: {
    connectors: number;
    resources: number;
    operations: number;
    permissions: number;
    relationships: number;
    /** Resources with observed instance counts, and the total observed. */
    synced_resources: number;
    synced_instances: number | null;
  };
}

export const WORKSPACE_ROOT = "workspace";

/**
 * Canonical containment: which object a given object hangs off inside the same
 * connector. Derived from the business meaning of the objects, not from a
 * vendor's schema, so it holds across every connector that exposes them.
 */
const REFERENCES: Record<string, string[]> = {
  subscription: ["customer", "product", "price", "payment_method"],
  invoice: ["customer", "subscription"],
  payment: ["customer", "invoice", "payment_method"],
  refund: ["payment", "customer"],
  payment_method: ["customer"],
  price: ["product"],
  ticket: ["customer", "contact", "account"],
  contact: ["account"],
  opportunity: ["account", "contact"],
  lead: ["campaign"],
  pull_request: ["repository", "branch"],
  branch: ["repository"],
  commit: ["repository", "branch"],
  issue: ["repository"],
  workflow: ["repository"],
  deployment: ["repository", "workflow"],
  secret: ["repository", "workflow"],
  message: ["channel", "user"],
  file: ["folder"],
  page: ["folder"],
  event: ["user"],
  task: ["user"],
};

function riskOf(op: TwinOperation): "read" | "write" | "destructive" {
  if (op.mutation === "delete") return "destructive";
  return op.mutates ? "write" : "read";
}

export function resourceNodeId(connector: string, resource: string): string {
  return `resource:${connector}:${resource}`;
}
export function operationNodeId(connector: string, operationId: string): string {
  return `operation:${connector}:${operationId}`;
}
export function connectorNodeId(connector: string): string {
  return `connector:${connector}`;
}
export function permissionNodeId(permission: string): string {
  return `permission:${permission}`;
}

/**
 * Build the graph from every twin in the workspace. Pure and deterministic:
 * same twins in, same graph out, byte for byte.
 */
export function buildGraph(twins: DigitalTwin[], now = new Date().toISOString()): WorkspaceGraph {
  const nodes = new Map<string, GraphNode>();
  const edges = new Map<string, GraphEdge>();

  const addNode = (n: GraphNode) => {
    if (!nodes.has(n.id)) nodes.set(n.id, n);
    return n.id;
  };
  const addEdge = (from: string, to: string, kind: EdgeKind, label: string) => {
    const id = `${from}->${to}:${kind}`;
    if (!edges.has(id)) edges.set(id, { id, from, to, kind, label });
  };

  addNode({ id: WORKSPACE_ROOT, kind: "workspace", label: "Workspace", connector: "" });

  /** canonical type → every resource node that represents it, for `same_as`. */
  const byCanonical = new Map<string, { nodeId: string; connector: string; canonical: CanonicalType }[]>();

  for (const twin of twins) {
    const connectorId = connectorNodeId(twin.connection_key);
    addNode({
      id: connectorId,
      kind: "connector",
      label: twin.name,
      connector: twin.connection_key,
      status: twin.status,
    });
    addEdge(WORKSPACE_ROOT, connectorId, "contains", `workspace contains ${twin.name}`);

    /** resource name (twin-local) → node id, for intra-connector references. */
    const localResources = new Map<string, { nodeId: string; canonical: CanonicalType }>();

    for (const resource of twin.resources) {
      const canonical = canonicalize(resource.name);
      const nodeId = resourceNodeId(twin.connection_key, resource.name);
      addNode({
        id: nodeId,
        kind: "resource",
        label: resource.label,
        connector: twin.connection_key,
        canonical: canonical.type,
        domain: canonical.domain,
        synced_count: resource.synced_count,
      });
      addEdge(connectorId, nodeId, "contains", `${twin.name} exposes ${resource.label.toLowerCase()}`);
      localResources.set(canonical.type, { nodeId, canonical });
      byCanonical.set(canonical.type, [
        ...(byCanonical.get(canonical.type) ?? []),
        { nodeId, connector: twin.connection_key, canonical },
      ]);

      for (const op of resource.operations) {
        const opId = operationNodeId(twin.connection_key, op.id);
        const permission = permissionFor(canonical, op.mutation);
        addNode({
          id: opId,
          kind: "operation",
          label: businessAction(op.id).name,
          connector: twin.connection_key,
          canonical: canonical.type,
          domain: canonical.domain,
          mutation: op.mutation,
          tier: op.tier,
          reversible: op.reversible,
          category: op.category,
          risk: riskOf(op),
        });
        addEdge(nodeId, opId, "exposes", `${resource.label.toLowerCase()} exposes ${op.id}`);

        const effect: EdgeKind =
          op.mutation === "read" ? "reads" : op.mutation === "delete" ? "deletes" : "writes";
        addEdge(opId, nodeId, effect, `${op.id} ${effect} ${resource.name.replace(/_/g, " ")}`);

        const permId = permissionNodeId(permission);
        addNode({ id: permId, kind: "permission", label: permission, connector: "" });
        addEdge(opId, permId, "requires", `${op.id} requires ${permission}`);
      }
    }

    // Intra-connector references, from the canonical containment table. An edge
    // is only drawn when BOTH ends actually exist in this connector's twin —
    // the graph never claims a relationship to an object the connector doesn't
    // expose.
    for (const [canonicalType, { nodeId }] of localResources) {
      for (const parent of REFERENCES[canonicalType] ?? []) {
        const target = localResources.get(parent);
        if (!target) continue;
        addEdge(nodeId, target.nodeId, "references", `${canonicalType.replace(/_/g, " ")} belongs to ${parent.replace(/_/g, " ")}`);
      }
    }
  }

  // Cross-connector identity: the same canonical object exposed by two
  // different systems is ONE business object seen twice. This is what makes an
  // impact analysis span vendors instead of stopping at a connector boundary.
  for (const [canonicalType, entries] of byCanonical) {
    if (entries.length < 2) continue;
    for (let i = 0; i < entries.length; i++) {
      for (let j = i + 1; j < entries.length; j++) {
        addEdge(
          entries[i].nodeId,
          entries[j].nodeId,
          "same_as",
          `${canonicalType.replace(/_/g, " ")} in ${entries[i].connector} is the same object as in ${entries[j].connector}`
        );
      }
    }
  }

  const nodeList = [...nodes.values()];
  const resources = nodeList.filter((n) => n.kind === "resource");
  const syncedResources = resources.filter((r) => typeof r.synced_count === "number");

  return {
    nodes: nodeList,
    edges: [...edges.values()],
    generated_at: now,
    stats: {
      connectors: nodeList.filter((n) => n.kind === "connector").length,
      resources: resources.length,
      operations: nodeList.filter((n) => n.kind === "operation").length,
      permissions: nodeList.filter((n) => n.kind === "permission").length,
      relationships: edges.size,
      synced_resources: syncedResources.length,
      // null, not 0: "nothing synced" and "synced nothing" are different claims.
      synced_instances: syncedResources.length
        ? syncedResources.reduce((sum, r) => sum + (r.synced_count ?? 0), 0)
        : null,
    },
  };
}

/* -------------------------------------------------------------------------- */
/* traversal                                                                   */
/* -------------------------------------------------------------------------- */

export function getNode(graph: WorkspaceGraph, id: string): GraphNode | undefined {
  return graph.nodes.find((n) => n.id === id);
}

export interface Neighbor {
  node: GraphNode;
  edge: GraphEdge;
  direction: "out" | "in";
}

/** Every node one hop away, with the edge that got there and its direction. */
export function neighbors(graph: WorkspaceGraph, id: string): Neighbor[] {
  const index = new Map(graph.nodes.map((n) => [n.id, n]));
  const out: Neighbor[] = [];
  for (const edge of graph.edges) {
    if (edge.from === id) {
      const node = index.get(edge.to);
      if (node) out.push({ node, edge, direction: "out" });
    } else if (edge.to === id) {
      const node = index.get(edge.from);
      if (node) out.push({ node, edge, direction: "in" });
    }
  }
  return out;
}

/**
 * Breadth-first traversal from a node, bounded by depth and by edge kind.
 * Returns nodes in discovery order with the hop count that found them.
 */
export function traverse(
  graph: WorkspaceGraph,
  startId: string,
  opts: { depth?: number; kinds?: EdgeKind[] } = {}
): { node: GraphNode; depth: number; via: GraphEdge | null }[] {
  const maxDepth = opts.depth ?? 2;
  const allowed = opts.kinds ? new Set(opts.kinds) : null;
  const start = getNode(graph, startId);
  if (!start) return [];

  const seen = new Set([startId]);
  const result: { node: GraphNode; depth: number; via: GraphEdge | null }[] = [
    { node: start, depth: 0, via: null },
  ];
  let frontier = [startId];

  for (let depth = 1; depth <= maxDepth; depth++) {
    const next: string[] = [];
    for (const id of frontier) {
      for (const n of neighbors(graph, id)) {
        if (allowed && !allowed.has(n.edge.kind)) continue;
        if (seen.has(n.node.id)) continue;
        seen.add(n.node.id);
        result.push({ node: n.node, depth, via: n.edge });
        next.push(n.node.id);
      }
    }
    if (next.length === 0) break;
    frontier = next;
  }
  return result;
}

/** The subgraph induced by a set of node ids (used by the explorer's filters). */
export function subgraph(graph: WorkspaceGraph, nodeIds: Set<string>): WorkspaceGraph {
  return {
    ...graph,
    nodes: graph.nodes.filter((n) => nodeIds.has(n.id)),
    edges: graph.edges.filter((e) => nodeIds.has(e.from) && nodeIds.has(e.to)),
  };
}
