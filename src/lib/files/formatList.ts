/**
 * The format catalog — names, extensions, and MIME types only.
 *
 * Deliberately free of any renderer import, and therefore of any Node
 * built-in. The browser needs this list to draw the "save as" buttons, and
 * the renderers reach for `node:zlib` to build Office files; a single module
 * holding both drags a server-only dependency into the client bundle and the
 * build fails outright.
 *
 * So: this file is the shared vocabulary, `formats.ts` is the server-side
 * machinery that renders it. One list, still — the picker cannot offer a
 * format the server doesn't know about, because both read from here.
 */

export type ExportFormat =
  | "pdf"
  | "docx"
  | "xlsx"
  | "pptx"
  | "csv"
  | "md"
  | "txt"
  | "html"
  | "json";

export interface FormatDef {
  id: ExportFormat;
  /** What a person calls it. */
  label: string;
  extension: string;
  mime: string;
  /** True when the result is binary and must not be treated as text. */
  binary: boolean;
  /** One line for the picker, and for the operator explaining its options. */
  description: string;
}

export const FORMATS: FormatDef[] = [
  { id: "pdf", label: "PDF", extension: ".pdf", mime: "application/pdf", binary: true, description: "A paginated document for sending and printing." },
  { id: "docx", label: "Word", extension: ".docx", mime: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", binary: true, description: "An editable Word document with real headings." },
  { id: "xlsx", label: "Excel", extension: ".xlsx", mime: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", binary: true, description: "A spreadsheet, when the content is a table." },
  { id: "pptx", label: "PowerPoint", extension: ".pptx", mime: "application/vnd.openxmlformats-officedocument.presentationml.presentation", binary: true, description: "A slide deck built from the headings and bullets." },
  { id: "csv", label: "CSV", extension: ".csv", mime: "text/csv", binary: false, description: "Plain comma-separated data for another tool to read." },
  { id: "md", label: "Markdown", extension: ".md", mime: "text/markdown", binary: false, description: "The raw text, formatting marks intact." },
  { id: "txt", label: "Plain text", extension: ".txt", mime: "text/plain", binary: false, description: "The raw text, nothing else." },
  { id: "html", label: "Web page", extension: ".html", mime: "text/html", binary: false, description: "A self-contained page that opens in any browser." },
  { id: "json", label: "JSON", extension: ".json", mime: "application/json", binary: false, description: "Structured data for a program to consume." },
];

const BY_ID = new Map(FORMATS.map((f) => [f.id, f]));

export function formatOf(id: string): FormatDef | null {
  return BY_ID.get(id as ExportFormat) ?? null;
}

/** The human list, so error copy can never disagree with what exists. */
export const FORMAT_LABEL = FORMATS.map((f) => f.label).join(", ");
