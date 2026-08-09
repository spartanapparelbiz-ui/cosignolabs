import { xmlEscape, zip } from "./zip";

/**
 * Excel workbooks, written directly as OOXML.
 *
 * The input is rows of cells, which is what a comparison table, an expense
 * list, or an extracted set of receipts already is. A CSV would carry the
 * same data, but loses types and formatting the moment it opens — numbers
 * become text, leading zeros vanish, and a long number turns into scientific
 * notation. Writing a real workbook keeps a number a number.
 *
 * Strings are written inline rather than through a shared-strings table: one
 * less part to keep consistent, and the size difference is irrelevant at the
 * scale a generated report actually reaches.
 */

const CONTENT_TYPES = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
<Default Extension="xml" ContentType="application/xml"/>
<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>
<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>
</Types>`;

const ROOT_RELS = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
</Relationships>`;

const WORKBOOK_RELS = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>
<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
</Relationships>`;

/** Two cell formats: plain, and bold for the header row (style index 1). */
const STYLES = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
<fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts>
<fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills>
<borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>
<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
<cellXfs count="2"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/></cellXfs>
</styleSheet>`;

/** Column index (0-based) to spreadsheet letters: 0→A, 26→AA. */
export function columnName(index: number): string {
  let n = index + 1;
  let name = "";
  while (n > 0) {
    const rem = (n - 1) % 26;
    name = String.fromCharCode(65 + rem) + name;
    n = Math.floor((n - 1) / 26);
  }
  return name;
}

/**
 * Is this value a number Excel should treat as one?
 *
 * Deliberately strict. A value like "007" or "+15551234567" LOOKS numeric and
 * must stay text — turning a zip code or a phone number into a number is a
 * data-corruption bug, not a formatting nicety.
 */
function numericValue(raw: string): number | null {
  const s = raw.trim();
  if (!s) return null;
  if (!/^-?(0|[1-9]\d*)(\.\d+)?$/.test(s)) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

export interface SheetData {
  /** Sheet tab name. Excel forbids : \\ / ? * [ ] and caps it at 31 chars. */
  name?: string;
  /** First row is treated as a header when `header` is true. */
  rows: (string | number)[][];
  header?: boolean;
}

function safeSheetName(name: string): string {
  const clean = name.replace(/[:\\/?*[\]]/g, " ").trim().slice(0, 31);
  return clean || "Sheet1";
}

export function renderXlsx(data: SheetData): Buffer {
  const rows = data.rows ?? [];
  const header = data.header !== false;

  const xmlRows = rows.map((row, r) => {
    const cells = row.map((value, c) => {
      const ref = `${columnName(c)}${r + 1}`;
      const style = header && r === 0 ? ' s="1"' : "";
      if (typeof value === "number" && Number.isFinite(value)) {
        return `<c r="${ref}"${style}><v>${value}</v></c>`;
      }
      const text = String(value ?? "");
      const num = typeof value === "string" ? numericValue(text) : null;
      if (num !== null) return `<c r="${ref}"${style}><v>${num}</v></c>`;
      return `<c r="${ref}"${style} t="inlineStr"><is><t xml:space="preserve">${xmlEscape(text)}</t></is></c>`;
    });
    return `<row r="${r + 1}">${cells.join("")}</row>`;
  });

  const widest = rows.reduce((m, r) => Math.max(m, r.length), 0);
  // Column widths sized to the longest value, so a generated sheet doesn't
  // open as a wall of ### and truncated text.
  const cols = Array.from({ length: widest }, (_, c) => {
    const longest = rows.reduce((m, r) => Math.max(m, String(r[c] ?? "").length), 0);
    const width = Math.min(60, Math.max(10, longest + 2));
    return `<col min="${c + 1}" max="${c + 1}" width="${width}" customWidth="1"/>`;
  }).join("");

  // A frozen header row keeps column names visible while scrolling.
  const freeze =
    header && rows.length > 1
      ? `<sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>`
      : "";

  const sheet = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">${freeze}${
    cols ? `<cols>${cols}</cols>` : ""
  }<sheetData>${xmlRows.join("")}</sheetData></worksheet>`;

  const sheetName = safeSheetName(data.name ?? "Sheet1");
  const workbook = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
<sheets><sheet name="${xmlEscape(sheetName)}" sheetId="1" r:id="rId1"/></sheets>
</workbook>`;

  return zip([
    { path: "[Content_Types].xml", data: CONTENT_TYPES },
    { path: "_rels/.rels", data: ROOT_RELS },
    { path: "xl/_rels/workbook.xml.rels", data: WORKBOOK_RELS },
    { path: "xl/styles.xml", data: STYLES },
    { path: "xl/worksheets/sheet1.xml", data: sheet },
    { path: "xl/workbook.xml", data: workbook },
  ]);
}

/**
 * Parse delimited text into rows. Handles quoted fields, escaped quotes, and
 * embedded newlines — the cases that make a naive split on commas mangle real
 * exported data.
 */
export function parseDelimited(text: string, delimiter = ","): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          quoted = false;
        }
      } else {
        field += ch;
      }
      continue;
    }
    if (ch === '"') {
      quoted = true;
    } else if (ch === delimiter) {
      row.push(field);
      field = "";
    } else if (ch === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else if (ch !== "\r") {
      field += ch;
    }
  }
  if (field || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter((r) => r.some((c) => c.trim() !== ""));
}

/**
 * Best-effort table detection in plain text, so "save this as a spreadsheet"
 * works on a report the operator wrote as a markdown table or as CSV. Returns
 * null when the text isn't tabular — the caller then keeps it as prose rather
 * than forcing it into a grid.
 */
export function detectTable(text: string): string[][] | null {
  const lines = text.split("\n").map((l) => l.trim()).filter(Boolean);
  if (lines.length < 2) return null;

  // Markdown pipe table: | a | b | with a |---|---| separator row.
  const pipeLines = lines.filter((l) => l.startsWith("|") && l.endsWith("|"));
  if (pipeLines.length >= 2 && pipeLines.some((l) => /^\|[\s:|-]+\|$/.test(l))) {
    const rows = pipeLines
      .filter((l) => !/^\|[\s:|-]+\|$/.test(l))
      .map((l) => l.slice(1, -1).split("|").map((c) => c.trim()));
    return rows.length >= 1 ? rows : null;
  }

  // Delimited text: every line has the same field count, and there is more
  // than one column. Requiring consistency is what stops ordinary prose
  // containing commas from being mistaken for a table.
  for (const delim of [",", "\t", ";"]) {
    const rows = parseDelimited(lines.join("\n"), delim);
    if (rows.length >= 2 && rows[0].length > 1 && rows.every((r) => r.length === rows[0].length)) {
      return rows;
    }
  }
  return null;
}
