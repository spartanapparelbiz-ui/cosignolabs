import { describe, expect, it } from "vitest";
import { inflateRawSync } from "node:zlib";
import { FORMATS, formatOf, render } from "../src/lib/files/formats";
import { zip, xmlEscape } from "../src/lib/files/zip";
import { columnName, detectTable, parseDelimited } from "../src/lib/files/xlsx";
import { slidesFromText } from "../src/lib/files/pptx";

/**
 * Producing files.
 *
 * Every format here is a REAL file, not a renamed text blob. A .docx that
 * Word refuses to open is worse than no .docx at all — the user only finds
 * out after they have sent it to someone. So these assert structure: the ZIP
 * container is valid, the XML parts parse, and the parts the format spec
 * requires are actually present.
 */

/** Read a stored/deflated entry back out of one of our archives. */
function readZipEntries(buf: Buffer): Map<string, Buffer> {
  const entries = new Map<string, Buffer>();
  // Walk local file headers. Enough of a reader to prove what we wrote.
  let i = 0;
  while (i < buf.length - 4 && buf.readUInt32LE(i) === 0x04034b50) {
    const method = buf.readUInt16LE(i + 8);
    const compSize = buf.readUInt32LE(i + 18);
    const nameLen = buf.readUInt16LE(i + 26);
    const extraLen = buf.readUInt16LE(i + 28);
    const name = buf.subarray(i + 30, i + 30 + nameLen).toString("utf8");
    const start = i + 30 + nameLen + extraLen;
    const body = buf.subarray(start, start + compSize);
    entries.set(name, method === 8 ? inflateRawSync(body) : Buffer.from(body));
    i = start + compSize;
  }
  return entries;
}

const REPORT = `The sweatshirt is navy & laid flat on light wood.

Condition:

- Pilling on the left sleeve
- Collar has lost elasticity

Recommendation:

- List as "good", not "excellent"`;

describe("the ZIP container", () => {
  it("produces an archive whose entries decompress to exactly what went in", () => {
    const original = "hello <world> & \"friends\"".repeat(50);
    const archive = zip([{ path: "a/b.txt", data: original }]);
    expect(archive.readUInt32LE(0)).toBe(0x04034b50);
    const entries = readZipEntries(archive);
    expect(entries.get("a/b.txt")!.toString("utf8")).toBe(original);
  });

  it("ends with a central directory record, or no reader will open it", () => {
    const archive = zip([{ path: "x.txt", data: "x" }]);
    // End-of-central-directory signature must be present near the tail.
    expect(archive.subarray(-22).readUInt32LE(0)).toBe(0x06054b50);
  });

  it("escapes XML so an ampersand can't break the document", () => {
    // An unescaped & is the single most common cause of "Word cannot open
    // this file because there is a problem with the contents".
    expect(xmlEscape('a & b < c > d "e" \'f\'')).toBe("a &amp; b &lt; c &gt; d &quot;e&quot; &apos;f&apos;");
    // Characters XML 1.0 cannot represent are dropped, not escaped.
    expect(xmlEscape("bad\x00\x08char")).toBe("badchar");
  });
});

describe("Word documents", () => {
  const buf = render("docx", { title: "Report & Notes", body: REPORT, subtitle: "cosigno" });
  const parts = readZipEntries(buf);

  it("contains every part the format requires", () => {
    for (const required of [
      "[Content_Types].xml",
      "_rels/.rels",
      "word/document.xml",
      "word/styles.xml",
      "word/_rels/document.xml.rels",
    ]) {
      expect(parts.has(required)).toBe(true);
    }
  });

  it("escapes the content, so a stray ampersand doesn't corrupt the file", () => {
    const doc = parts.get("word/document.xml")!.toString("utf8");
    expect(doc).toContain("Report &amp; Notes");
    expect(doc).toContain("navy &amp; laid flat");
    // No raw ampersand may survive anywhere in the XML.
    expect(/&(?!amp;|lt;|gt;|quot;|apos;|#)/.test(doc)).toBe(false);
  });

  it("uses real heading and list styles, not just bigger text", () => {
    const doc = parts.get("word/document.xml")!.toString("utf8");
    // Real styles are what put headings in the navigation pane and let a
    // table of contents generate itself.
    expect(doc).toContain('w:pStyle w:val="Heading1"');
    expect(doc).toContain('w:pStyle w:val="ListParagraph"');
    expect(doc).toContain('w:pStyle w:val="Title"');
  });
});

describe("spreadsheets", () => {
  it("finds a markdown table and writes it as rows", () => {
    const table = `| Item | Price |\n|---|---|\n| Crewneck | 32.00 |\n| Hoodie | 45.50 |`;
    const rows = detectTable(table);
    expect(rows).toEqual([
      ["Item", "Price"],
      ["Crewneck", "32.00"],
      ["Hoodie", "45.50"],
    ]);
  });

  it("writes numbers as numbers and everything else as text", () => {
    const table = `| Field | Value |\n|---|---|\n| zip | 07030 |\n| phone | +15551234567 |\n| qty | 42 |\n| price | 19.99 |`;
    const sheet = readZipEntries(render("xlsx", { title: "Guard", body: table }))
      .get("xl/worksheets/sheet1.xml")!
      .toString("utf8");

    // Real numbers become numeric cells.
    expect(sheet).toMatch(/<c r="B4"[^>]*><v>42<\/v>/);
    expect(sheet).toMatch(/<c r="B5"[^>]*><v>19.99<\/v>/);

    // These only LOOK numeric. Coercing them corrupts the data — a zip code
    // loses its leading zero and a phone number becomes an integer.
    expect(sheet).toContain("07030");
    expect(sheet).toMatch(/<c r="B2"[^>]*t="inlineStr"/);
    expect(sheet).toMatch(/<c r="B3"[^>]*t="inlineStr"/);
  });

  it("does not mistake ordinary prose for a table", () => {
    expect(detectTable("Hello, this is a sentence with commas, but is not a table.")).toBeNull();
    expect(detectTable("one line only")).toBeNull();
  });

  it("still produces an openable sheet from prose", () => {
    const parts = readZipEntries(render("xlsx", { title: "Prose", body: REPORT }));
    expect(parts.has("xl/worksheets/sheet1.xml")).toBe(true);
    expect(parts.has("xl/workbook.xml")).toBe(true);
  });

  it("parses quoted CSV fields, escaped quotes, and embedded commas", () => {
    const rows = parseDelimited('a,"b,c","say ""hi"""\n1,2,3');
    expect(rows).toEqual([
      ["a", "b,c", 'say "hi"'],
      ["1", "2", "3"],
    ]);
  });

  it("names columns past Z correctly", () => {
    expect(columnName(0)).toBe("A");
    expect(columnName(25)).toBe("Z");
    expect(columnName(26)).toBe("AA");
    expect(columnName(701)).toBe("ZZ");
    expect(columnName(702)).toBe("AAA");
  });
});

describe("slide decks", () => {
  const buf = render("pptx", { title: "Condition report", body: REPORT, subtitle: "cosigno" });
  const parts = readZipEntries(buf);

  it("includes the master, layout, and theme a slide needs to open", () => {
    // A deck missing any of these opens as "repair needed" — the parts are
    // not optional even though nothing visibly uses them.
    for (const required of [
      "[Content_Types].xml",
      "ppt/presentation.xml",
      "ppt/slideMasters/slideMaster1.xml",
      "ppt/slideLayouts/slideLayout1.xml",
      "ppt/theme/theme1.xml",
      "ppt/slides/slide1.xml",
    ]) {
      expect(parts.has(required)).toBe(true);
    }
  });

  it("declares every slide in content types and in the relationships", () => {
    const slideCount = [...parts.keys()].filter((k) => /^ppt\/slides\/slide\d+\.xml$/.test(k)).length;
    const types = parts.get("[Content_Types].xml")!.toString("utf8");
    const rels = parts.get("ppt/_rels/presentation.xml.rels")!.toString("utf8");
    for (let i = 1; i <= slideCount; i++) {
      // A slide that exists but isn't declared is a slide PowerPoint ignores.
      expect(types).toContain(`/ppt/slides/slide${i}.xml`);
      expect(rels).toContain(`slides/slide${i}.xml`);
      expect(parts.has(`ppt/slides/_rels/slide${i}.xml.rels`)).toBe(true);
    }
    expect(slideCount).toBeGreaterThan(1);
  });

  it("turns headings into slides and bullets into points", () => {
    const slides = slidesFromText(REPORT);
    expect(slides.map((s) => s.heading)).toContain("Condition");
    expect(slides.map((s) => s.heading)).toContain("Recommendation");
    const condition = slides.find((s) => s.heading === "Condition")!;
    expect(condition.bullets).toContain("Pilling on the left sleeve");
  });

  it("always has a title slide, so a deck is never empty", () => {
    const empty = readZipEntries(render("pptx", { title: "Nothing", body: "" }));
    expect(empty.has("ppt/slides/slide1.xml")).toBe(true);
  });
});

describe("the client bundle stays free of server-only code", () => {
  it("keeps client components on the catalog, never the renderers", async () => {
    const { readFileSync } = await import("node:fs");
    // The Office writers import `node:zlib`. A client component importing the
    // renderer module drags that Node built-in into the browser bundle and the
    // build fails outright — so the split has to be enforced, not remembered.
    for (const file of [
      "src/components/app/AnswerCard.tsx",
      "src/components/app/FilesPanel.tsx",
      "src/components/app/SourceComposer.tsx",
    ]) {
      const source = readFileSync(file, "utf8");
      expect(source).not.toContain('from "@/lib/files/formats"');
    }
  });

  it("keeps the catalog itself importable without any Node built-in", async () => {
    const { readFileSync } = await import("node:fs");
    const catalog = readFileSync("src/lib/files/formatList.ts", "utf8");
    expect(catalog).not.toMatch(/from "node:/);
    expect(catalog).not.toMatch(/from "\.\/(zip|pdf|docx|xlsx|pptx)"/);
  });

  it("offers exactly the same formats on both sides of that split", async () => {
    const client = await import("../src/lib/files/formatList");
    const server = await import("../src/lib/files/formats");
    // Two lists that can drift is how a picker ends up offering a format the
    // server rejects. They are the same list.
    expect(server.FORMATS.map((f) => f.id)).toEqual(client.FORMATS.map((f) => f.id));
  });
});

describe("the format registry", () => {
  it("renders every advertised format without throwing", () => {
    for (const f of FORMATS) {
      const buf = render(f.id, { title: "T", body: REPORT, subtitle: "s" });
      expect(buf.length).toBeGreaterThan(0);
      // A format the picker offers but that produces nothing is a broken
      // promise the user only discovers on click.
      expect(formatOf(f.id)).not.toBeNull();
    }
  });

  it("survives empty and hostile content instead of failing the download", () => {
    for (const f of FORMATS) {
      expect(render(f.id, { title: "", body: "" }).length).toBeGreaterThanOrEqual(0);
      expect(
        render(f.id, { title: "</w:t>&<script>", body: "]]>&amp;<>\x00\x08 emoji 🎉" }).length
      ).toBeGreaterThan(0);
    }
  });

  it("rejects a format it cannot produce, rather than silently sending text", () => {
    expect(formatOf("exe")).toBeNull();
    expect(formatOf("")).toBeNull();
  });

  it("writes a web page that needs no network to open", () => {
    const html = render("html", { title: "Report", body: REPORT }).toString("utf8");
    expect(html).toContain("<!doctype html>");
    // An external stylesheet or font would leave an emailed attachment
    // looking broken on a machine that is offline.
    expect(html).not.toMatch(/<(link|script)[^>]+(href|src)=/i);
    expect(html).toContain("<style>");
  });
});
