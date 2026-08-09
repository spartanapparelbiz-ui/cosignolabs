import { getStore } from "../../store";
import { encryptSecret } from "../crypto";
import { isSensitiveTool } from "./consent";
import { handshakeAndList, McpError, type McpConfig } from "./client";
import { validateTools } from "./validate";
import { assertPublicUrl, SsrfError } from "../net/ssrf";
import { fetchServerIcon } from "./icon";
import type { McpTransport } from "../types";

/**
 * Register (or re-discover) a custom MCP server: validate the input, complete
 * the handshake, discover + VALIDATE the advertised tools, and cache them
 * disabled-by-default. All external output is treated as untrusted; nothing
 * here trusts a tool name/description/schema without clamping it first.
 */

const HEADER_KEY_RE = /^[a-zA-Z0-9-]{1,64}$/;
const MAX_HEADERS = 10;

export interface McpRegisterInput {
  displayName: string;
  url: string;
  transport: McpTransport;
  bearer?: string;
  headers?: Record<string, string>;
}

export interface McpRegisterResult {
  ok: boolean;
  connectionId?: string;
  serverName?: string;
  toolCount?: number;
  rejected?: { name: string; reason: string }[];
  flagged?: string[];
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

function configFrom(input: McpRegisterInput): McpConfig {
  return {
    url: input.url,
    transport: input.transport,
    bearer: input.bearer,
    headers: sanitizeHeaders(input.headers),
  };
}

/** Register a new MCP connection for a user. */
export async function registerMcp(
  userId: string,
  input: McpRegisterInput
): Promise<McpRegisterResult> {
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

  const cfg = configFrom(input);
  let discovered;
  try {
    discovered = await handshakeAndList(cfg, 12_000);
  } catch (err) {
    const kind = err instanceof McpError ? err.kind : "error";
    return {
      ok: false,
      error:
        kind === "auth"
          ? "the server rejected the credentials — check the token."
          : kind === "timeout"
            ? "the server timed out. is the URL correct?"
            : kind === "unreachable"
              ? "couldn't reach that server."
              : "that server didn't speak MCP as expected.",
    };
  }

  const validation = validateTools(discovered.rawTools);
  const tools = validation.tools.map((t) => ({
    ...t,
    sensitive: isSensitiveTool(t),
    enabled: false,
    consented_at: null,
  }));

  // Best-effort, SSRF-safe icon fetch (raster only, re-encoded to a data URI).
  // Never blocks or fails registration; no icon → the UI shows a monogram.
  const icon = await fetchServerIcon(input.url).catch(() => null);

  const store = getStore();
  const connection = await store.createConnection({
    user_id: userId,
    provider_key: "mcp",
    kind: "mcp",
    // A name the user typed wins; otherwise the server's own name for itself
    // beats anything we could infer from a URL. An import deliberately passes
    // an empty string to reach that second case.
    display_name: input.displayName.trim().slice(0, 60) || discovered.serverName?.slice(0, 60) || "custom MCP",
    auth_type: "mcp_remote",
    encrypted_credentials: encryptSecret({ bearer: input.bearer, headers: cfg.headers }),
    scopes: null,
    status: "connected",
    metadata: {
      url: input.url,
      transport: input.transport,
      server_name: discovered.serverName ?? null,
      server_version: discovered.serverVersion ?? null,
      ...(icon ? { icon } : {}),
    },
  });
  await store.saveMcpTools(userId, connection.id, tools);
  await store.logAudit(userId, "integration_connected", { kind: "mcp", url: input.url });

  return {
    ok: true,
    connectionId: connection.id,
    serverName: discovered.serverName,
    toolCount: tools.length,
    rejected: validation.rejected,
    flagged: validation.flagged,
  };
}
