import { xmlEscape, zip } from "./zip";

/**
 * Word documents, written directly as OOXML.
 *
 * Same input as the PDF writer — plain text with "Heading:" lines and "- "
 * bullets — so one authored document can come out as either format without
 * being written twice. The difference is that a .docx is EDITABLE: a report
 * someone has to revise before sending should not arrive frozen in a PDF.
 */

const CONTENT_TYPES = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
<Default Extension="xml" ContentType="application/xml"/>
<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
<Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>
<Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>
</Types>`;

const ROOT_RELS = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/>
</Relationships>`;

const DOC_RELS = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
</Relationships>`;

/**
 * Named styles, so headings are real Word headings — they show up in the
 * navigation pane and in a generated table of contents. Hard-coded formatting
 * would look the same and do neither.
 */
const STYLES = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
<w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="Calibri" w:hAnsi="Calibri"/><w:sz w:val="22"/></w:rPr></w:rPrDefault></w:docDefaults>
<w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/><w:pPr><w:spacing w:after="160" w:line="259" w:lineRule="auto"/></w:pPr></w:style>
<w:style w:type="paragraph" w:styleId="Title"><w:name w:val="Title"/><w:basedOn w:val="Normal"/><w:pPr><w:spacing w:after="240"/></w:pPr><w:rPr><w:b/><w:sz w:val="52"/></w:rPr></w:style>
<w:style w:type="paragraph" w:styleId="Subtitle"><w:name w:val="Subtitle"/><w:basedOn w:val="Normal"/><w:rPr><w:color w:val="666666"/><w:sz w:val="20"/></w:rPr></w:style>
<w:style w:type="paragraph" w:styleId="Heading1"><w:name w:val="heading 1"/><w:basedOn w:val="Normal"/><w:pPr><w:outlineLvl w:val="0"/><w:spacing w:before="360" w:after="120"/></w:pPr><w:rPr><w:b/><w:sz w:val="30"/></w:rPr></w:style>
<w:style w:type="paragraph" w:styleId="ListParagraph"><w:name w:val="List Paragraph"/><w:basedOn w:val="Normal"/><w:pPr><w:ind w:left="720"/><w:spacing w:after="60"/></w:pPr></w:style>
</w:styles>`;

function para(text: string, style?: string): string {
  const props = style ? `<w:pPr><w:pStyle w:val="${style}"/></w:pPr>` : "";
  // xml:space="preserve" keeps leading/trailing spaces, which Word would
  // otherwise silently collapse.
  return `<w:p>${props}<w:r><w:t xml:space="preserve">${xmlEscape(text)}</w:t></w:r></w:p>`;
}

/** Turn the shared plain-text shape into styled Word paragraphs. */
function bodyParagraphs(body: string): string {
  const out: string[] = [];
  for (const block of body.split(/\n{2,}/)) {
    const lines = block.split("\n").filter((l) => l.trim());
    if (lines.length === 0) continue;

    const bulleted = lines.every((l) => /^\s*[-•*]\s+|^\s*\d+[.)]\s+/.test(l));
    if (bulleted) {
      for (const l of lines) {
        const clean = l.replace(/^\s*[-•*]\s+/, "").replace(/^\s*\d+[.)]\s+/, "");
        out.push(para(`• ${clean}`, "ListParagraph"));
      }
      continue;
    }
    if (lines.length === 1 && lines[0].length < 80 && lines[0].trim().endsWith(":")) {
      out.push(para(lines[0].replace(/:$/, ""), "Heading1"));
      continue;
    }
    out.push(para(lines.join(" ")));
  }
  return out.join("");
}

export function renderDocx(opts: { title: string; body: string; subtitle?: string }): Buffer {
  const title = opts.title.trim() || "Document";
  const parts = [
    para(title, "Title"),
    opts.subtitle ? para(opts.subtitle, "Subtitle") : "",
    bodyParagraphs(opts.body ?? ""),
  ].join("");

  const document = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
<w:body>${parts}<w:sectPr><w:pgSz w:w="12240" w:h="15840"/><w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440"/></w:sectPr></w:body>
</w:document>`;

  const core = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/">
<dc:title>${xmlEscape(title)}</dc:title><dc:creator>cosigno</dc:creator><cp:lastModifiedBy>cosigno</cp:lastModifiedBy>
</cp:coreProperties>`;

  return zip([
    { path: "[Content_Types].xml", data: CONTENT_TYPES },
    { path: "_rels/.rels", data: ROOT_RELS },
    { path: "docProps/core.xml", data: core },
    { path: "word/_rels/document.xml.rels", data: DOC_RELS },
    { path: "word/styles.xml", data: STYLES },
    { path: "word/document.xml", data: document },
  ]);
}
