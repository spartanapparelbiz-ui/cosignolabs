import { randomUUID } from "crypto";
import { assertPublicUrl, SsrfError } from "../integrations/net/ssrf";
import { isAllowedSource } from "./sources";
import { logError, logInfo, newRequestId } from "../log";
import type {
  BrowserActionInput,
  BrowserActionOutcome,
  BrowserProvider,
  BrowserSessionHandle,
  PageObservation,
} from "./provider";

/**
 * The real remote browser provider. Chromium never runs inside the serverless
 * app — an external rendering service (any Browserless-v2-compatible HTTP API)
 * does the driving:
 *
 *   POST {BROWSER_PROVIDER_URL}/content?token={BROWSER_PROVIDER_KEY}
 *     { url } → rendered HTML
 *   POST {BROWSER_PROVIDER_URL}/screenshot?token={BROWSER_PROVIDER_KEY}
 *     { url, options } → JPEG bytes
 *
 * The service is stateless per request; COSIGNO's database is the durable
 * session state (current URL, page title, findings), which is exactly what
 * lets the browser "session" survive separate serverless requests. The
 * providerRef is our own continuity token, never a credential.
 *
 * Safety, by construction:
 *  - every TARGET url passes the SSRF gate before we even ask the service to
 *    open it (localhost, private ranges, metadata, non-http(s) → refused);
 *  - mission navigation additionally requires an allowed research source;
 *  - page HTML is reduced to a bounded, structured observation — never raw,
 *    unbounded markup — and is always treated as untrusted data;
 *  - this provider performs READ-ONLY work: it renders and captures. It has
 *    no form-submission path at all, so nothing consequential can run here.
 */

const FETCH_TIMEOUT_MS = 25_000;
const MAX_HTML_BYTES = 3 * 1024 * 1024; // stop reading a page after 3 MB
const MAX_SUMMARY_CHARS = 6_000;
const MAX_LINKS = 40;
const MAX_SCREENSHOT_BYTES = 350 * 1024; // ~350 KB JPEG, stored as a data URI

export class BrowserBlockedError extends Error {
  constructor(public site: string) {
    super(`the website blocked automated access.`);
  }
}

function base(): string {
  return (process.env.BROWSER_PROVIDER_URL ?? "").trim().replace(/\/+$/, "");
}
function token(): string {
  return (process.env.BROWSER_PROVIDER_KEY ?? "").trim();
}

/** Decode a small set of common HTML entities. */
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

function stripTags(html: string): string {
  return decodeEntities(
    html
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<noscript[\s\S]*?<\/noscript>/gi, " ")
      .replace(/<!--[\s\S]*?-->/g, " ")
      .replace(/<[^>]+>/g, " ")
  )
    .replace(/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/g, "")
    .replace(/[ \t]+/g, " ")
    .replace(/\s*\n\s*/g, "\n")
    .trim();
}

/** Pull bounded structure out of rendered HTML — never return raw markup. */
export function observationFromHtml(url: string, html: string): PageObservation {
  const titleMatch = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(html);
  const title = titleMatch ? decodeEntities(titleMatch[1]).replace(/\s+/g, " ").trim().slice(0, 300) : url;

  const headings: string[] = [];
  const hRe = /<h([1-3])[^>]*>([\s\S]*?)<\/h\1>/gi;
  let m: RegExpExecArray | null;
  while ((m = hRe.exec(html)) && headings.length < 20) {
    const t = stripTags(m[2]).slice(0, 160);
    if (t) headings.push(t);
  }

  const links: { text: string; href: string }[] = [];
  const aRe = /<a\b[^>]*href=["']([^"'#]+)["'][^>]*>([\s\S]*?)<\/a>/gi;
  while ((m = aRe.exec(html)) && links.length < MAX_LINKS) {
    const text = stripTags(m[2]).replace(/\s+/g, " ").trim().slice(0, 140);
    let href = m[1].trim();
    if (!text || href.startsWith("javascript:") || href.startsWith("data:")) continue;
    try {
      href = new URL(href, url).toString();
    } catch {
      continue;
    }
    links.push({ text, href });
  }

  const buttons: string[] = [];
  const bRe = /<button\b[^>]*>([\s\S]*?)<\/button>/gi;
  while ((m = bRe.exec(html)) && buttons.length < 15) {
    const t = stripTags(m[1]).replace(/\s+/g, " ").trim().slice(0, 80);
    if (t) buttons.push(t);
  }

  const tables: { caption?: string; rows: string[][] }[] = [];
  const tRe = /<table[\s\S]*?<\/table>/gi;
  let tm: RegExpExecArray | null;
  while ((tm = tRe.exec(html)) && tables.length < 6) {
    const rows: string[][] = [];
    const trRe = /<tr[\s\S]*?<\/tr>/gi;
    let tr: RegExpExecArray | null;
    while ((tr = trRe.exec(tm[0])) && rows.length < 40) {
      const cells: string[] = [];
      const cRe = /<t[hd][^>]*>([\s\S]*?)<\/t[hd]>/gi;
      let c: RegExpExecArray | null;
      while ((c = cRe.exec(tr[0])) && cells.length < 8) {
        cells.push(stripTags(c[1]).replace(/\s+/g, " ").trim().slice(0, 200));
      }
      if (cells.some(Boolean)) rows.push(cells);
    }
    if (rows.length > 0) tables.push({ rows });
  }

  const text = stripTags(html);
  const summary = text.length > MAX_SUMMARY_CHARS ? text.slice(0, MAX_SUMMARY_CHARS) + "…" : text;

  const low = `${title}\n${summary.slice(0, 1200)}`.toLowerCase();
  const loginRequired =
    /\b(sign in|log in|login) (to|required|to continue)\b/.test(low) && summary.length < 1500;
  const warnings: string[] = [];
  if (/\b(access denied|are you a robot|captcha|unusual traffic|verify you are human|pardon our interruption)\b/.test(low)) {
    warnings.push("this page appears to block automated reading.");
  }

  return {
    url,
    title,
    summary,
    headings,
    links,
    buttons,
    formFields: [], // read-only MVP: forms are never inspected for filling
    tables,
    downloads: [],
    warnings,
    loginRequired,
    simulated: false,
  };
}

/** True when an observation looks like a bot-block rather than content. */
export function looksBlocked(obs: PageObservation): boolean {
  return obs.warnings.some((w) => w.includes("block")) || false;
}

async function readCapped(res: Response, cap: number): Promise<Buffer> {
  if (!res.body) return Buffer.from(await res.arrayBuffer());
  const reader = res.body.getReader();
  const chunks: Buffer[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    if (value) {
      total += value.byteLength;
      chunks.push(Buffer.from(value));
      if (total >= cap) {
        await reader.cancel().catch(() => {});
        break;
      }
    }
  }
  return Buffer.concat(chunks);
}

/** Validate a target before ever asking the remote service to open it. */
async function assertNavigable(target: string): Promise<URL> {
  const u = await assertPublicUrl(target); // SSRF gate: scheme, private IPs, metadata
  if (!isAllowedSource(u.toString())) {
    throw new SsrfError("that website isn't on this mission's allowed source list.");
  }
  return u;
}

export class RemoteBrowserProvider implements BrowserProvider {
  key = "remote";
  readonly simulated = false;

  isConfigured(): boolean {
    return Boolean(base() && token());
  }

  async createSession(args: { objective: string }): Promise<BrowserSessionHandle> {
    // The rendering service is stateless per request; our database carries the
    // durable session state. The ref is a continuity token for our own records.
    const providerRef = `rb-${randomUUID().replace(/-/g, "").slice(0, 20)}`;
    logInfo("browser_session_created", { provider: this.key, ref: providerRef, objective: args.objective.slice(0, 80) });
    return { providerRef, provider: this.key, simulated: false };
  }

  private async render(target: string): Promise<PageObservation> {
    const u = await assertNavigable(target);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    let res: Response;
    try {
      res = await fetch(`${base()}/content?token=${encodeURIComponent(token())}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          url: u.toString(),
          gotoOptions: { waitUntil: "domcontentloaded", timeout: 20_000 },
        }),
        signal: controller.signal,
      });
    } catch (err) {
      clearTimeout(timer);
      logError(newRequestId(), err, { event: "browser_render_failed", site: u.hostname });
      throw new Error("the page took too long to respond.");
    }
    clearTimeout(timer);
    if (res.status === 403 || res.status === 429) {
      throw new BrowserBlockedError(u.hostname);
    }
    if (!res.ok) {
      throw new Error(`the page couldn't be opened (status ${res.status}).`);
    }
    const html = (await readCapped(res, MAX_HTML_BYTES)).toString("utf8");
    const obs = observationFromHtml(u.toString(), html);
    if (looksBlocked(obs)) throw new BrowserBlockedError(u.hostname);
    return obs;
  }

  async screenshot(target: string): Promise<string | null> {
    try {
      const u = await assertNavigable(target);
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
      const res = await fetch(`${base()}/screenshot?token=${encodeURIComponent(token())}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          url: u.toString(),
          options: { type: "jpeg", quality: 55, fullPage: false },
          gotoOptions: { waitUntil: "domcontentloaded", timeout: 20_000 },
        }),
        signal: controller.signal,
      });
      clearTimeout(timer);
      if (!res.ok) return null;
      const bytes = await readCapped(res, MAX_SCREENSHOT_BYTES);
      if (bytes.length === 0) return null;
      return `data:image/jpeg;base64,${bytes.toString("base64")}`;
    } catch {
      return null; // a missing preview is honest; the observation still stands
    }
  }

  async observe(_handle: BrowserSessionHandle, url?: string): Promise<PageObservation> {
    if (!url) throw new Error("no page to observe yet.");
    return this.render(url);
  }

  async act(handle: BrowserSessionHandle, action: BrowserActionInput): Promise<BrowserActionOutcome> {
    const { kind, target } = action;
    try {
      switch (kind) {
        case "navigate":
        case "openLink":
        case "inspect": {
          if (!target) return { ok: false, summary: "no page was given to open.", simulated: false };
          const obs = await this.render(target);
          return { ok: true, summary: `read “${obs.title}”.`, observation: obs, simulated: false };
        }
        case "searchWithinPage": {
          if (!target) return { ok: false, summary: "nothing to search for.", simulated: false };
          // target format: "<url> :: <text to find>"
          const [pageUrl, needle] = target.split(" :: ");
          const obs = await this.render(pageUrl ?? target);
          const found = needle ? obs.summary.toLowerCase().includes(needle.toLowerCase()) : false;
          return {
            ok: true,
            summary: needle
              ? found
                ? `found “${needle}” on the page.`
                : `“${needle}” does not appear on the page.`
              : `read the page.`,
            observation: obs,
            simulated: false,
          };
        }
        case "scroll": {
          // Rendering is full-page per request; a scroll re-reads the current page.
          if (!target) return { ok: true, summary: "nothing more to load.", simulated: false };
          const obs = await this.render(target);
          return { ok: true, summary: "read further down the page.", observation: obs, simulated: false };
        }
        case "captureScreenshot": {
          if (!target) return { ok: false, summary: "no page to capture.", simulated: false };
          const ref = await this.screenshot(target);
          if (!ref) return { ok: false, summary: "the page preview couldn't be captured.", simulated: false };
          return { ok: true, summary: "captured the current page.", simulated: false };
        }
        case "clickReadOnlyControl":
          // Stateless rendering has no persistent DOM to click; honest refusal.
          return { ok: false, summary: "clicking controls isn't available in this phase — cosigno opens links directly instead.", simulated: false };
        default:
          // No form typing, submission, downloads, or any consequential action
          // exists on the remote read-only path — refused by construction.
          return { ok: false, summary: "that browser action isn't available in this phase.", simulated: false };
      }
    } catch (err) {
      if (err instanceof BrowserBlockedError) {
        return { ok: false, summary: `${err.site} blocked automated access.`, simulated: false };
      }
      if (err instanceof SsrfError) {
        return { ok: false, summary: "that address can't be opened safely.", simulated: false };
      }
      const msg = err instanceof Error ? err.message : "the page couldn't be read.";
      return { ok: false, summary: msg.slice(0, 160), simulated: false };
    }
  }

  async destroySession(handle: BrowserSessionHandle): Promise<void> {
    // Nothing lives on the remote side between requests; log for the audit trail.
    logInfo("browser_session_destroyed", { provider: this.key, ref: handle.providerRef });
  }
}
