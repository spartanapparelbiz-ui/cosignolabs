import { getStore } from "../../store";
import { logError, newRequestId } from "../../log";
import { decryptSecret } from "../crypto";
import { assertPublicUrl, SsrfError } from "../net/ssrf";
import type {
  ActionResult,
  ApiKeyCredentials,
  ConnectionRecord,
  CustomApiConfig,
} from "../types";

/**
 * Runtime for GENERIC API-KEY connectors — a user-defined tool reached over
 * HTTP with a stored API key. This is untrusted third-party surface, so every
 * guardrail is here and server-side:
 *   - the connection is loaded scoped to the acting user (A can't use B's),
 *   - the final URL (base + path, placeholders filled) is SSRF-checked EACH
 *     call (fresh resolve → DNS-rebinding is caught at call time, not just add),
 *   - the request has a hard timeout AND a response-size cap,
 *   - the API key is injected server-side and never logged or returned,
 *   - the response body is returned as UNTRUSTED data — never instructions,
 *     and it can never move an action to executed on its own (that only happens
 *     through the approval engine, which already cleared this call).
 *
 * Post-approval only: nothing here runs until the signature loop has approved
 * the proposed `connection_call` card.
 */

const CALL_TIMEOUT_MS = 12_000;
const MAX_RESPONSE_BYTES = 256 * 1024; // 256 KB cap on untrusted bodies

function str(v: unknown): string | undefined {
  return typeof v === "string" && v.trim() ? v.trim() : undefined;
}

/** Fill {name} placeholders in a path from args, URL-encoding each value. */
export function fillPath(path: string, args: Record<string, unknown>): string {
  return path.replace(/\{([a-zA-Z0-9_]+)\}/g, (_m, key) => {
    const v = args[key];
    return encodeURIComponent(v == null ? "" : String(v));
  });
}

function readBounded(res: Response): Promise<string> {
  // Cap the body we read so a hostile endpoint can't stream us to death.
  const len = Number(res.headers.get("content-length") ?? "0");
  if (len && len > MAX_RESPONSE_BYTES) {
    return Promise.reject(new Error("response too large"));
  }
  return res.text().then((t) => (t.length > MAX_RESPONSE_BYTES ? t.slice(0, MAX_RESPONSE_BYTES) : t));
}

/** Run one mapped action on a custom API connection. Post-approval only. */
export async function runCustomApiAction(
  userId: string,
  connectionId: string,
  actionId: string,
  args: Record<string, unknown>
): Promise<ActionResult> {
  const store = getStore();
  const c: ConnectionRecord | null = await store.getConnection(userId, connectionId);
  if (!c || c.kind !== "custom") return { ok: false, summary: "connection not found." };
  if (c.status === "revoked") return { ok: false, summary: "this connection was disconnected." };

  const cfg = c.metadata as unknown as CustomApiConfig;
  const action = cfg.actions?.find((a) => a.id === actionId);
  if (!action) return { ok: false, summary: "that action isn't on this connection." };

  // Build the final URL and SSRF-check it FRESH (base_url was checked at add
  // time, but path + a re-resolve here defeats time-of-check/rebinding).
  const base = cfg.base_url.replace(/\/+$/, "");
  const path = fillPath(action.path, args);
  const rawUrl = `${base}${path.startsWith("/") ? "" : "/"}${path}`;

  let url: URL;
  try {
    url = await assertPublicUrl(rawUrl);
  } catch (err) {
    if (err instanceof SsrfError) return { ok: false, summary: "that endpoint isn't allowed." };
    return { ok: false, summary: "couldn't reach that endpoint." };
  }

  // Inject the API key server-side per the connection's auth placement.
  const creds = c.encrypted_credentials
    ? decryptSecret<ApiKeyCredentials>(c.encrypted_credentials)
    : { api_key: "" };
  const headers: Record<string, string> = { accept: "application/json" };
  const placement = cfg.auth?.placement ?? "bearer";
  if (creds.api_key) {
    if (placement === "bearer") headers.authorization = `Bearer ${creds.api_key}`;
    else if (placement === "header") headers[cfg.auth.name || "X-API-Key"] = creds.api_key;
    else if (placement === "query") url.searchParams.set(cfg.auth.name || "api_key", creds.api_key);
  }

  const hasBody = action.method !== "GET" && action.method !== "DELETE";
  const bodyArg = args.body;
  if (hasBody) headers["content-type"] = "application/json";

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), CALL_TIMEOUT_MS);
  try {
    // redirect:"error" — a 3xx to an internal host is the classic SSRF bypass.
    const res = await fetch(url.toString(), {
      method: action.method,
      headers,
      redirect: "error",
      signal: controller.signal,
      ...(hasBody ? { body: JSON.stringify(bodyArg ?? args) } : {}),
    });
    const text = await readBounded(res);
    if (!res.ok) {
      return { ok: false, summary: `${action.summary} — the tool returned ${res.status}.`, detail: { status: res.status, untrusted: true } };
    }
    // The body is UNTRUSTED third-party content — carried as data, never as
    // instructions, and flagged so the UI/planner treat it accordingly.
    return {
      ok: true,
      summary: `${action.summary} — done.`,
      detail: { body: text.slice(0, 4000), untrusted: true },
    };
  } catch (err) {
    // Never log the URL-with-key or the key; correlate by connection id only.
    logError(newRequestId(), err instanceof Error ? new Error(err.name) : err, {
      event: "custom_api_call_failed",
      connectionId: c.id,
      action: actionId,
    });
    return { ok: false, summary: "the tool call didn't go through." };
  } finally {
    clearTimeout(timer);
  }
}
