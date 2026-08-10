import type { McpTransport } from "../types";
import { safeFetch, SsrfError } from "../net/ssrf";

/**
 * A compact client for REMOTE MCP servers (Streamable HTTP + SSE) — no SDK,
 * no persistent process, serverless-safe. It speaks JSON-RPC 2.0 over a single
 * HTTP endpoint: initialize → notifications/initialized → tools/list /
 * tools/call. Responses may come back as application/json OR as an SSE stream
 * (text/event-stream); both are handled. A server-issued Mcp-Session-Id is
 * carried across the calls of one operation.
 *
 * Every call is time-bounded, the response size is capped, and failures are
 * mapped to a typed McpError so routes can show a specific, non-leaky status.
 * Nothing here trusts the server's payload beyond parsing it — validation of
 * advertised tools happens in ./validate.
 */

const PROTOCOL_VERSION = "2025-06-18";
const DEFAULT_TIMEOUT = 12_000;
const MAX_BODY = 1024 * 1024; // 1 MB ceiling on any single response

export type McpErrorKind =
  | "unreachable"
  | "timeout"
  | "auth"
  | "protocol"
  | "server_error";

export class McpError extends Error {
  constructor(
    public kind: McpErrorKind,
    message: string
  ) {
    super(message);
    this.name = "McpError";
  }
}

export interface McpConfig {
  url: string;
  transport: McpTransport;
  bearer?: string;
  headers?: Record<string, string>;
}

/**
 * This client speaks HTTP. A "stdio" server is a process on the user's own
 * machine, which a hosted deployment has no route to — so it is refused HERE,
 * once, rather than in each of the four call sites that would otherwise try to
 * fetch an empty URL and report a confusing network error.
 */
export function assertRemote(cfg: McpConfig): void {
  if (cfg.transport === "stdio") {
    throw new McpError(
      "unreachable",
      "this server runs as a local process — cosigno can't reach it from the cloud"
    );
  }
  if (!cfg.url) throw new McpError("unreachable", "this connection has no server URL");
}

interface JsonRpcResponse {
  jsonrpc: "2.0";
  id: number | string;
  result?: unknown;
  error?: { code: number; message: string };
}

function authHeaders(cfg: McpConfig): Record<string, string> {
  const h: Record<string, string> = {};
  if (cfg.bearer) h.authorization = `Bearer ${cfg.bearer}`;
  // Extra static headers, already validated as safe key/value pairs upstream.
  for (const [k, v] of Object.entries(cfg.headers ?? {})) {
    if (k.toLowerCase() === "authorization" && cfg.bearer) continue;
    h[k] = v;
  }
  return h;
}

/** Pull the first JSON-RPC message out of an SSE stream body. */
function parseSse(body: string): unknown {
  let jsonLine = "";
  for (const line of body.split(/\r?\n/)) {
    if (line.startsWith("data:")) jsonLine += line.slice(5).trim();
  }
  if (!jsonLine) throw new McpError("protocol", "empty SSE response");
  return JSON.parse(jsonLine);
}

let rpcId = 0;

async function rpc(
  cfg: McpConfig,
  method: string,
  params: Record<string, unknown>,
  sessionId: string | undefined,
  timeoutMs: number
): Promise<{ result: unknown; sessionId?: string }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const id = ++rpcId;
  try {
    // safeFetch enforces SSRF protection (public host only) and DISABLES
    // redirects — a 3xx to an internal address is the classic bypass.
    const res = await safeFetch(cfg.url, {
      method: "POST",
      signal: controller.signal,
      headers: {
        "content-type": "application/json",
        accept: "application/json, text/event-stream",
        "mcp-protocol-version": PROTOCOL_VERSION,
        ...(sessionId ? { "mcp-session-id": sessionId } : {}),
        ...authHeaders(cfg),
      },
      body: JSON.stringify({ jsonrpc: "2.0", id, method, params }),
    });

    const newSession = res.headers.get("mcp-session-id") ?? sessionId;

    if (res.status === 401 || res.status === 403) {
      throw new McpError("auth", "the MCP server rejected the credentials");
    }
    if (res.status >= 500) {
      throw new McpError("server_error", `server responded ${res.status}`);
    }
    if (!res.ok) {
      throw new McpError("protocol", `server responded ${res.status}`);
    }

    const raw = (await res.text()).slice(0, MAX_BODY);
    const ct = res.headers.get("content-type") ?? "";
    let msg: JsonRpcResponse;
    try {
      msg = (ct.includes("text/event-stream") ? parseSse(raw) : JSON.parse(raw)) as JsonRpcResponse;
    } catch (e) {
      if (e instanceof McpError) throw e;
      throw new McpError("protocol", "could not parse the server response");
    }
    if (msg.error) {
      throw new McpError("server_error", `mcp error ${msg.error.code}`);
    }
    return { result: msg.result, sessionId: newSession ?? undefined };
  } catch (err) {
    if (err instanceof McpError) throw err;
    if (err instanceof SsrfError) throw new McpError("protocol", err.message);
    if (err instanceof Error && err.name === "AbortError") {
      throw new McpError("timeout", "the MCP server timed out");
    }
    throw new McpError("unreachable", "could not reach the MCP server");
  } finally {
    clearTimeout(timer);
  }
}

/** Fire-and-forget notification (no id, no response expected). */
async function notify(cfg: McpConfig, method: string, sessionId?: string): Promise<void> {
  await safeFetch(cfg.url, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      accept: "application/json, text/event-stream",
      "mcp-protocol-version": PROTOCOL_VERSION,
      ...(sessionId ? { "mcp-session-id": sessionId } : {}),
      ...authHeaders(cfg),
    },
    body: JSON.stringify({ jsonrpc: "2.0", method, params: {} }),
  }).catch(() => undefined); // notifications are best-effort
}

export interface HandshakeResult {
  serverName?: string;
  serverVersion?: string;
  /** Raw advertised tools — MUST go through ./validate before use. */
  rawTools: unknown;
  sessionId?: string;
}

/** Connect, complete the MCP handshake, and list the advertised tools. */
export async function handshakeAndList(
  cfg: McpConfig,
  timeoutMs = DEFAULT_TIMEOUT
): Promise<HandshakeResult> {
  assertRemote(cfg);
  const init = await rpc(
    cfg,
    "initialize",
    {
      protocolVersion: PROTOCOL_VERSION,
      capabilities: {},
      clientInfo: { name: "cosigno", version: "1.0" },
    },
    undefined,
    timeoutMs
  );
  const info = (init.result as { serverInfo?: { name?: string; version?: string } })?.serverInfo;
  await notify(cfg, "notifications/initialized", init.sessionId);

  const listed = await rpc(cfg, "tools/list", {}, init.sessionId, timeoutMs);
  const rawTools = (listed.result as { tools?: unknown })?.tools ?? [];
  return {
    serverName: info?.name,
    serverVersion: info?.version,
    rawTools,
    sessionId: listed.sessionId,
  };
}

export interface McpCallResult {
  ok: boolean;
  /** Concatenated text content blocks (already treated as untrusted output). */
  text: string;
  isError: boolean;
}

/** Call one tool. Only ever invoked after server-side approval + consent. */
export async function callTool(
  cfg: McpConfig,
  name: string,
  args: Record<string, unknown>,
  timeoutMs = DEFAULT_TIMEOUT
): Promise<McpCallResult> {
  assertRemote(cfg);
  // A fresh session per operation keeps stateless serverless calls simple.
  const init = await rpc(
    cfg,
    "initialize",
    {
      protocolVersion: PROTOCOL_VERSION,
      capabilities: {},
      clientInfo: { name: "cosigno", version: "1.0" },
    },
    undefined,
    timeoutMs
  );
  await notify(cfg, "notifications/initialized", init.sessionId);

  const called = await rpc(
    cfg,
    "tools/call",
    { name, arguments: args ?? {} },
    init.sessionId,
    timeoutMs
  );
  const result = (called.result ?? {}) as {
    content?: Array<{ type?: string; text?: string }>;
    isError?: boolean;
  };
  const text = (result.content ?? [])
    .filter((c) => c.type === "text" && typeof c.text === "string")
    .map((c) => c.text as string)
    .join("\n")
    .slice(0, 8000);
  return { ok: !result.isError, text, isError: Boolean(result.isError) };
}
