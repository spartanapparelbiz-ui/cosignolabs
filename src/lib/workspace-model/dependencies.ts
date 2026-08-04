/**
 * The Dependency Engine — "what breaks if I touch this?"
 *
 * Given any node in the Workspace Model, this walks the graph and reports
 * everything downstream of it: the objects that reference it, the operations
 * that would fail, the permissions involved, and every OTHER connected system
 * dragged in through cross-connector identity.
 *
 * The honesty rule from the graph carries through: impact is stated in terms
 * of the model's DECLARED structure. Where a resource has genuinely synced
 * instance counts the report says "18 invoices"; where it hasn't, it says
 * "invoices reference this — count not synced". A fabricated number in an
 * impact report is worse than no number at all, because it is exactly the
 * number a human uses to decide whether to approve.
 */

import type { GraphEdge, GraphNode, WorkspaceGraph } from "./graph";
import { getNode, neighbors } from "./graph";

export type ImpactSeverity = "none" | "low" | "moderate" | "high" | "severe";

export interface ImpactedObject {
  node_id: string;
  label: string;
  connector: string;
  canonical?: string;
  /** How it is reached: the chain of edge readings from the origin. */
  path: string[];
  /** Observed instance count, or null when the resource isn't synced. */
  synced_count: number | null;
  /** Why this object is affected, in one sentence. */
  reason: string;
}

export interface DependencyReport {
  origin: { node_id: string; label: string; connector: string; kind: string };
  /** Objects that would be affected, nearest first. */
  affected: ImpactedObject[];
  /** Distinct connected systems dragged in (including the origin's own). */
  systems: string[];
  /** Operations that would be invalidated or fail. */
  broken_operations: { node_id: string; label: string; connector: string; risk?: string }[];
  /** Permissions implicated anywhere in the blast path. */
  permissions: string[];
  severity: ImpactSeverity;
  /** True when any affected resource reports observed instances. */
  has_observed_counts: boolean;
  /** Plain-language headline, safe to render verbatim. */
  summary: string;
  /** Everything the report deliberately does NOT claim. */
  caveats: string[];
}

/** Edges that propagate impact. `exposes`/`contains` are structural, not causal. */
const IMPACT_EDGES = new Set<GraphEdge["kind"]>(["references", "same_as", "reads", "writes", "deletes"]);

const SEVERITY_ORDER: ImpactSeverity[] = ["none", "low", "moderate", "high", "severe"];

function bump(current: ImpactSeverity, to: ImpactSeverity): ImpactSeverity {
  return SEVERITY_ORDER.indexOf(to) > SEVERITY_ORDER.indexOf(current) ? to : current;
}

/**
 * Walk outward from `nodeId`, following only causal edges, and describe the
 * damage. `depth` bounds the walk so a densely-linked workspace can't produce
 * an unreadable report; the bound is reported in the caveats.
 */
export function analyzeDependencies(
  graph: WorkspaceGraph,
  nodeId: string,
  opts: { depth?: number; action?: "delete" | "update" | "read" } = {}
): DependencyReport {
  const maxDepth = opts.depth ?? 3;
  const action = opts.action ?? "delete";
  const origin = getNode(graph, nodeId);

  if (!origin) {
    return {
      origin: { node_id: nodeId, label: nodeId, connector: "", kind: "unknown" },
      affected: [],
      systems: [],
      broken_operations: [],
      permissions: [],
      severity: "none",
      has_observed_counts: false,
      summary: `"${nodeId}" is not in the Workspace Model — cosigno cannot reason about it.`,
      caveats: ["The object was not found in the model, so no impact could be computed."],
    };
  }

  const affected: ImpactedObject[] = [];
  const brokenOps = new Map<string, { node_id: string; label: string; connector: string; risk?: string }>();
  const permissions = new Set<string>();
  const systems = new Set<string>(origin.connector ? [origin.connector] : []);
  const seen = new Set([nodeId]);

  let frontier: { id: string; path: string[] }[] = [{ id: nodeId, path: [] }];

  for (let depth = 1; depth <= maxDepth; depth++) {
    const next: { id: string; path: string[] }[] = [];
    for (const cur of frontier) {
      for (const hop of neighbors(graph, cur.id)) {
        const { node, edge } = hop;

        // Permissions and operations hang off the object; collect them at any
        // depth without treating them as further hops.
        if (node.kind === "permission") {
          permissions.add(node.label);
          continue;
        }
        if (node.kind === "operation") {
          // An operation is only "broken" if it acts on an affected object.
          if (!brokenOps.has(node.id)) {
            brokenOps.set(node.id, {
              node_id: node.id,
              label: node.label,
              connector: node.connector,
              risk: node.risk,
            });
          }
          if (node.connector) systems.add(node.connector);
          continue;
        }
        if (!IMPACT_EDGES.has(edge.kind)) continue;
        if (seen.has(node.id)) continue;

        seen.add(node.id);
        const path = [...cur.path, edge.label];
        affected.push({
          node_id: node.id,
          label: node.label,
          connector: node.connector,
          canonical: node.canonical,
          path,
          synced_count: node.synced_count ?? null,
          reason: reasonFor(node, edge, action),
        });
        if (node.connector) systems.add(node.connector);
        next.push({ id: node.id, path });
      }
    }
    if (next.length === 0) break;
    frontier = next;
  }

  const hasCounts = affected.some((a) => typeof a.synced_count === "number");
  const destructiveOps = [...brokenOps.values()].filter((o) => o.risk === "destructive").length;

  let severity: ImpactSeverity = affected.length === 0 ? "none" : "low";
  if (affected.length >= 3) severity = bump(severity, "moderate");
  if (systems.size >= 2) severity = bump(severity, "moderate");
  if (systems.size >= 3) severity = bump(severity, "high");
  if (action === "delete" && affected.length > 0) severity = bump(severity, "high");
  if (action === "delete" && systems.size >= 3) severity = bump(severity, "severe");
  if (destructiveOps > 0 && action === "delete") severity = bump(severity, "severe");
  if (action === "read") severity = "none";

  return {
    origin: { node_id: origin.id, label: origin.label, connector: origin.connector, kind: origin.kind },
    affected,
    systems: [...systems].sort(),
    broken_operations: [...brokenOps.values()],
    permissions: [...permissions].sort(),
    severity,
    has_observed_counts: hasCounts,
    summary: summarize(origin, affected, systems, action),
    caveats: caveats(affected, maxDepth, hasCounts),
  };
}

function reasonFor(node: GraphNode, edge: GraphEdge, action: string): string {
  if (edge.kind === "same_as") {
    return `The same object exists in ${node.connector} — a ${action} here leaves the two systems disagreeing until they resync.`;
  }
  if (edge.kind === "references") return `${edge.label} — the reference would dangle.`;
  return edge.label;
}

function summarize(
  origin: GraphNode,
  affected: ImpactedObject[],
  systems: Set<string>,
  action: string
): string {
  if (affected.length === 0) {
    return `Nothing in the Workspace Model depends on ${origin.label.toLowerCase()}. A ${action} here is contained to ${origin.connector || "this workspace"}.`;
  }
  const counted = affected.filter((a) => typeof a.synced_count === "number");
  const countPart = counted.length
    ? ` (${counted.map((c) => `${c.synced_count} ${c.label.toLowerCase()}`).join(", ")} observed)`
    : "";
  return `A ${action} on ${origin.label.toLowerCase()} reaches ${affected.length} object type${affected.length === 1 ? "" : "s"} across ${systems.size} system${systems.size === 1 ? "" : "s"}${countPart}.`;
}

function caveats(affected: ImpactedObject[], depth: number, hasCounts: boolean): string[] {
  const out = [`Impact was walked ${depth} hops from the origin; anything further is not shown.`];
  if (!hasCounts) {
    out.push(
      "No affected resource has synced instance counts, so this report names the object TYPES at risk, not how many records exist. cosigno will not estimate a number it hasn't observed."
    );
  } else if (affected.some((a) => a.synced_count === null)) {
    out.push("Some affected resources are not synced; their record counts are unknown and shown as such.");
  }
  return out;
}

/**
 * Impact for a whole planned operation rather than a bare object: resolves the
 * operation's target resource first, then runs the same analysis with the
 * operation's own mutation as the action.
 */
export function analyzeOperationImpact(graph: WorkspaceGraph, operationNodeId: string): DependencyReport {
  const op = getNode(graph, operationNodeId);
  if (!op || op.kind !== "operation") return analyzeDependencies(graph, operationNodeId);

  const target = neighbors(graph, operationNodeId).find(
    (n) => n.direction === "out" && ["reads", "writes", "deletes"].includes(n.edge.kind)
  );
  const action = op.mutation === "delete" ? "delete" : op.mutation === "read" ? "read" : "update";
  if (!target) return analyzeDependencies(graph, operationNodeId, { action });
  return analyzeDependencies(graph, target.node.id, { action });
}
