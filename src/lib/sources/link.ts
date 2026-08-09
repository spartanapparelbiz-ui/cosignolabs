import { assertPublicUrl, safeFetch, SsrfError } from "../integrations/net/ssrf";
import { detectInjection } from "../agent/untrusted";
import { isProduction } from "../env";

/**
 * Link reading — turns a pasted URL into bounded page context the mission
 * compiler can read. This is the HONEST counterpart to "Add link": we only
 * report `ready` when we actually fetched and read the page. If we couldn't,
 * the status says exactly why (login wall, blocked, unreachable) and NO page
 * text is invented.
 *
 * Safety, by construction:
 *  - the URL is validated by the SSRF module BEFORE any fetch: https only
 *    (http allowed in dev), and localhost / loopback / cloud-metadata /
 *    private IPs / file: URLs / other protocols are refused;
 *  - redirects are disabled (a 3xx fails closed) so a public URL can't bounce
 *    to an internal one;
 *  - the response is size-capped while streaming, so a huge/hostile page
 *    can't exhaust memory;
 *  - extracted text is UNTRUSTED — returned as data with an injection flag,
 *    never as instructions.
 */

const MAX_PAGE_BYTES = 2 * 1024 * 1024; // stop reading a page after 2 MB
const MAX_SUMMARY_CHARS = 20_000;
const FETCH_TIMEOUT_MS = 12_000;

export type LinkStatus =
  | "ready"
  | "login_required"
  | "blocked"
  | "could_not_access";

export interface LinkResult {
  status: LinkStatus;
  /** page <title> (or the host, if none) */
  title: string;
  /** registrable host shown in the chip */
  domain: string;
  /** the validated, canonical URL */
  url: string;
  /** bounded, plain-text page context (empty unless status === "ready") */
  summary: string;
  injection: boolean;
  detail: Record<string, unknown>;
}

/** Validate a pasted URL without fetching. Returns the canonical URL or an error reason. */
export async function validateLinkUrl(
  raw: string
): Promise<{ ok: true; url: URL } | { ok: false; reason: string }> {
  const trimmed = raw.trim();
  if (!trimmed) return { ok: false, reason: "Enter a link first." };
  // Require an explicit scheme so we never guess http for a private host.
  if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed)) {
    return { ok: false, reason: "Add https:// to the front of the link." };
  }
  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    return { ok: false, reason: "That doesn't look like a valid link." };
  }
  if (parsed.protocol === "http:" && isProduction()) {
    return { ok: false, reason: "Links must start with https://." };
  }
  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
    return { ok: false, reason: "Only http and https links can be read." };
  }
  try {
    const safe = await assertPublicUrl(trimmed);
    return { ok: true, url: safe };
  } catch (err) {
    if (err instanceof SsrfError) {
      return { ok: false, reason: "That link points somewhere cosigno can't safely open." };
    }
    return { ok: false, reason: "That link couldn't be checked." };
  }
}

function hostOf(u: URL): string {
  return u.hostname.replace(/^www\./, "");
}

/** Decode a small set of common HTML entities for the title/text. */
function decodeEntities(s: string): string {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/&#(\d+);/g, (_, d) => {
      const code = Number(d);
      return code > 0 && code < 0x110000 ? String.fromCodePoint(code) : "";
    });
}

/** Pull a readable title + visible text out of an HTML document. */
function extractHtml(html: string, fallbackTitle: string): { title: string; text: string } {
  const titleMatch = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(html);
  const ogMatch = /<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)["']/i.exec(html);
  const rawTitle = (titleMatch?.[1] ?? ogMatch?.[1] ?? "").trim();
  const title = rawTitle ? decodeEntities(rawTitle).replace(/\s+/g, " ").slice(0, 280) : fallbackTitle;

  const body = html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, " ")
    .replace(/<!--[\s\S]*?-->/g, " ");
  const text = decodeEntities(body.replace(/<[^>]+>/g, " "))
    // drop C0 control chars except tab/newline/CR, plus DEL
    .replace(/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/g, "")
    .replace(/[ \t]+/g, " ")
    .replace(/\s*\n\s*/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  const bounded = text.length > MAX_SUMMARY_CHARS ? text.slice(0, MAX_SUMMARY_CHARS) + "\n…(truncated)" : text;
  return { title, text: bounded };
}

/** Heuristic: does this page look like a sign-in wall rather than content? */
function looksLikeLogin(title: string, text: string): boolean {
  const hay = `${title}\n${text.slice(0, 400)}`.toLowerCase();
  return /\b(sign in|log in|login|please authenticate|session expired|you must be logged in)\b/.test(hay) &&
    text.length < 800;
}

/** Read the response body up to a byte cap. */
async function readCapped(res: Response): Promise<string> {
  if (!res.body) return await res.text();
  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    if (value) {
      total += value.byteLength;
      chunks.push(value);
      if (total >= MAX_PAGE_BYTES) {
        await reader.cancel().catch(() => {});
        break;
      }
    }
  }
  return Buffer.concat(chunks.map((c) => Buffer.from(c))).toString("utf8");
}

/**
 * Fetch and read a page. The URL MUST already be validated (call
 * validateLinkUrl first). Never throws; failures map to an honest status.
 */
export async function readLink(rawUrl: string): Promise<LinkResult> {
  const base: Omit<LinkResult, "status" | "summary" | "injection" | "detail"> & {
    summary: string;
    injection: boolean;
    detail: Record<string, unknown>;
  } = {
    title: rawUrl,
    domain: rawUrl,
    url: rawUrl,
    summary: "",
    injection: false,
    detail: {},
  };
  let u: URL;
  try {
    u = new URL(rawUrl);
    base.domain = hostOf(u);
    base.title = hostOf(u);
    base.url = u.toString();
  } catch {
    return { ...base, status: "could_not_access", detail: { error: "invalid link." } };
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  let res: Response;
  try {
    res = await safeFetch(u.toString(), {
      signal: controller.signal,
      headers: {
        // A plain, honest UA. We identify as a reader, not a browser we aren't.
        "user-agent": "cosigno-link-reader/1.0 (+https://cosigno.app)",
        accept: "text/html,application/xhtml+xml,text/plain;q=0.9,*/*;q=0.5",
      },
    });
  } catch (err) {
    clearTimeout(timer);
    if (err instanceof SsrfError) {
      return { ...base, status: "blocked", detail: { error: "This link can't be opened safely." } };
    }
    const aborted = err instanceof Error && err.name === "AbortError";
    return {
      ...base,
      status: "could_not_access",
      detail: { error: aborted ? "the page took too long to respond." : "Couldn't reach the page." },
    };
  }
  clearTimeout(timer);

  // Auth walls and blocks are reported honestly, not read.
  if (res.status === 401 || res.status === 403 || res.status === 407) {
    const login = res.status !== 407 && res.status === 401;
    return {
      ...base,
      status: login ? "login_required" : "blocked",
      detail: { httpStatus: res.status, error: login ? "this page needs a sign-in cosigno doesn't have." : "The website blocked automated reading." },
    };
  }
  if (res.status === 429) {
    return { ...base, status: "blocked", detail: { httpStatus: 429, error: "The website is rate-limiting requests." } };
  }
  if (!res.ok) {
    return { ...base, status: "could_not_access", detail: { httpStatus: res.status, error: `the page returned ${res.status}.` } };
  }

  const ctype = (res.headers.get("content-type") ?? "").toLowerCase();
  if (!/text\/html|application\/xhtml|text\/plain/.test(ctype) && ctype !== "") {
    return {
      ...base,
      status: "could_not_access",
      detail: { contentType: ctype, error: "That link isn't a readable web page." },
    };
  }

  let raw: string;
  try {
    raw = await readCapped(res);
  } catch {
    return { ...base, status: "could_not_access", detail: { error: "Couldn't read the page contents." } };
  }

  const isHtml = /text\/html|application\/xhtml/.test(ctype) || /<html|<!doctype/i.test(raw.slice(0, 200));
  const { title, text } = isHtml
    ? extractHtml(raw, hostOf(u))
    : {
        title: hostOf(u),
        text: raw
          .replace(/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/g, "")
          .trim()
          .slice(0, MAX_SUMMARY_CHARS),
      };

  if (looksLikeLogin(title, text)) {
    return {
      ...base,
      title,
      status: "login_required",
      detail: { httpStatus: res.status, error: "This page needs a sign-in cosigno doesn't have." },
    };
  }
  if (!text) {
    return {
      ...base,
      title,
      status: "could_not_access",
      detail: { httpStatus: res.status, error: "The page had no readable text." },
    };
  }

  return {
    status: "ready",
    title,
    domain: hostOf(u),
    url: u.toString(),
    summary: text,
    injection: detectInjection(text),
    detail: { httpStatus: res.status, chars: text.length },
  };
}
