import { renderPdf } from "./pdf";
import { renderDocx } from "./docx";
import { detectTable, parseDelimited, renderXlsx } from "./xlsx";
import { renderPptx, slidesFromText } from "./pptx";
import { type ExportFormat } from "./formatList";

/**
 * Rendering a stored document into a real file. SERVER ONLY — the Office
 * writers reach for `node:zlib`, so importing this from a client component
 * pulls a Node built-in into the browser bundle and the build fails.
 *
 * Client code wants `./formatList` instead: the same catalog, no renderers.
 *
 * Documents are authored and stored as TEXT and rendered on the way out. That
 * is what lets one report become a PDF, a Word file, a spreadsheet, or a deck
 * without being written four times — and why an export is always of the
 * current version, never a stale copy.
 */

export interface RenderInput {
  title: string;
  body: string;
  subtitle?: string;
}

/**
 * Render a stored document into a format.
 *
 * Never throws for ordinary content: a format that doesn't suit the material
 * degrades to something usable rather than failing. Asking for a spreadsheet
 * of prose gives a one-column sheet of that prose — which is honest and
 * openable — instead of an error the user can't act on.
 */
export function render(format: ExportFormat, input: RenderInput): Buffer {
  const title = input.title.trim() || "Document";
  const body = input.body ?? "";

  switch (format) {
    case "pdf":
      return renderPdf({ title, body, subtitle: input.subtitle });

    case "docx":
      return renderDocx({ title, body, subtitle: input.subtitle });

    case "pptx":
      return renderPptx({ title, slides: slidesFromText(body), subtitle: input.subtitle });

    case "xlsx": {
      const table = detectTable(body);
      const rows = table ?? textAsRows(body);
      return renderXlsx({ name: title.slice(0, 31), rows, header: Boolean(table) });
    }

    case "csv": {
      const table = detectTable(body);
      const rows = table ?? textAsRows(body);
      return Buffer.from(rows.map((r) => r.map(csvCell).join(",")).join("\r\n"), "utf8");
    }

    case "html":
      return Buffer.from(renderHtml(title, body, input.subtitle), "utf8");

    case "json":
      return Buffer.from(
        JSON.stringify(
          { title, subtitle: input.subtitle ?? null, table: detectTable(body), body },
          null,
          2
        ),
        "utf8"
      );

    case "md":
    case "txt":
    default:
      return Buffer.from(body, "utf8");
  }
}

/** Prose in a spreadsheet: one line per row, so nothing is lost. */
function textAsRows(body: string): string[][] {
  const lines = body.split("\n").map((l) => l.trim()).filter(Boolean);
  return lines.length > 0 ? lines.map((l) => [l]) : [[""]];
}

/** Quote a CSV field only when it needs it. */
function csvCell(value: string): string {
  const s = String(value ?? "");
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * A self-contained page: styles inline, no external requests. It has to open
 * correctly from a file:// path on a machine with no network, because that is
 * how an emailed attachment actually gets read.
 */
function renderHtml(title: string, body: string, subtitle?: string): string {
  const blocks = body
    .split(/\n{2,}/)
    .filter((b) => b.trim())
    .map((block) => {
      const lines = block.split("\n").filter((l) => l.trim());
      if (lines.every((l) => /^\s*[-•*]\s+|^\s*\d+[.)]\s+/.test(l))) {
        const items = lines
          .map((l) => `<li>${escapeHtml(l.replace(/^\s*[-•*]\s+/, "").replace(/^\s*\d+[.)]\s+/, ""))}</li>`)
          .join("");
        return `<ul>${items}</ul>`;
      }
      if (lines.length === 1 && lines[0].length < 80 && lines[0].trim().endsWith(":")) {
        return `<h2>${escapeHtml(lines[0].replace(/:$/, ""))}</h2>`;
      }
      return `<p>${escapeHtml(lines.join(" "))}</p>`;
    })
    .join("\n");

  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${escapeHtml(title)}</title>
<style>
:root{color-scheme:light dark}
body{margin:0 auto;padding:2.5rem 1.25rem;max-width:44rem;font:16px/1.65 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;color:#1a1a1a;background:#fff}
@media(prefers-color-scheme:dark){body{color:#e8e8e8;background:#161616}}
h1{font-size:1.9rem;line-height:1.2;margin:0 0 .25rem}
h2{font-size:1.15rem;margin:2rem 0 .5rem}
.sub{color:#6b7280;font-size:.85rem;margin:0 0 2rem}
ul{padding-left:1.25rem}li{margin:.35rem 0}
</style></head>
<body><h1>${escapeHtml(title)}</h1>${subtitle ? `<p class="sub">${escapeHtml(subtitle)}</p>` : ""}
${blocks}
</body></html>`;
}

export { detectTable, parseDelimited, slidesFromText };
// Re-exported so server callers keep a single import surface.
export { FORMATS, FORMAT_LABEL, formatOf, type ExportFormat, type FormatDef } from "./formatList";
