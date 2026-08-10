import type { McpTransport } from "../types";

/**
 * MCP configuration parser — the front door of the new connection model.
 *
 * The primary way to add a connection is to PASTE a configuration, exactly as
 * it appears in a desktop MCP client's settings file, an MCP server's README,
 * or a colleague's snippet. Nobody should have to translate a config into our
 * form fields, so this module accepts every shape those sources produce:
 *
 *   1. a full client config      { "mcpServers": { "github": { … } } }
 *   2. the same under "servers"  { "servers": { "github": { … } } }   (VS Code)
 *   3. a single named entry      { "github": { "command": "npx", … } }
 *   4. a bare server object      { "command": "npx", "args": [ … ] }
 *   5. a bare remote object      { "url": "https://…/mcp" }
 *   6. a plain URL string        https://mcp.example.com/mcp
 *
 * It NEVER throws: a config we can't read comes back as `{ ok: false, error }`
 * in the user's language, because a parser that throws on paste is a parser
 * that shows a stack trace to someone who pasted the wrong half of a file.
 *
 * Security posture: everything here is UNTRUSTED input. Names, commands, args,
 * env keys and header keys are all validated and clamped; values that look
 * like credentials are separated into `secrets` so the caller can encrypt them
 * and so `redact()` can render the config back to the screen without ever
 * echoing a token the user pasted.
 */

const MAX_SERVERS = 20;
const MAX_ARGS = 40;
const MAX_ENV = 40;
const MAX_HEADERS = 20;
const MAX_VALUE = 4096;
const MAX_NAME = 60;

/** Config keys that hold a nested map of servers, in the order we check them. */
const SERVER_MAP_KEYS = ["mcpServers", "servers", "mcp_servers"] as const;

/** Keys that mark an object as a server definition rather than a map of them. */
const SERVER_MARKERS = ["command", "url", "args", "env", "headers", "type", "transport"];

const NAME_RE = /^[a-zA-Z0-9 _.:-]{1,60}$/;
const ENV_KEY_RE = /^[A-Za-z_][A-Za-z0-9_]{0,64}$/;
const HEADER_KEY_RE = /^[a-zA-Z0-9-]{1,64}$/;

/**
 * How a parsed server would actually run.
 *  - "http" / "sse": a REMOTE server we can reach over the network. cosigno
 *    connects to these itself.
 *  - "stdio": a LOCAL process. See the note on `ParsedServer.runnable`.
 */
export type ParsedTransport = McpTransport;

/** A credential lifted out of a pasted config, so it is encrypted not echoed. */
export interface ParsedSecret {
  /** Where it came from: an env var name, or a header name. */
  source: "env" | "header" | "url";
  key: string;
  value: string;
}

export interface ParsedServer {
  /** The name from the config, or a name derived from the URL/command. */
  name: string;
  transport: ParsedTransport;
  /** Remote transports only. */
  url?: string;
  /** stdio only. */
  command?: string;
  args?: string[];
  /** Non-secret env values (stdio). Secret-looking ones move to `secrets`. */
  env?: Record<string, string>;
  /** Non-secret headers (remote). Authorization is lifted into `bearer`. */
  headers?: Record<string, string>;
  /** Extracted from an Authorization: Bearer header, if present. */
  bearer?: string;
  /** Every value we judged to be a credential — encrypt, never display. */
  secrets: ParsedSecret[];
  /**
   * Whether cosigno can run this itself. False for stdio: cosigno is a hosted
   * service, and a local process on your laptop is not reachable from it. We
   * still parse, store and display these — with an honest status — rather than
   * rejecting the paste, because "you pasted a valid config we can't run yet"
   * and "you pasted garbage" are completely different messages.
   */
  runnable: boolean;
  /** Values the config referenced but did not supply, e.g. "${GITHUB_TOKEN}". */
  placeholders: string[];
}

export interface ParseOutcome {
  ok: boolean;
  servers: ParsedServer[];
  /** Non-fatal notes: dropped keys, clamped lists, unrunnable transports. */
  warnings: string[];
  /** Present only when nothing usable could be read. */
  error?: string;
}

/* ------------------------------------------------------------------ helpers */

function str(v: unknown, max = MAX_VALUE): string | undefined {
  if (typeof v !== "string") return undefined;
  const s = v.trim();
  if (!s || s.length > max) return undefined;
  // Control characters in a command, header or env value are never legitimate
  // and are how a pasted config smuggles a second instruction.
  for (const ch of s) if ((ch.codePointAt(0) ?? 0) < 0x20) return undefined;
  return s;
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return Boolean(v) && typeof v === "object" && !Array.isArray(v);
}

/**
 * An unfilled placeholder: "${VAR}", "<your-token>", "YOUR_TOKEN_HERE", "…".
 * These are what a README ships instead of a real credential, and treating one
 * as a token produces a connection that fails at the first call with a
 * confusing 401 instead of a clear "you still need to fill this in".
 */
function isPlaceholder(value: string): boolean {
  const v = value.trim();
  if (/^\$\{[^}]*\}$/.test(v)) return true;
  if (/^<[^>]*>$/.test(v)) return true;
  if (/^(your|my|insert|replace|example|changeme|todo)[-_ ]/i.test(v)) return true;
  if (/^[A-Z_]*(YOUR|HERE|TOKEN_HERE|XXX+|\.\.\.)[A-Z_]*$/.test(v)) return true;
  if (/^[.…]+$/.test(v)) return true;
  return false;
}

/**
 * Does this key hold a credential? Deliberately generous: a value wrongly
 * treated as secret is merely hidden from the screen, while a token wrongly
 * treated as public is printed into a UI and a support screenshot.
 */
const SECRET_KEY_RE =
  /(token|secret|key|password|passwd|pwd|auth|credential|bearer|session|cookie|signature|private)/i;

function looksSecret(key: string, value: string): boolean {
  if (SECRET_KEY_RE.test(key)) return true;
  // Long, high-entropy, no spaces — a credential regardless of its key name.
  return value.length >= 32 && !/\s/.test(value) && /[A-Za-z]/.test(value) && /[0-9_\-.]/.test(value);
}

/** Transport declared by the config, normalized. Absent → inferred later. */
function declaredTransport(raw: unknown): ParsedTransport | undefined {
  const t = str(raw, 32)?.toLowerCase();
  if (!t) return undefined;
  if (t === "stdio" || t === "local" || t === "process") return "stdio";
  if (t === "sse") return "sse";
  if (t === "http" || t === "streamable-http" || t === "streamablehttp" || t === "https") {
    return "http";
  }
  return undefined;
}

/** A readable name from a URL or command, when the config didn't name it. */
function deriveName(server: { url?: string; command?: string; args?: string[] }): string {
  if (server.url) {
    try {
      const host = new URL(server.url).hostname.replace(/^www\./, "");
      return host.split(".")[0] || host;
    } catch {
      /* fall through to the command */
    }
  }
  // "npx -y @modelcontextprotocol/server-github" → "server-github"
  const pkg = (server.args ?? []).find((a) => !a.startsWith("-"));
  if (pkg) return pkg.split("/").pop()?.replace(/^server-/, "") || pkg;
  return server.command ?? "MCP server";
}

/* -------------------------------------------------------------- server parse */

function parseServer(rawName: string | undefined, raw: unknown, warnings: string[]): ParsedServer | null {
  if (!isPlainObject(raw)) return null;

  const secrets: ParsedSecret[] = [];
  const placeholders: string[] = [];

  const url = str(raw.url) ?? str(raw.endpoint) ?? str(raw.href);
  const command = str(raw.command, 512);
  const declared = declaredTransport(raw.type ?? raw.transport);

  // Infer when the config didn't say: a url is remote, a command is local.
  // An explicit stdio type with a url is a contradiction; the url wins,
  // because it is the thing we could actually connect to.
  let transport: ParsedTransport;
  if (url) transport = declared && declared !== "stdio" ? declared : "http";
  else if (command) transport = "stdio";
  else return null;

  if (url && declared === "stdio") {
    warnings.push(`“${rawName ?? deriveName({ url })}” declares stdio but supplies a URL — treating it as a remote server.`);
  }

  /* args (stdio) */
  let args: string[] | undefined;
  if (Array.isArray(raw.args)) {
    if (raw.args.length > MAX_ARGS) {
      warnings.push(`only the first ${MAX_ARGS} arguments were kept.`);
    }
    args = raw.args.slice(0, MAX_ARGS).map((a) => str(a, 1024)).filter((a): a is string => Boolean(a));
  }

  /* env (stdio) — secrets lifted out, placeholders reported */
  let env: Record<string, string> | undefined;
  if (isPlainObject(raw.env)) {
    env = {};
    let n = 0;
    for (const [k, v] of Object.entries(raw.env)) {
      if (n >= MAX_ENV) break;
      if (!ENV_KEY_RE.test(k)) {
        warnings.push(`dropped an environment variable with an unusable name.`);
        continue;
      }
      const value = str(v);
      if (value === undefined) continue;
      n++;
      if (isPlaceholder(value)) {
        placeholders.push(k);
        continue;
      }
      if (looksSecret(k, value)) secrets.push({ source: "env", key: k, value });
      else env[k] = value;
    }
    if (Object.keys(env).length === 0) env = undefined;
  }

  /* headers (remote) — Authorization lifted into bearer */
  let headers: Record<string, string> | undefined;
  let bearer: string | undefined;
  if (isPlainObject(raw.headers)) {
    headers = {};
    let n = 0;
    for (const [k, v] of Object.entries(raw.headers)) {
      if (n >= MAX_HEADERS) break;
      if (!HEADER_KEY_RE.test(k)) {
        warnings.push(`dropped a header with an unusable name.`);
        continue;
      }
      const value = str(v);
      if (value === undefined) continue;
      n++;
      if (isPlaceholder(value)) {
        placeholders.push(k);
        continue;
      }
      if (k.toLowerCase() === "authorization") {
        const m = /^bearer\s+(.+)$/i.exec(value);
        bearer = m ? m[1] : value;
        secrets.push({ source: "header", key: k, value });
        continue;
      }
      if (looksSecret(k, value)) secrets.push({ source: "header", key: k, value });
      else headers[k] = value;
    }
    if (Object.keys(headers).length === 0) headers = undefined;
  }

  // A token on the query string is still a token — never render it back.
  if (url) {
    try {
      const u = new URL(url);
      for (const [k, v] of u.searchParams) {
        if (looksSecret(k, v)) secrets.push({ source: "url", key: k, value: v });
      }
    } catch {
      /* URL validity is checked by the caller, which owns that message */
    }
  }

  const name =
    str(rawName, MAX_NAME) && NAME_RE.test(rawName as string)
      ? (rawName as string)
      : deriveName({ url, command, args });

  return {
    name: name.slice(0, MAX_NAME),
    transport,
    url,
    command,
    args,
    env,
    headers,
    bearer,
    secrets,
    runnable: transport !== "stdio",
    placeholders,
  };
}

/* --------------------------------------------------------------- entrypoint */

/**
 * Parse whatever the user pasted. Accepts JSON in any of the shapes above, or
 * a bare URL. Never throws.
 */
export function parseMcpConfig(input: string): ParseOutcome {
  const warnings: string[] = [];
  const text = input.trim();
  if (!text) return { ok: false, servers: [], warnings, error: "paste a configuration to continue." };

  // 6. a bare URL — the shortest possible config.
  if (!text.startsWith("{") && !text.startsWith("[")) {
    if (/^https?:\/\//i.test(text)) {
      const server = parseServer(undefined, { url: text }, warnings);
      return server
        ? { ok: true, servers: [server], warnings }
        : { ok: false, servers: [], warnings, error: "that URL couldn't be read." };
    }
    return {
      ok: false,
      servers: [],
      warnings,
      error: "that doesn't look like a configuration. paste the JSON block, or just the server's URL.",
    };
  }

  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    return {
      ok: false,
      servers: [],
      warnings,
      // The single most common paste error is grabbing one server's entry
      // including its trailing comma, so name the fix rather than the fault.
      error: "that isn't valid JSON — check for a stray comma or a missing brace.",
    };
  }

  if (!isPlainObject(json)) {
    return { ok: false, servers: [], warnings, error: "a configuration must be a JSON object." };
  }

  // 1–2. a wrapper holding a map of servers.
  for (const wrapper of SERVER_MAP_KEYS) {
    const map = json[wrapper];
    if (isPlainObject(map)) return fromMap(map, warnings);
  }

  // 4–5. a bare server object (it declares command/url/args/…).
  if (SERVER_MARKERS.some((k) => k in json)) {
    const server = parseServer(str(json.name, MAX_NAME), json, warnings);
    return server
      ? { ok: true, servers: [server], warnings }
      : { ok: false, servers: [], warnings, error: "that server entry is missing a url or a command." };
  }

  // 3. a map of named entries with no wrapper.
  return fromMap(json, warnings);
}

function fromMap(map: Record<string, unknown>, warnings: string[]): ParseOutcome {
  const entries = Object.entries(map);
  if (entries.length === 0) {
    return { ok: false, servers: [], warnings, error: "that configuration has no servers in it." };
  }
  if (entries.length > MAX_SERVERS) {
    warnings.push(`only the first ${MAX_SERVERS} servers were read.`);
  }
  const servers: ParsedServer[] = [];
  for (const [name, raw] of entries.slice(0, MAX_SERVERS)) {
    const server = parseServer(name, raw, warnings);
    if (server) servers.push(server);
    else warnings.push(`skipped “${name.slice(0, MAX_NAME)}” — it has no url and no command.`);
  }
  if (servers.length === 0) {
    return {
      ok: false,
      servers: [],
      warnings,
      error: "no server in that configuration had a url or a command.",
    };
  }
  return { ok: true, servers, warnings };
}

/**
 * The config as it is safe to show back to the user: every credential replaced
 * by a marker of the same shape. This is what the review step renders, so a
 * screenshot of the confirm screen can never leak a pasted token.
 */
export function redact(server: ParsedServer): Record<string, unknown> {
  const mask = "••••••••";
  const out: Record<string, unknown> = { name: server.name, transport: server.transport };
  if (server.url) {
    try {
      const u = new URL(server.url);
      for (const [k] of [...u.searchParams]) {
        if (server.secrets.some((s) => s.source === "url" && s.key === k)) u.searchParams.set(k, mask);
      }
      out.url = u.toString();
    } catch {
      out.url = server.url;
    }
  }
  if (server.command) out.command = server.command;
  if (server.args?.length) out.args = server.args;
  if (server.env) out.env = server.env;
  if (server.headers) out.headers = server.headers;
  const hidden = server.secrets.map((s) => s.key);
  if (server.bearer) hidden.push("bearer token");
  if (hidden.length) out.credentials = Object.fromEntries(hidden.map((k) => [k, mask]));
  if (server.placeholders.length) out.needs_values = server.placeholders;
  return out;
}
