import type { McpTransport } from "../types";

/**
 * Adding a capability by pasting whatever you already have.
 *
 * Connecting a new tool used to mean knowing a URL, picking a transport from
 * a dropdown, and inventing a display name — three questions before anything
 * happens, two of which the server can answer for itself.
 *
 * People already carry MCP configuration around in a standard JSON shape,
 * copied between clients. This accepts that blob verbatim, a bare URL, or a
 * single server object, and turns any of them into connections.
 *
 * The important honesty case is `command`-style entries. A large share of
 * real-world MCP configs look like {"command": "npx", "args": [...]}, which
 * launches a program on your own machine. A hosted web app cannot run those —
 * there is no machine of yours for it to run on. Pretending otherwise would
 * fail deep in a handshake with something unreadable, so those are identified
 * by name and explained here instead.
 */

export interface ParsedMcpServer {
  /** Name from the config, when it carried one. The server's own name wins later. */
  displayName?: string;
  url: string;
  transport?: McpTransport;
  bearer?: string;
  headers?: Record<string, string>;
}

export interface ParsedMcpPaste {
  servers: ParsedMcpServer[];
  /** Entries recognized but not usable here, each with a plain-English reason. */
  skipped: { name: string; reason: string }[];
}

/** Bounded so a giant paste can't turn into unbounded work. */
const MAX_SERVERS = 20;

const LOCAL_ONLY =
  "this one runs a program on your own computer, which cosigno can't do from the cloud. use its hosted URL if it has one.";

/**
 * Pull a bearer token out of an Authorization header, so a pasted config's
 * credential lands in the encrypted secret field rather than sitting in a
 * plain header. Returns the remaining headers untouched.
 */
function splitAuth(headers: Record<string, string>): {
  bearer?: string;
  headers: Record<string, string>;
} {
  const rest: Record<string, string> = {};
  let bearer: string | undefined;
  for (const [k, v] of Object.entries(headers)) {
    if (k.toLowerCase() === "authorization" && /^bearer\s+/i.test(v)) {
      bearer = v.replace(/^bearer\s+/i, "").trim();
      continue;
    }
    rest[k] = v;
  }
  return { bearer, headers: rest };
}

function asRecord(v: unknown): Record<string, unknown> | null {
  return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
}

function stringMap(v: unknown): Record<string, string> {
  const obj = asRecord(v);
  if (!obj) return {};
  const out: Record<string, string> = {};
  for (const [k, val] of Object.entries(obj)) {
    if (typeof val === "string") out[k] = val;
  }
  return out;
}

/** Interpret one entry of an mcpServers map (or a bare server object). */
function readServer(name: string, raw: unknown): ParsedMcpServer | { skip: string } {
  const obj = asRecord(raw);
  if (!obj) return { skip: "that entry isn't a server definition." };

  const url =
    typeof obj.url === "string" ? obj.url.trim()
    : typeof obj.serverUrl === "string" ? obj.serverUrl.trim()
    : typeof obj.endpoint === "string" ? obj.endpoint.trim()
    : "";

  if (!url) {
    // Command-based servers are the common case here, and deserve the real
    // explanation rather than "invalid entry".
    if (typeof obj.command === "string" || Array.isArray(obj.args)) return { skip: LOCAL_ONLY };
    return { skip: "that entry has no URL." };
  }

  const declared = typeof obj.type === "string" ? obj.type.toLowerCase() : "";
  const transport: McpTransport | undefined =
    declared === "sse" ? "sse" : declared === "http" || declared === "streamable-http" ? "http" : undefined;

  const { bearer, headers } = splitAuth(stringMap(obj.headers));
  return {
    displayName: name || undefined,
    url,
    transport,
    bearer: typeof obj.bearer === "string" && obj.bearer ? obj.bearer : bearer,
    headers,
  };
}

/**
 * Parse a paste into servers to connect. Never throws — unusable input comes
 * back as an empty list, and the caller says so in the user's words.
 */
export function parseMcpPaste(text: string): ParsedMcpPaste {
  const trimmed = (text ?? "").trim();
  if (!trimmed) return { servers: [], skipped: [] };

  // A bare URL is the shortest possible path in, so it is checked first.
  if (!trimmed.startsWith("{") && !trimmed.startsWith("[")) {
    const first = trimmed.split(/\s+/)[0];
    if (/^https?:\/\//i.test(first)) return { servers: [{ url: first }], skipped: [] };
    return { servers: [], skipped: [] };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(trimmed);
  } catch {
    return { servers: [], skipped: [] };
  }

  const servers: ParsedMcpServer[] = [];
  const skipped: { name: string; reason: string }[] = [];

  const take = (name: string, raw: unknown) => {
    if (servers.length >= MAX_SERVERS) return;
    const result = readServer(name, raw);
    if ("skip" in result) skipped.push({ name: name || "server", reason: result.skip });
    else servers.push(result);
  };

  const root = asRecord(parsed);
  if (Array.isArray(parsed)) {
    parsed.forEach((entry, i) => take(asRecord(entry)?.name as string ?? `server ${i + 1}`, entry));
  } else if (root) {
    // The standard shape, and the two wrappers editors commonly add around it.
    const map =
      asRecord(root.mcpServers) ??
      asRecord(root.servers) ??
      asRecord(asRecord(root.mcp)?.servers);
    if (map) {
      for (const [name, entry] of Object.entries(map)) take(name, entry);
    } else {
      take(typeof root.name === "string" ? root.name : "", parsed);
    }
  }

  return { servers, skipped };
}

/**
 * What to tell someone whose paste produced nothing usable. Specific about
 * what IS accepted, because "invalid input" leaves them with no next move.
 */
export const PASTE_HELP =
  "paste a server URL, or the JSON config from another app (the part with \"mcpServers\" in it).";
