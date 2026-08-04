import type { WorkspaceGraph } from "./graph";

/**
 * The Workspace Map — the graph, laid out as something a person can read.
 *
 * The underlying model is a graph, and drawing a graph as a graph produces a
 * spiderweb: every system tangled to every other, zoomable, pannable, and
 * impossible to understand at a glance. Nobody looks at that and knows what
 * their AI works with.
 *
 * So the map is a LINE, left to right, in the order work actually flows:
 *
 *     GitHub → Website → Stripe → Customers → Slack
 *
 * Two rules keep it readable:
 *   1. One box per connected SYSTEM — never one per resource or operation.
 *   2. A link is drawn only where two neighbouring systems genuinely share a
 *      business object. No shared object, no arrow. Decorative arrows are how
 *      a map becomes a diagram.
 *
 * Pure and deterministic, like everything else in the model.
 */

export interface MapObject {
  id: string;
  label: string;
  /** Observed instances, or null when the resource isn't synced. */
  synced_count: number | null;
}

export interface MapAction {
  id: string;
  label: string;
  risk: "read" | "write" | "destructive";
  reversible: boolean;
}

export interface MapSystem {
  /** Connector node id from the graph. */
  id: string;
  connector: string;
  name: string;
  status: string;
  /** The domain that best describes what this system holds. */
  domain: string;
  objects: MapObject[];
  actions: MapAction[];
  /** Names of other systems it shares business objects with. */
  shares_with: string[];
}

export interface MapLink {
  from: string;
  to: string;
  /** The objects both systems hold — the reason the arrow exists. */
  shared: string[];
  label: string;
}

export interface WorkspaceMap {
  systems: MapSystem[];
  links: MapLink[];
  /** True when nothing is connected yet. */
  empty: boolean;
}

/**
 * Reading order. Work tends to flow from where things are built, through where
 * they're stored and sold, to where people are told about it — which is also
 * the order the systems make sense in when read as a sentence.
 */
const DOMAIN_ORDER = [
  "code",
  "storage",
  "productivity",
  "finance",
  "crm",
  "comms",
  "identity",
  "generic",
];

function domainRank(domain: string): number {
  const i = DOMAIN_ORDER.indexOf(domain);
  return i === -1 ? DOMAIN_ORDER.length : i;
}

/** The domain a system mostly deals in, by simple majority of its objects. */
function dominantDomain(domains: string[]): string {
  if (domains.length === 0) return "generic";
  const counts = new Map<string, number>();
  for (const d of domains) counts.set(d, (counts.get(d) ?? 0) + 1);
  return [...counts.entries()].sort((a, b) => b[1] - a[1] || domainRank(a[0]) - domainRank(b[0]))[0][0];
}

export function buildMap(graph: WorkspaceGraph): WorkspaceMap {
  const connectors = graph.nodes.filter((n) => n.kind === "connector");
  if (connectors.length === 0) return { systems: [], links: [], empty: true };

  /** canonical object type → the systems that expose it. */
  const canonicalOwners = new Map<string, Set<string>>();

  const systems: MapSystem[] = connectors.map((c) => {
    const resources = graph.nodes.filter((n) => n.kind === "resource" && n.connector === c.connector);
    const operations = graph.nodes.filter((n) => n.kind === "operation" && n.connector === c.connector);

    for (const r of resources) {
      if (!r.canonical) continue;
      const owners = canonicalOwners.get(r.canonical) ?? new Set<string>();
      owners.add(c.connector);
      canonicalOwners.set(r.canonical, owners);
    }

    return {
      id: c.id,
      connector: c.connector,
      name: c.label,
      status: c.status ?? "connected",
      domain: dominantDomain(resources.map((r) => r.domain ?? "generic")),
      objects: resources
        .map((r) => ({ id: r.id, label: r.label, synced_count: r.synced_count ?? null }))
        .sort((a, b) => a.label.localeCompare(b.label)),
      actions: operations
        .map((o) => ({
          id: o.id,
          label: o.label,
          risk: o.risk ?? "read",
          reversible: o.reversible ?? true,
        }))
        .sort((a, b) => a.label.localeCompare(b.label)),
      shares_with: [],
    };
  });

  systems.sort((a, b) => domainRank(a.domain) - domainRank(b.domain) || a.name.localeCompare(b.name));

  /** connector key → the canonical objects it holds. */
  const objectsOf = new Map<string, Set<string>>();
  for (const [canonical, owners] of canonicalOwners) {
    for (const owner of owners) {
      const set = objectsOf.get(owner) ?? new Set<string>();
      set.add(canonical);
      objectsOf.set(owner, set);
    }
  }

  const shared = (a: string, b: string): string[] => {
    const left = objectsOf.get(a);
    const right = objectsOf.get(b);
    if (!left || !right) return [];
    return [...left].filter((o) => right.has(o)).sort();
  };

  // Links follow the reading order: each system links to the NEXT one, and
  // only when they genuinely share something. Every-pair linking is exactly
  // the spiderweb this layout exists to avoid.
  const links: MapLink[] = [];
  for (let i = 0; i < systems.length - 1; i++) {
    const from = systems[i];
    const to = systems[i + 1];
    const objects = shared(from.connector, to.connector);
    if (objects.length === 0) continue;
    links.push({
      from: from.id,
      to: to.id,
      shared: objects,
      label: `${from.name} and ${to.name} both hold ${objects.map((o) => o.replace(/_/g, " ")).join(", ")}`,
    });
  }

  // A system's full set of relationships is still worth knowing when you open
  // it — it just doesn't belong on the map as lines.
  for (const s of systems) {
    s.shares_with = systems
      .filter((other) => other.id !== s.id && shared(s.connector, other.connector).length > 0)
      .map((other) => other.name)
      .sort();
  }

  return { systems, links, empty: false };
}
