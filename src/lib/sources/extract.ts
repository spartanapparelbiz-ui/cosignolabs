import { detectInjection } from "../agent/untrusted";
import { MAX_VISION_BYTES, VISION_LABEL, visionMimeSupported } from "../agent/provider";

/**
 * File extraction — turns an uploaded file into the context the operator can
 * actually use. Every format here is REALLY parsed (no placeholder
 * "processed" states): text formats decode, PDF/DOCX are parsed, and an image
 * is KEPT AS AN IMAGE so the operator looks at the picture itself.
 *
 * That last point used to be the bug. An image was reduced to the line
 * "[image attached: IMG_4021.jpeg · 4032×3024]" and the bytes were thrown
 * away, so the model was asked to describe a photo it had never seen — and
 * did what any model does with a filename and no picture: it guessed. Images
 * now travel as pixels, and a description is never invented from a filename.
 *
 * Safety, by construction:
 *  - the SERVER decides support from magic bytes + extension + declared MIME,
 *    never from a filename alone;
 *  - extracted text is UNTRUSTED — it's returned as data with an injection
 *    flag; it can never become instructions, grant permissions, or act;
 *  - a hard size cap and a bounded summary keep a hostile file from blowing
 *    up memory or the prompt;
 *  - document bytes are still discarded after parsing; only images are
 *    retained, only in the formats the operator can genuinely read.
 */

export const MAX_FILE_BYTES = 4 * 1024 * 1024; // 4 MB (safe under serverless payload limits)
const MAX_SUMMARY_CHARS = 20_000;

/**
 * The human-facing supported list. The image formats come from the provider
 * rather than being retyped here, so this sentence can never promise a format
 * the operator cannot actually read.
 */
export const SUPPORTED_LABEL =
  `PDF, DOCX, TXT, Markdown, CSV, ${VISION_LABEL}, and video (MP4, MOV, WebM)`;

export type ExtractStatus = "ready" | "failed" | "unsupported";

/**
 * An image the operator sees. `data` is raw base64 — the actual picture, not
 * a description of it.
 */
export interface SourceImage {
  mime: string;
  data: string;
  /** Caption shown to the operator, e.g. "receipt.jpg" or "frame at 0:12". */
  label: string;
}

export interface ExtractResult {
  status: ExtractStatus;
  /** mime we settled on (from content sniffing, not just the filename). */
  mime: string;
  /** bounded, plain-text context (empty for images / on failure). */
  summary: string;
  /** The real pixels, when this source is something to be looked at. */
  images: SourceImage[];
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
function sniff(
  buf: Buffer
): "pdf" | "docx" | "zip" | "png" | "jpg" | "webp" | "gif" | "video" | "text" | "unknown" {
  if (buf.length >= 5 && buf.toString("latin1", 0, 5) === "%PDF-") return "pdf";
  // ZIP-based (docx/xlsx/pptx or a plain zip): "PK\x03\x04"
  if (buf.length >= 4 && buf[0] === 0x50 && buf[1] === 0x4b && buf[2] === 0x03 && buf[3] === 0x04) return "zip";
  if (buf.length >= 8 && buf.toString("hex", 0, 8) === "89504e470d0a1a0a") return "png";
  if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return "jpg";
  // RIFF containers: WEBP is an image, AVI is video — the fourcc decides.
  if (buf.length >= 12 && buf.toString("latin1", 0, 4) === "RIFF") {
    const fourcc = buf.toString("latin1", 8, 12);
    if (fourcc === "WEBP") return "webp";
    if (fourcc === "AVI ") return "video";
  }
  if (buf.length >= 6 && (buf.toString("latin1", 0, 6) === "GIF87a" || buf.toString("latin1", 0, 6) === "GIF89a")) return "gif";
  // ISO base media (MP4 / MOV / M4V): a "ftyp" box at offset 4.
  if (buf.length >= 12 && buf.toString("latin1", 4, 8) === "ftyp") return "video";
  // Matroska / WebM: EBML header.
  if (buf.length >= 4 && buf.toString("hex", 0, 4) === "1a45dfa3") return "video";
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

/**
 * Read a PDF's text, across both shapes of the parser package.
 *
 * Version 2 exports a `PDFParse` CLASS; version 1 exported a callable. The
 * call site assumed the callable, so against the version actually installed
 * every PDF upload threw "pdfParse is not a function", got swallowed by the
 * catch below, and surfaced to the user as "couldn't be read" — with nothing
 * anywhere saying the parser had simply been called the wrong way.
 *
 * Supporting both shapes means a minor bump of that dependency can't
 * silently break document reading again.
 */
async function parsePdf(buf: Buffer): Promise<{ text: string; numpages?: number }> {
  const mod = (await import("pdf-parse")) as unknown as {
    default?: unknown;
    PDFParse?: new (opts: { data: Uint8Array }) => {
      getText: () => Promise<{ text?: string; pages?: unknown[] }>;
      destroy?: () => Promise<void> | void;
    };
  };

  if (typeof mod.PDFParse === "function") {
    const parser = new mod.PDFParse({ data: new Uint8Array(buf) });
    try {
      const out = await parser.getText();
      return { text: out.text ?? "", numpages: Array.isArray(out.pages) ? out.pages.length : undefined };
    } finally {
      // The parser holds a worker; not releasing it leaks across warm
      // serverless invocations.
      await parser.destroy?.();
    }
  }

  const callable =
    (typeof mod.default === "function" ? mod.default : undefined) ??
    (typeof mod === "function" ? (mod as unknown) : undefined);
  if (typeof callable === "function") {
    return (await (callable as (b: Buffer) => Promise<{ text: string; numpages?: number }>)(buf)) ?? { text: "" };
  }
  throw new Error("the PDF reader is unavailable.");
}

/** GIF logical-screen dimensions (little-endian, bytes 6-9). */
function gifDimensions(buf: Buffer): { w: number; h: number } | null {
  try {
    return { w: buf.readUInt16LE(6), h: buf.readUInt16LE(8) };
  } catch {
    return null;
  }
}

/**
 * Validate a base64 image that was decoded somewhere else (a video frame from
 * the browser, a camera capture). The bytes are re-sniffed here: a caller
 * saying "image/png" is a claim, and the magic bytes are the proof. Returns
 * null when the payload isn't a real, readable image.
 */
export function validateImagePayload(
  base64: string,
  label: string
): { image: SourceImage; width: number | null; height: number | null } | null {
  let buf: Buffer;
  try {
    buf = Buffer.from(base64, "base64");
  } catch {
    return null;
  }
  if (buf.length === 0 || buf.length > MAX_VISION_BYTES) return null;

  const kind = sniff(buf);
  if (kind !== "png" && kind !== "jpg" && kind !== "webp" && kind !== "gif") return null;
  const mime =
    kind === "png" ? "image/png"
    : kind === "jpg" ? "image/jpeg"
    : kind === "webp" ? "image/webp"
    : "image/gif";
  if (!visionMimeSupported(mime)) return null;

  const dims = kind === "gif" ? gifDimensions(buf) : imageDimensions(buf, kind);
  return {
    // Re-encode from the sniffed buffer so what is stored is exactly what was
    // validated — never the caller's original string.
    image: { mime, data: buf.toString("base64"), label: label.slice(0, 120) },
    width: dims?.w ?? null,
    height: dims?.h ?? null,
  };
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
    return { status: "failed", mime: declaredMime, summary: "", images: [], injection: false, detail: { error: "the file was empty." } };
  }
  if (buf.length > MAX_FILE_BYTES) {
    return { status: "failed", mime: declaredMime, summary: "", images: [], injection: false, detail: { error: "the file is larger than the 4 MB limit." } };
  }

  const ext = extOf(filename);
  const kind = sniff(buf);

  // A ZIP that isn't a DOCX (by extension) is rejected — no archive expansion.
  if (kind === "zip" && ext !== "docx") {
    return { status: "unsupported", mime: "application/zip", summary: "", images: [], injection: false, detail: { reason: "archives aren't supported." } };
  }
  // Video never reaches the model as a container — frames are sampled in the
  // browser (where a decoder already exists) and posted to /api/sources/video.
  // Saying that plainly beats accepting the upload and quietly reading nothing.
  if (kind === "video") {
    return {
      status: "unsupported",
      mime: declaredMime || "video/mp4",
      summary: "",
      images: [],
      injection: false,
      detail: {
        reason: "video is read by sampling its frames.",
        message: "add the video from the ask box — cosigno reads video by sampling frames from it.",
      },
    };
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
      return { status: "ready", mime, summary: text, images: [], injection: detectInjection(text), detail };
    }

    // ---- PDF ----
    if (kind === "pdf" && (ext === "pdf" || ext === "")) {
      const parsed = await parsePdf(buf);
      const text = boundText(parsed.text ?? "");
      if (!text) {
        return { status: "failed", mime: "application/pdf", summary: "", images: [], injection: false, detail: { error: "no readable text found (it may be a scanned image)." } };
      }
      return { status: "ready", mime: "application/pdf", summary: text, images: [], injection: detectInjection(text), detail: { pages: parsed.numpages ?? null } };
    }

    // ---- DOCX ----
    if (kind === "zip" && ext === "docx") {
      const mammothMod = await import("mammoth");
      const mammoth = (mammothMod as { default?: unknown }).default ?? mammothMod;
      const result = await (mammoth as { extractRawText: (o: { buffer: Buffer }) => Promise<{ value: string }> }).extractRawText({ buffer: buf });
      const text = boundText(result.value ?? "");
      const mime = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
      if (!text) {
        return { status: "failed", mime, summary: "", images: [], injection: false, detail: { error: "no readable text found." } };
      }
      return { status: "ready", mime, summary: text, images: [], injection: detectInjection(text), detail: {} };
    }

    // ---- images: validated, and KEPT AS PIXELS ----
    // The bytes are what the operator reads. The summary is a label for the
    // UI and the audit trail, never a stand-in for having looked at the image.
    if (kind === "png" || kind === "jpg" || kind === "webp" || kind === "gif") {
      const mime =
        kind === "png" ? "image/png"
        : kind === "jpg" ? "image/jpeg"
        : kind === "webp" ? "image/webp"
        : "image/gif";
      const dims = kind === "gif" ? gifDimensions(buf) : imageDimensions(buf, kind);
      const dimStr = dims ? `${dims.w}×${dims.h}` : "unknown size";

      if (!visionMimeSupported(mime)) {
        return {
          status: "unsupported", mime, summary: "", images: [], injection: false,
          detail: { reason: "that image format can't be read." },
        };
      }
      // Too large to send is reported as such — it is never downgraded to a
      // filename the operator would then guess from.
      if (buf.length > MAX_VISION_BYTES) {
        return {
          status: "unsupported", mime, summary: "", images: [], injection: false,
          detail: {
            reason: "image too large to read.",
            message: `that image is too large to read (limit ${Math.floor(MAX_VISION_BYTES / 1024 / 1024)} MB). resize it and try again.`,
          },
        };
      }

      return {
        status: "ready",
        mime,
        summary: `[image: ${filename} · ${dimStr} · ${mime}]`,
        images: [{ mime, data: buf.toString("base64"), label: filename }],
        injection: false,
        detail: { image: true, readable: true, ...(dims ?? {}) },
      };
    }

    // Nothing matched -> unsupported.
    return { status: "unsupported", mime: declaredMime || "application/octet-stream", summary: "", images: [], injection: false, detail: { reason: "unrecognized file type." } };
  } catch (err) {
    return {
      status: "failed",
      mime: declaredMime || "application/octet-stream",
      summary: "",
      images: [],
      injection: false,
      detail: { error: err instanceof Error ? err.message.slice(0, 120) : "processing failed." },
    };
  }
}
