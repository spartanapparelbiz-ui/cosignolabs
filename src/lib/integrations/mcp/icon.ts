import { safeFetch, SsrfError } from "../net/ssrf";

/**
 * Best-effort fetch of a custom MCP server's icon, done SAFELY:
 *   - through safeFetch (SSRF-guarded, redirects disabled),
 *   - RASTER only — sniffed by magic bytes, never trusting content-type,
 *   - size-capped, and re-served as a self-contained data: URI.
 * SVG is never accepted (it can carry script). Any failure → null, and the
 * UI falls back to a generated monogram. Nothing here can render remote markup.
 */

const MAX_BYTES = 32 * 1024;
const TIMEOUT = 5000;

/** Sniff a raster image type from its leading bytes; null if not a known raster. */
function sniffRaster(bytes: Uint8Array): string | null {
  const b = bytes;
  if (b.length < 12) return null;
  if (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return "image/png";
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return "image/jpeg";
  if (b[0] === 0x47 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x38) return "image/gif";
  if (b[0] === 0x00 && b[1] === 0x00 && b[2] === 0x01 && b[3] === 0x00) return "image/x-icon";
  if (
    b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 &&
    b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50
  ) return "image/webp";
  return null; // includes SVG/HTML/anything else → rejected
}

async function tryFetchIcon(url: string): Promise<string | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT);
  try {
    const res = await safeFetch(url, { signal: controller.signal });
    if (!res.ok) return null;
    const len = Number(res.headers.get("content-length"));
    if (Number.isFinite(len) && len > MAX_BYTES) return null;
    const buf = new Uint8Array(await res.arrayBuffer());
    if (buf.byteLength === 0 || buf.byteLength > MAX_BYTES) return null;
    const mime = sniffRaster(buf);
    if (!mime) return null;
    const b64 = Buffer.from(buf).toString("base64");
    return `data:${mime};base64,${b64}`;
  } catch (err) {
    if (err instanceof SsrfError) return null;
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Attempt to obtain a safe icon for a server URL. Tries the common favicon
 * locations at the server's origin. Returns a data: URI or null.
 */
export async function fetchServerIcon(serverUrl: string): Promise<string | null> {
  let origin: string;
  try {
    origin = new URL(serverUrl).origin;
  } catch {
    return null;
  }
  for (const path of ["/favicon.ico", "/favicon.png", "/icon.png"]) {
    const icon = await tryFetchIcon(`${origin}${path}`);
    if (icon) return icon;
  }
  return null;
}
