import { detectInjection } from "../agent/untrusted";

/**
 * File extraction — turns an uploaded file into bounded, plain-text context
 * the mission compiler can read. Every format here is REALLY parsed (no
 * placeholder "processed" states): text formats decode, PDF/DOCX are parsed,
 * images are validated by magic bytes and attached as visual context (no OCR,
 * so honestly not text-readable). Anything else is `unsupported`.
 *
 * Safety, by construction:
 *  - the SERVER decides support from magic bytes + extension + declared MIME,
 *    never from a filename alone;
 *  - extracted text is UNTRUSTED — it's returned as data with an injection
 *    flag; it can never become instructions, grant permissions, or act;
 *  - a hard size cap and a bounded summary keep a hostile file from blowing
 *    up memory or the prompt;
 *  - the raw bytes are never persisted (only the extracted summary is stored).
 */

export const MAX_FILE_BYTES = 4 * 1024 * 1024; // 4 MB (safe under serverless payload limits)
const MAX_SUMMARY_CHARS = 20_000;

/** The human-facing supported list (matches the unsupported error copy). */
export const SUPPORTED_LABEL = "PDF, DOCX, TXT, Markdown, CSV, PNG, JPG, and WebP";

export type ExtractStatus = "ready" | "failed" | "unsupported";

export interface ExtractResult {
  status: ExtractStatus;
  /** mime we settled on (from content sniffing, not just the filename). */
  mime: string;
  /** bounded, plain-text context (empty for images / on failure). */
  summary: string;
  injection: boolean;
  detail: Record<string, unknown>;
}

const TEXT_EXT = new Set(["txt", "md", "markdown", "csv"]);
const TEXT_MIME = new Set([
  "text/plain",
  "text/markdown",
  "text/csv",
  "application/csv",
  "text/x-markdown",
]);

function extOf(name: string): string {
  const m = /\.([a-z0-9]+)$/i.exec(name.trim());
  return m ? m[1].toLowerCase() : "";
}

/** Magic-byte sniffers — the file's real type, not what it's named. */
function sniff(buf: Buffer): "pdf" | "docx" | "zip" | "png" | "jpg" | "webp" | "gif" | "text" | "unknown" {
  if (buf.length >= 5 && buf.toString("latin1", 0, 5) === "%PDF-") return "pdf";
  // ZIP-based (docx/xlsx/pptx or a plain zip): "PK\x03\x04"
  if (buf.length >= 4 && buf[0] === 0x50 && buf[1] === 0x4b && buf[2] === 0x03 && buf[3] === 0x04) return "zip";
  if (buf.length >= 8 && buf.toString("hex", 0, 8) === "89504e470d0a1a0a") return "png";
  if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return "jpg";
  if (buf.length >= 12 && buf.toString("latin1", 0, 4) === "RIFF" && buf.toString("latin1", 8, 12) === "WEBP") return "webp";
  if (buf.length >= 6 && (buf.toString("latin1", 0, 6) === "GIF87a" || buf.toString("latin1", 0, 6) === "GIF89a")) return "gif";
  // Heuristic: mostly-printable -> treat as text.
  const sample = buf.subarray(0, 512);
  let printable = 0;
  for (const b of sample) {
    if (b === 9 || b === 10 || b === 13 || (b >= 32 && b < 127) || b >= 128) printable++;
  }
  if (sample.length > 0 && printable / sample.length > 0.9) return "text";
  return "unknown";
}

/** PNG/JPEG/WebP dimensions from the header (no image lib needed). */
function imageDimensions(buf: Buffer, kind: "png" | "jpg" | "webp"): { w: number; h: number } | null {
  try {
    if (kind === "png") return { w: buf.readUInt32BE(16), h: buf.readUInt32BE(20) };
    if (kind === "webp") {
      const fourcc = buf.toString("latin1", 12, 16);
      if (fourcc === "VP8 ") {
        return { w: buf.readUInt16LE(26) & 0x3fff, h: buf.readUInt16LE(28) & 0x3fff };
      }
      if (fourcc === "VP8L") {
        const b = buf.readUInt32LE(21);
        return { w: (b & 0x3fff) + 1, h: ((b >> 14) & 0x3fff) + 1 };
      }
      if (fourcc === "VP8X") {
        const w = 1 + (buf[24] | (buf[25] << 8) | (buf[26] << 16));
        const h = 1 + (buf[27] | (buf[28] << 8) | (buf[29] << 16));
        return { w, h };
      }
      return null;
    }
    // jpeg: scan SOFn markers
    let i = 2;
    while (i < buf.length - 9) {
      if (buf[i] !== 0xff) {
        i++;
        continue;
      }
      const marker = buf[i + 1];
      if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
        return { h: buf.readUInt16BE(i + 5), w: buf.readUInt16BE(i + 7) };
      }
      i += 2 + buf.readUInt16BE(i + 2);
    }
    return null;
  } catch {
    return null;
  }
}

/** Strip control chars (keeping tab/newline/CR), collapse blank lines, bound length. */
function boundText(s: string): string {
  const clean = s
    // drop C0 control chars except \t (09) \n (0A) \r (0D), plus DEL (7F)
    .replace(/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/g, "")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  return clean.length > MAX_SUMMARY_CHARS ? clean.slice(0, MAX_SUMMARY_CHARS) + "\n…(truncated)" : clean;
}

/**
 * Extract context from an uploaded file. `declaredMime` is advisory only —
 * the content sniff decides. Never throws; failures return status:"failed".
 */
export async function extractFile(
  buf: Buffer,
  filename: string,
  declaredMime: string
): Promise<ExtractResult> {
  if (buf.length === 0) {
    return { status: "failed", mime: declaredMime, summary: "", injection: false, detail: { error: "The file was empty." } };
  }
  if (buf.length > MAX_FILE_BYTES) {
    return { status: "failed", mime: declaredMime, summary: "", injection: false, detail: { error: "The file is larger than the 4 MB limit." } };
  }

  const ext = extOf(filename);
  const kind = sniff(buf);

  // A ZIP that isn't a DOCX (by extension) is rejected — no archive expansion.
  if (kind === "zip" && ext !== "docx") {
    return { status: "unsupported", mime: "application/zip", summary: "", injection: false, detail: { reason: "Archives aren't supported." } };
  }
  if (kind === "gif") {
    return { status: "unsupported", mime: "image/gif", summary: "", injection: false, detail: { reason: "GIF isn't supported." } };
  }

  try {
    // ---- text formats: decode + honor the extension for the label ----
    if (kind === "text" && (TEXT_EXT.has(ext) || TEXT_MIME.has(declaredMime) || ext === "")) {
      const text = boundText(buf.toString("utf8"));
      const mime = ext === "csv" ? "text/csv" : ext === "md" || ext === "markdown" ? "text/markdown" : "text/plain";
      const detail: Record<string, unknown> = { chars: text.length };
      if (mime === "text/csv") {
        detail.rows = text.split(/\r?\n/).filter(Boolean).length;
      }
      return { status: "ready", mime, summary: text, injection: detectInjection(text), detail };
    }

    // ---- PDF ----
    if (kind === "pdf" && (ext === "pdf" || ext === "")) {
      const mod = await import("pdf-parse");
      const pdfParse =
        (mod as { default?: (b: Buffer) => Promise<{ text: string; numpages?: number }> }).default ??
        (mod as unknown as (b: Buffer) => Promise<{ text: string; numpages?: number }>);
      const parsed = await pdfParse(buf);
      const text = boundText(parsed.text ?? "");
      if (!text) {
        return { status: "failed", mime: "application/pdf", summary: "", injection: false, detail: { error: "No readable text found (it may be a scanned image)." } };
      }
      return { status: "ready", mime: "application/pdf", summary: text, injection: detectInjection(text), detail: { pages: parsed.numpages ?? null } };
    }

    // ---- DOCX ----
    if (kind === "zip" && ext === "docx") {
      const mammothMod = await import("mammoth");
      const mammoth = (mammothMod as { default?: unknown }).default ?? mammothMod;
      const result = await (mammoth as { extractRawText: (o: { buffer: Buffer }) => Promise<{ value: string }> }).extractRawText({ buffer: buf });
      const text = boundText(result.value ?? "");
      const mime = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
      if (!text) {
        return { status: "failed", mime, summary: "", injection: false, detail: { error: "No readable text found." } };
      }
      return { status: "ready", mime, summary: text, injection: detectInjection(text), detail: {} };
    }

    // ---- images: validate + dimensions, attach as visual context ----
    if (kind === "png" || kind === "jpg" || kind === "webp") {
      const dims = imageDimensions(buf, kind);
      const mime = kind === "png" ? "image/png" : kind === "jpg" ? "image/jpeg" : "image/webp";
      const dimStr = dims ? `${dims.w}×${dims.h}` : "unknown size";
      // Honest: no OCR — the image is attached as visual context, not text.
      const summary = `[image attached: ${filename} · ${dimStr} · ${mime}] — cosigno keeps this as a visual reference for the mission; it does not read text from images.`;
      return { status: "ready", mime, summary, injection: false, detail: { image: true, ...(dims ?? {}) } };
    }

    // Nothing matched -> unsupported.
    return { status: "unsupported", mime: declaredMime || "application/octet-stream", summary: "", injection: false, detail: { reason: "Unrecognized file type." } };
  } catch (err) {
    return {
      status: "failed",
      mime: declaredMime || "application/octet-stream",
      summary: "",
      injection: false,
      detail: { error: err instanceof Error ? err.message.slice(0, 120) : "Processing failed." },
    };
  }
}
