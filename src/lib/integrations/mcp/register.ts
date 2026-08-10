import { getStore } from "../../store";
import { encryptSecret } from "../crypto";
import { classifyTool, categoryIsSensitive } from "./classify";
import { handshakeAndList, McpError, type McpConfig } from "./client";
import { validateTools, type DiscoveredTool } from "./validate";
import { assertPublicUrl, SsrfError } from "../net/ssrf";
import { fetchServerIcon } from "./icon";
import type { McpToolRecord, McpTransport } from "../types";
import type { ParsedServer } from "./config";

/**
 * Register (or re-discover) an MCP server: validate the input, complete the
 * handshake, discover + VALIDATE the advertised tools, CLASSIFY each one, and
 * cache them disabled-by-default. All external output is treated as untrusted;
 * nothing here trusts a tool name/description/schema without clamping it first.
 *
 * Two shapes of server arrive here:
 *
 *   remote (http/sse) — cosigno connects, handshakes, and discovers tools now.
 *   local  (stdio)    — cosigno cannot reach a process on someone else's
 *                       machine. The configuration is stored so it is not lost
 *                       and the connection is marked `pending`, with no tools
 *                       and no pretence of a handshake. When the local bridge
 *                       ships, these become discoverable without the user
 *                       re-entering anything.
 */

const HEADER_KEY_RE = /^[a-zA-Z0-9-]{1,64}$/;
const MAX_HEADERS = 10;

export interface McpRegisterInput {
  displayName: string;
  transport: McpTransport;
  /** Remote transports. */
  url?: string;
  bearer?: string;
  headers?: Record<string, string>;
  /** stdio only — stored, not executed. */
  command?: string;
  args?: string[];
  /** Non-secret env values (stdio). Secret ones belong in `secretEnv`. */
  env?: Record<string, string>;
  /** stdio env values judged to be credentials — encrypted with the rest. */
  secretEnv?: Record<string, string>;
  /** Where this came from, for the connection card. */
  catalogId?: string;
}

export interface McpRegisterResult {
  ok: boolean;
  connectionId?: string;
  serverName?: string;
  toolCount?: number;
  /** Tools the classifier wasn't confident about — the UI asks about these. */
  needsReview?: string[];
  rejected?: { name: string; reason: string }[];
  flagged?: string[];
  /** True when the connection was stored but not contacted (stdio). */
  pending?: boolean;
  error?: string;
}

/** Only https is allowed for remote; http is tolerated for localhost dev. */
export function validateMcpUrl(raw: string): { ok: boolean; url?: URL; reason?: string } {
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    return { ok: false, reason: "that isn't a valid URL." };
  }
  if (u.protocol !== "https:" && u.protocol !== "http:") {
    return { ok: false, reason: "the URL must start with https://" };
  }
  if (u.protocol === "http:" && !/^(localhost|127\.0\.0\.1|\[::1\])$/.test(u.hostname)) {
    return { ok: false, reason: "use https:// for a remote server." };
  }
  return { ok: true, url: u };
}

/** A string is safe to send as a header value if it has no control chars. */
function noControlChars(v: string): boolean {
  for (const ch of v) if ((ch.codePointAt(0) ?? 0) < 0x20) return false;
  return true;
}

/** Keep only well-formed custom headers (bounded count, safe key/value). */
export function sanitizeHeaders(headers?: Record<string, string>): Record<string, string> {
  const out: Record<string, string> = {};
  if (!headers) return out;
  let n = 0;
  for (const [k, v] of Object.entries(headers)) {
    if (n >= MAX_HEADERS) break;
    if (!HEADER_KEY_RE.test(k)) continue;
    if (typeof v !== "string" || v.length > 2048 || !noControlChars(v)) continue;
    out[k] = v;
    n++;
  }
  return out;
}

/** Turn a parsed pasted config into the shape this module registers. */
export function fromParsed(server: ParsedServer, displayName?: string): McpRegisterInput {
  const secretEnv: Record<string, string> = {};
  const headers = { ...(server.headers ?? {}) };
  for (const s of server.secrets) {
    if (s.source === "env") secretEnv[s.key] = s.value;
    else if (s.source === "header" && s.key.toLowerCase() !== "authorization") {
      headers[s.key] = s.value;
    }
  }
  return {
    displayName: displayName?.trim() || server.name,
    transport: server.transport,
    url: server.url,
    bearer: server.bearer,
    headers,
    command: server.command,
    args: server.args,
    env: server.env,
    secretEnv: Object.keys(secretEnv).length ? secretEnv : undefined,
  };
}

/** The tool rows a discovery produces, already classified. */
function classifyAll(
  tools: DiscoveredTool[]
): { rows: Omit<McpToolRecord, "connection_id">[]; needsReview: string[] } {
  const needsReview: string[] = [];
  const rows = tools.map((t) => {
    const verdict = classifyTool(t);
    if (verdict.needsReview) needsReview.push(t.name);
    return {
      ...t,
      category: verdict.category,
      confidence: verdict.confidence,
      classified_by: "auto" as const,
      sensitive: categoryIsSensitive(verdict.category, verdict.needsReview),
      enabled: false,
      consented_at: null,
    };
  });
  return { rows, needsReview };
}

/** Discover + classify against a live remote server. Exported for re-discovery. */
export async function discoverAndClassify(
  cfg: McpConfig,
  timeoutMs = 12_000
): Promise<{
  serverName?: string;
  serverVersion?: string;
  rows: Omit<McpToolRecord, "connection_id">[];
  needsReview: string[];
  rejected: { name: string; reason: string }[];
  flagged: string[];
}> {
  const discovered = await handshakeAndList(cfg, timeoutMs);
  const validation = validateTools(discovered.rawTools);
  const { rows, needsReview } = classifyAll(validation.tools);
  return {
    serverName: discovered.serverName,
    serverVersion: discovered.serverVersion,
    rows,
    needsReview,
    rejected: validation.rejected,
    flagged: validation.flagged,
  };
}

/** A handshake failure, in the user's language. Never leaks server internals. */
export function handshakeMessage(err: unknown): string {
  const kind = err instanceof McpError ? err.kind : "error";
  switch (kind) {
    case "auth":
      return "the server rejected the credentials — check the token.";
    case "timeout":
      return "the server timed out. is the URL correct?";
    case "unreachable":
      return "couldn't reach that server.";
    default:
      return "that server didn't speak MCP as expected.";
  }
}

/** Register a new MCP connection for a user. */
export async function registerMcp(
  userId: string,
  input: McpRegisterInput
): Promise<McpRegisterResult> {
  const store = getStore();
  const displayName = input.displayName.slice(0, 60) || "MCP server";

  /* ---------------------------------------------------------- local (stdio) */
  if (input.transport === "stdio") {
    if (!input.command) {
      return { ok: false, error: "a local server needs a command to run." };
    }
    const connection = await store.createConnection({
      user_id: userId,
      provider_key: "mcp",
      kind: "mcp",
      display_name: displayName,
      auth_type: "mcp_local",
      encrypted_credentials: encryptSecret({ env: input.secretEnv ?? {} }),
      scopes: null,
      // Correct configuration, not yet reachable — see ConnectionStatus.
      status: "pending",
      metadata: {
        transport: "stdio",
        command: input.command,
        args: input.args ?? [],
        env: input.env ?? {},
        ...(input.catalogId ? { catalog_id: input.catalogId } : {}),
        pending_reason: "local_process",
      },
    });
    await store.logAudit(userId, "integration_connected", {
      kind: "mcp",
      transport: "stdio",
      pending: true,
    });
    return { ok: true, connectionId: connection.id, toolCount: 0, pending: true };
  }

  /* --------------------------------------------------------------- remote */
  if (!input.url) return { ok: false, error: "a remote server needs a URL." };

  const urlCheck = validateMcpUrl(input.url);
  if (!urlCheck.ok) return { ok: false, error: urlCheck.reason };

  // SSRF: reject before we ever open a socket if the host resolves internally.
  try {
    await assertPublicUrl(input.url);
  } catch (err) {
    if (err instanceof SsrfError) {
      return { ok: false, error: "that address isn't allowed (internal/private hosts are blocked)." };
    }
    return { ok: false, error: "couldn't validate that URL." };
  }

  const cfg: McpConfig = {
    url: input.url,
    transport: input.transport,
    bearer: input.bearer,
    headers: sanitizeHeaders(input.headers),
  };

  let discovered;
  try {
    discovered = await discoverAndClassify(cfg, 12_000);
  } catch (err) {
    return { ok: false, error: handshakeMessage(err) };
  }

  // Best-effort, SSRF-safe icon fetch (raster only, re-encoded to a data URI).
  // Never blocks or fails registration; no icon → the UI shows a monogram.
  const icon = await fetchServerIcon(input.url).catch(() => null);

  const connection = await store.createConnection({
    user_id: userId,
    provider_key: "mcp",
    kind: "mcp",
    display_name: displayName || discovered.serverName || "MCP server",
    auth_type: "mcp_remote",
    encrypted_credentials: encryptSecret({ bearer: input.bearer, headers: cfg.headers }),
    scopes: null,
    status: "connected",
    metadata: {
      url: input.url,
      transport: input.transport,
      server_name: discovered.serverName ?? null,
      server_version: discovered.serverVersion ?? null,
      ...(input.catalogId ? { catalog_id: input.catalogId } : {}),
      ...(icon ? { icon } : {}),
    },
  });
  await store.saveMcpTools(userId, connection.id, discovered.rows);
  await store.logAudit(userId, "integration_connected", { kind: "mcp", url: input.url });

  return {
    ok: true,
    connectionId: connection.id,
    serverName: discovered.serverName,
    toolCount: discovered.rows.length,
    needsReview: discovered.needsReview,
    rejected: discovered.rejected,
    flagged: discovered.flagged,
  };
}
