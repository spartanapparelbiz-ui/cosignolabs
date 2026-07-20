import { customActionRisk } from "./tiers";
import type { CapabilityRisk } from "./types";

/**
 * OpenAPI / Swagger import — deterministic. Given a parsed spec object, detect
 * the operations it exposes and turn each into a proposed custom-API action
 * with a SERVER-recommended risk class (GET→read, writes→write, DELETE→
 * destructive). No model call, no network, no secrets — this only reads the
 * document. The user reviews every detected action, supplies the credential,
 * and the vetted /api/connections/custom path does the real (SSRF-checked,
 * encrypted, re-tiered) creation. Nothing here can execute anything.
 */

export interface DetectedAction {
  id: string;
  summary: string;
  method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  path: string;
  risk: CapabilityRisk;
}

export interface DetectedApi {
  title: string;
  base_url: string;
  actions: DetectedAction[];
  /** Anything we skipped or couldn't read cleanly, surfaced honestly. */
  notes: string[];
}

const METHODS = ["get", "post", "put", "patch", "delete"] as const;

function slug(s: string): string {
  return s
    // Split camelCase / PascalCase so "listCustomers" → "list_customers" and
    // the risk heuristic can see the leading verb ("list").
    .replace(/([a-z0-9])([A-Z])/g, "$1_$2")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 60);
}

/** Resolve the base URL for OpenAPI 3 (servers) or Swagger 2 (host+basePath). */
function resolveBaseUrl(spec: Record<string, unknown>): string {
  const servers = spec.servers as { url?: string }[] | undefined;
  if (Array.isArray(servers) && servers[0]?.url) return String(servers[0].url).replace(/\/+$/, "");
  const host = typeof spec.host === "string" ? spec.host : "";
  if (host) {
    const scheme = Array.isArray(spec.schemes) && spec.schemes[0] ? String(spec.schemes[0]) : "https";
    const basePath = typeof spec.basePath === "string" ? spec.basePath : "";
    return `${scheme}://${host}${basePath}`.replace(/\/+$/, "");
  }
  return "";
}

/**
 * Parse a spec object into detected actions. Robust to partial/odd specs: it
 * skips anything it can't read and records why in `notes` instead of throwing.
 */
export function parseOpenApi(spec: unknown): DetectedApi {
  const notes: string[] = [];
  if (!spec || typeof spec !== "object") {
    return { title: "", base_url: "", actions: [], notes: ["not a valid OpenAPI document."] };
  }
  const doc = spec as Record<string, unknown>;
  const info = (doc.info ?? {}) as { title?: string };
  const title = typeof info.title === "string" && info.title.trim() ? info.title.trim() : "Imported API";
  const base_url = resolveBaseUrl(doc);
  if (!base_url) notes.push("no server URL found in the spec — you'll need to enter the base URL.");

  const paths = doc.paths as Record<string, Record<string, unknown>> | undefined;
  if (!paths || typeof paths !== "object") {
    return { title, base_url, actions: [], notes: [...notes, "the spec declared no paths."] };
  }

  const seen = new Set<string>();
  const actions: DetectedAction[] = [];
  for (const [path, item] of Object.entries(paths)) {
    if (!item || typeof item !== "object") continue;
    for (const method of METHODS) {
      const op = (item as Record<string, unknown>)[method] as
        | { operationId?: string; summary?: string; description?: string }
        | undefined;
      if (!op || typeof op !== "object") continue;

      const base = op.operationId ? slug(op.operationId) : slug(`${method}_${path}`);
      // Reserve room for a numeric suffix so de-duplication can't produce a
      // string that slices back to `base` and loops forever.
      const stem = (base || slug(`${method}_op`) || "op").slice(0, 52);
      let id = stem;
      let n = 2;
      while (seen.has(id)) id = `${stem}_${n++}`;
      seen.add(id);

      const summary =
        (op.summary && op.summary.trim()) ||
        (op.description && op.description.trim().split("\n")[0]) ||
        `${method.toUpperCase()} ${path}`;

      actions.push({
        id,
        summary: summary.slice(0, 160),
        method: method.toUpperCase() as DetectedAction["method"],
        path,
        // The SAME safe-default tiering the manual builder uses.
        risk: customActionRisk(id, method),
      });
    }
  }

  if (actions.length === 0) notes.push("no operations were detected in the spec.");
  return { title, base_url, actions, notes };
}

/** Parse a JSON string into a spec object, tolerantly. */
export function parseOpenApiText(text: string): DetectedApi {
  let doc: unknown;
  try {
    doc = JSON.parse(text);
  } catch {
    return {
      title: "",
      base_url: "",
      actions: [],
      notes: ["couldn't parse that as JSON. paste the OpenAPI document as JSON (YAML isn't supported here)."],
    };
  }
  return parseOpenApi(doc);
}
