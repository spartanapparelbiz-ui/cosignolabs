/**
 * PDF output, with no dependencies.
 *
 * cosigno could read a document and could not produce one — a report could
 * only ever come back as text on a screen. This writes a real PDF 1.4 file
 * that any viewer opens, using the base-14 fonts every reader is required to
 * ship, so there is no font to embed, no binary toolchain to install, and
 * nothing that breaks on a serverless host with a read-only filesystem.
 *
 * Deliberately small in scope: a titled, paginated text document with
 * headings, paragraphs, and bullets. That is what a report is. It does not
 * do images or tables, and it does not pretend to.
 */

const PAGE_W = 612; // US Letter, 72dpi points
const PAGE_H = 792;
const MARGIN = 64;
const CONTENT_W = PAGE_W - MARGIN * 2;

const BODY_SIZE = 11;
const BODY_LEAD = 15.5;
const H1_SIZE = 19;
const H2_SIZE = 13;

type Style = "h1" | "h2" | "body" | "bullet" | "meta";

interface Line {
  text: string;
  style: Style;
  /** Extra space above this line, in points. */
  spaceBefore: number;
}

const FONT_OF: Record<Style, "F1" | "F2"> = {
  h1: "F2",
  h2: "F2",
  body: "F1",
  bullet: "F1",
  meta: "F1",
};

const SIZE_OF: Record<Style, number> = {
  h1: H1_SIZE,
  h2: H2_SIZE,
  body: BODY_SIZE,
  bullet: BODY_SIZE,
  meta: 9,
};

/**
 * Width of a string in Helvetica at a given size.
 *
 * Character widths come from the standard Helvetica metrics (units of 1/1000
 * em). Measuring properly is what stops long lines running off the right
 * edge — a fixed character estimate overflows on capitals and underfills on
 * lowercase, and both look broken.
 */
const HELVETICA_WIDTHS: Record<string, number> = {
  " ": 278, "!": 278, '"': 355, "#": 556, $: 556, "%": 889, "&": 667, "'": 191,
  "(": 333, ")": 333, "*": 389, "+": 584, ",": 278, "-": 333, ".": 278, "/": 278,
  "0": 556, "1": 556, "2": 556, "3": 556, "4": 556, "5": 556, "6": 556, "7": 556,
  "8": 556, "9": 556, ":": 278, ";": 278, "<": 584, "=": 584, ">": 584, "?": 556,
  "@": 1015, A: 667, B: 667, C: 722, D: 722, E: 667, F: 611, G: 778, H: 722,
  I: 278, J: 500, K: 667, L: 556, M: 833, N: 722, O: 778, P: 667, Q: 778, R: 722,
  S: 667, T: 611, U: 722, V: 667, W: 944, X: 667, Y: 667, Z: 611, "[": 278,
  "\\": 278, "]": 278, "^": 469, _: 556, "`": 333, a: 556, b: 556, c: 500, d: 556,
  e: 556, f: 278, g: 556, h: 556, i: 222, j: 222, k: 500, l: 222, m: 833, n: 556,
  o: 556, p: 556, q: 556, r: 333, s: 500, t: 278, u: 556, v: 500, w: 722, x: 500,
  y: 500, z: 500, "{": 334, "|": 260, "}": 334, "~": 584,
};

function textWidth(s: string, size: number, bold: boolean): number {
  let units = 0;
  for (const ch of s) units += HELVETICA_WIDTHS[ch] ?? 556;
  // Helvetica-Bold runs a little wider than the regular face; the standard
  // metrics differ per glyph, and this is close enough not to overflow.
  return (units / 1000) * size * (bold ? 1.06 : 1);
}

/** Break a paragraph into lines that fit the content width. */
function wrap(text: string, size: number, bold: boolean, width: number): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  if (words.length === 0) return [];
  const lines: string[] = [];
  let current = "";
  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (textWidth(candidate, size, bold) <= width) {
      current = candidate;
      continue;
    }
    if (current) lines.push(current);
    // A single word too long for the line (a URL, a hash) is split rather
    // than allowed to run past the margin.
    if (textWidth(word, size, bold) > width) {
      let chunk = "";
      for (const ch of word) {
        if (textWidth(chunk + ch, size, bold) > width) {
          lines.push(chunk);
          chunk = ch;
        } else {
          chunk += ch;
        }
      }
      current = chunk;
    } else {
      current = word;
    }
  }
  if (current) lines.push(current);
  return lines;
}

/**
 * Escape for a PDF literal string, and drop anything outside WinAnsi. The
 * base-14 fonts have no glyph for, say, an emoji, and a viewer shows a
 * replacement box; a plain "?" is less confusing than a corrupt-looking file.
 */
function pdfString(s: string): string {
  let out = "";
  for (const ch of s) {
    const code = ch.codePointAt(0) ?? 63;
    if (ch === "\\") out += "\\\\";
    else if (ch === "(") out += "\\(";
    else if (ch === ")") out += "\\)";
    else if (code === 9) out += "    ";
    else if (code < 32) continue;
    else if (code <= 126) out += ch;
    else if (code === 0x2019 || code === 0x2018) out += "'";
    else if (code === 0x201c || code === 0x201d) out += '"';
    else if (code === 0x2014 || code === 0x2013) out += "-";
    else if (code === 0x2022) out += "-";
    else if (code === 0x00b7 || code === 0x00d7) out += "x";
    else if (code === 0x2026) out += "...";
    else if (code <= 255) out += `\\${code.toString(8).padStart(3, "0")}`;
    else out += "?";
  }
  return out;
}

/**
 * Turn plain text into styled lines. The input is what the operator writes:
 * paragraphs, "Heading:" lines, and "- " bullets.
 */
function layout(title: string, body: string, subtitle?: string): Line[] {
  const lines: Line[] = [];
  const push = (text: string, style: Style, spaceBefore = 0) => {
    for (const l of wrap(text, SIZE_OF[style], FONT_OF[style] === "F2", CONTENT_W - (style === "bullet" ? 14 : 0))) {
      lines.push({ text: l, style, spaceBefore: lines.length === 0 ? 0 : spaceBefore });
      spaceBefore = 0; // only the first wrapped line carries the gap
    }
  };

  push(title, "h1");
  if (subtitle) push(subtitle, "meta", 4);

  for (const block of body.split(/\n{2,}/)) {
    const raw = block.split("\n").filter((l) => l.trim());
    if (raw.length === 0) continue;

    const allBullets = raw.every((l) => /^\s*[-•*]\s+|^\s*\d+[.)]\s+/.test(l));
    if (allBullets) {
      for (const [i, l] of raw.entries()) {
        push(`-  ${l.replace(/^\s*[-•*]\s+/, "").replace(/^\s*\d+[.)]\s+/, "")}`, "bullet", i === 0 ? 10 : 3);
      }
      continue;
    }
    if (raw.length === 1 && raw[0].length < 80 && raw[0].trim().endsWith(":")) {
      push(raw[0].replace(/:$/, ""), "h2", 16);
      continue;
    }
    push(raw.join(" "), "body", 11);
  }
  return lines;
}

/**
 * Render a text document as a PDF.
 *
 * Returns the file bytes. Never throws on ordinary content — anything it
 * can't represent is degraded to something printable rather than failing.
 */
export function renderPdf(opts: { title: string; body: string; subtitle?: string }): Buffer {
  const lines = layout(opts.title.trim() || "Document", opts.body ?? "", opts.subtitle);

  // ---- paginate ----
  const pages: Line[][] = [];
  let page: Line[] = [];
  let y = PAGE_H - MARGIN;
  for (const line of lines) {
    const lead = line.style === "h1" ? H1_SIZE + 8 : line.style === "h2" ? H2_SIZE + 5 : BODY_LEAD;
    const needed = lead + line.spaceBefore;
    if (y - needed < MARGIN) {
      pages.push(page);
      page = [];
      y = PAGE_H - MARGIN;
    }
    y -= needed;
    page.push({ ...line, spaceBefore: needed });
  }
  pages.push(page);

  // ---- content streams ----
  const streams = pages.map((pageLines) => {
    const ops: string[] = ["BT"];
    let cursor = PAGE_H - MARGIN;
    let first = true;
    for (const line of pageLines) {
      cursor -= line.spaceBefore;
      const x = MARGIN + (line.style === "bullet" ? 0 : 0);
      if (first) {
        ops.push(`1 0 0 1 ${x} ${cursor.toFixed(2)} Tm`);
        first = false;
      } else {
        ops.push(`1 0 0 1 ${x} ${cursor.toFixed(2)} Tm`);
      }
      // Headings and meta lines get their own tone so a long report has shape.
      const gray = line.style === "meta" ? "0.45 0.45 0.45 rg" : "0 0 0 rg";
      ops.push(gray);
      ops.push(`/${FONT_OF[line.style]} ${SIZE_OF[line.style]} Tf`);
      ops.push(`(${pdfString(line.text)}) Tj`);
    }
    ops.push("ET");
    return ops.join("\n");
  });

  // ---- assemble the file ----
  // Object numbering: 1 catalog, 2 pages, 3 F1, 4 F2, then per page a page
  // object and its content stream.
  const objects: string[] = [];
  const pageObjNums: number[] = [];
  const FIRST_PAGE_OBJ = 5;
  for (let i = 0; i < pages.length; i++) pageObjNums.push(FIRST_PAGE_OBJ + i * 2);

  objects[1] = "<< /Type /Catalog /Pages 2 0 R >>";
  objects[2] =
    `<< /Type /Pages /Count ${pages.length} /Kids [${pageObjNums.map((n) => `${n} 0 R`).join(" ")}] >>`;
  objects[3] = "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>";
  objects[4] = "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>";

  streams.forEach((stream, i) => {
    const pageNum = pageObjNums[i];
    const contentNum = pageNum + 1;
    objects[pageNum] =
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PAGE_W} ${PAGE_H}] ` +
      `/Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> /Contents ${contentNum} 0 R >>`;
    objects[contentNum] =
      `<< /Length ${Buffer.byteLength(stream, "latin1")} >>\nstream\n${stream}\nendstream`;
  });

  const chunks: Buffer[] = [];
  let offset = 0;
  const push = (s: string) => {
    const b = Buffer.from(s, "latin1");
    chunks.push(b);
    offset += b.length;
  };

  const header = "%PDF-1.4\n%\xE2\xE3\xCF\xD3\n";
  push(header);

  const xref: number[] = [];
  for (let n = 1; n < objects.length; n++) {
    if (!objects[n]) continue;
    xref[n] = offset;
    push(`${n} 0 obj\n${objects[n]}\nendobj\n`);
  }

  const xrefStart = offset;
  const maxObj = objects.length;
  let table = `xref\n0 ${maxObj}\n0000000000 65535 f \n`;
  for (let n = 1; n < maxObj; n++) {
    table += `${String(xref[n] ?? 0).padStart(10, "0")} 00000 n \n`;
  }
  push(table);
  push(`trailer\n<< /Size ${maxObj} /Root 1 0 R >>\nstartxref\n${xrefStart}\n%%EOF\n`);

  return Buffer.concat(chunks);
}
