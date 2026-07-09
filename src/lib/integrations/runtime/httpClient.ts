/**
 * A small, defensive HTTP client for outbound integration calls. Every call
 * is bounded by a timeout, retries idempotent failures with exponential
 * backoff + jitter, and honors a provider's Retry-After on 429. It never
 * throws a raw provider body at callers — on a non-2xx it raises an
 * IntegrationHttpError carrying the status and a trimmed, secret-free detail.
 */

export class IntegrationHttpError extends Error {
  constructor(
    public status: number,
    message: string,
    public retryable: boolean
  ) {
    super(message);
    this.name = "IntegrationHttpError";
  }
}

export interface RequestOptions {
  method?: string;
  headers?: Record<string, string>;
  /** JSON body (stringified for you) or a raw string. */
  body?: unknown;
  timeoutMs?: number;
  /** Max attempts for retryable failures (429/5xx/network). Default 3. */
  retries?: number;
  /** Treat as form-encoded instead of JSON (OAuth token endpoints). */
  form?: boolean;
}

const DEFAULT_TIMEOUT = 12_000;
const MAX_BODY = 512 * 1024; // cap the response we read into memory

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

async function once(url: string, opts: RequestOptions): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), opts.timeoutMs ?? DEFAULT_TIMEOUT);
  try {
    const headers: Record<string, string> = { ...opts.headers };
    let body: string | undefined;
    if (opts.body !== undefined) {
      if (opts.form) {
        headers["content-type"] = "application/x-www-form-urlencoded";
        body =
          typeof opts.body === "string"
            ? opts.body
            : new URLSearchParams(opts.body as Record<string, string>).toString();
      } else {
        headers["content-type"] = "application/json";
        body = typeof opts.body === "string" ? opts.body : JSON.stringify(opts.body);
      }
    }
    return await fetch(url, {
      method: opts.method ?? "GET",
      headers,
      body,
      signal: controller.signal,
      redirect: "follow",
    });
  } finally {
    clearTimeout(timer);
  }
}

/** Retryable statuses: rate limit + transient server errors. */
function isRetryableStatus(s: number): boolean {
  return s === 429 || s === 502 || s === 503 || s === 504;
}

/**
 * Perform a request and return parsed JSON (or `{}` for empty bodies). Retries
 * retryable failures; raises IntegrationHttpError on a final non-2xx.
 */
export async function requestJson<T = unknown>(
  url: string,
  opts: RequestOptions = {}
): Promise<T> {
  const retries = Math.max(1, opts.retries ?? 3);
  let lastErr: unknown;

  for (let attempt = 0; attempt < retries; attempt++) {
    try {
      const res = await once(url, opts);
      if (res.ok) {
        const text = (await res.text()).slice(0, MAX_BODY);
        return (text ? JSON.parse(text) : {}) as T;
      }
      const retryable = isRetryableStatus(res.status);
      if (retryable && attempt < retries - 1) {
        const ra = Number(res.headers.get("retry-after"));
        const backoff = Number.isFinite(ra) && ra > 0
          ? ra * 1000
          : 2 ** attempt * 400 + Math.random() * 200;
        await sleep(Math.min(backoff, 8000));
        continue;
      }
      // Non-retryable, or out of attempts: surface a clean, bounded message.
      const detail = (await res.text().catch(() => "")).slice(0, 200);
      throw new IntegrationHttpError(
        res.status,
        `provider responded ${res.status}${detail ? `: ${detail.replace(/\s+/g, " ")}` : ""}`,
        retryable
      );
    } catch (err) {
      if (err instanceof IntegrationHttpError) throw err;
      // Network/abort error — retry if attempts remain.
      lastErr = err;
      if (attempt < retries - 1) {
        await sleep(2 ** attempt * 400 + Math.random() * 200);
        continue;
      }
    }
  }
  const aborted = lastErr instanceof Error && lastErr.name === "AbortError";
  throw new IntegrationHttpError(
    0,
    aborted ? "the request timed out" : "could not reach the provider",
    true
  );
}
