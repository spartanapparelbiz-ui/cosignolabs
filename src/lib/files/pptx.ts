import { xmlEscape, zip } from "./zip";

/**
 * PowerPoint decks, written directly as OOXML.
 *
 * A deck is the one deliverable people cannot reasonably rebuild from prose —
 * turning a written summary into slides is an hour of manual work every time.
 * Input is a title and a list of slides, each with a heading and bullets,
 * which is the shape a summary already has.
 *
 * PPTX is the fussiest of the three formats: a slide is only valid if a
 * layout, a master, and a theme all exist and reference each other correctly.
 * All four parts are written here, minimally but completely — a deck missing
 * any of them opens as "repair needed".
 */

const NS_P = "http://schemas.openxmlformats.org/presentationml/2006/main";
const NS_A = "http://schemas.openxmlformats.org/drawingml/2006/main";
const NS_R = "http://schemas.openxmlformats.org/officeDocument/2006/relationships";

/** 16:9 at the standard 12192000 x 6858000 EMU. */
const SLIDE_W = 12192000;
const SLIDE_H = 6858000;

export interface Slide {
  heading: string;
  bullets?: string[];
  /** Free text shown instead of bullets (used for a title slide subtitle). */
  note?: string;
}

function contentTypes(slideCount: number): string {
  const slides = Array.from(
    { length: slideCount },
    (_, i) =>
      `<Override PartName="/ppt/slides/slide${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slide+xml"/>`
  ).join("");
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
<Default Extension="xml" ContentType="application/xml"/>
<Override PartName="/ppt/presentation.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.presentation.main+xml"/>
<Override PartName="/ppt/slideMasters/slideMaster1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slideMaster+xml"/>
<Override PartName="/ppt/slideLayouts/slideLayout1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slideLayout+xml"/>
<Override PartName="/ppt/theme/theme1.xml" ContentType="application/vnd.openxmlformats-officedocument.theme+xml"/>
${slides}</Types>`;
}

const ROOT_RELS = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="${NS_R}/officeDocument" Target="ppt/presentation.xml"/>
</Relationships>`;

/** A deliberately plain theme: one font, a neutral palette, no decoration. */
const THEME = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<a:theme xmlns:a="${NS_A}" name="cosigno">
<a:themeElements>
<a:clrScheme name="cosigno">
<a:dk1><a:sysClr val="windowText" lastClr="000000"/></a:dk1><a:lt1><a:sysClr val="window" lastClr="FFFFFF"/></a:lt1>
<a:dk2><a:srgbClr val="1A1A1A"/></a:dk2><a:lt2><a:srgbClr val="F5F2EA"/></a:lt2>
<a:accent1><a:srgbClr val="D8E64A"/></a:accent1><a:accent2><a:srgbClr val="4A5568"/></a:accent2>
<a:accent3><a:srgbClr val="718096"/></a:accent3><a:accent4><a:srgbClr val="A0AEC0"/></a:accent4>
<a:accent5><a:srgbClr val="CBD5E0"/></a:accent5><a:accent6><a:srgbClr val="2D3748"/></a:accent6>
<a:hlink><a:srgbClr val="0563C1"/></a:hlink><a:folHlink><a:srgbClr val="954F72"/></a:folHlink>
</a:clrScheme>
<a:fontScheme name="cosigno">
<a:majorFont><a:latin typeface="Calibri Light"/><a:ea typeface=""/><a:cs typeface=""/></a:majorFont>
<a:minorFont><a:latin typeface="Calibri"/><a:ea typeface=""/><a:cs typeface=""/></a:minorFont>
</a:fontScheme>
<a:fmtScheme name="cosigno">
<a:fillStyleLst><a:solidFill><a:schemeClr val="phClr"/></a:solidFill><a:solidFill><a:schemeClr val="phClr"/></a:solidFill><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:fillStyleLst>
<a:lnStyleLst><a:ln w="6350"><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:ln><a:ln w="12700"><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:ln><a:ln w="19050"><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:ln></a:lnStyleLst>
<a:effectStyleLst><a:effectStyle><a:effectLst/></a:effectStyle><a:effectStyle><a:effectLst/></a:effectStyle><a:effectStyle><a:effectLst/></a:effectStyle></a:effectStyleLst>
<a:bgFillStyleLst><a:solidFill><a:schemeClr val="phClr"/></a:solidFill><a:solidFill><a:schemeClr val="phClr"/></a:solidFill><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:bgFillStyleLst>
</a:fmtScheme>
</a:themeElements>
</a:theme>`;

const SLIDE_MASTER = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<p:sldMaster xmlns:p="${NS_P}" xmlns:a="${NS_A}" xmlns:r="${NS_R}">
<p:cSld><p:spTree>
<p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr>
<p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/><a:chOff x="0" y="0"/><a:chExt cx="0" cy="0"/></a:xfrm></p:grpSpPr>
</p:spTree></p:cSld>
<p:clrMap bg1="lt1" tx1="dk1" bg2="lt2" tx2="dk2" accent1="accent1" accent2="accent2" accent3="accent3" accent4="accent4" accent5="accent5" accent6="accent6" hlink="hlink" folHlink="folHlink"/>
<p:sldLayoutIdLst><p:sldLayoutId id="2147483649" r:id="rId1"/></p:sldLayoutIdLst>
</p:sldMaster>`;

const SLIDE_MASTER_RELS = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="${NS_R}/slideLayout" Target="../slideLayouts/slideLayout1.xml"/>
<Relationship Id="rId2" Type="${NS_R}/theme" Target="../theme/theme1.xml"/>
</Relationships>`;

const SLIDE_LAYOUT = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<p:sldLayout xmlns:p="${NS_P}" xmlns:a="${NS_A}" xmlns:r="${NS_R}" type="blank" preserve="1">
<p:cSld name="Blank"><p:spTree>
<p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr>
<p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/><a:chOff x="0" y="0"/><a:chExt cx="0" cy="0"/></a:xfrm></p:grpSpPr>
</p:spTree></p:cSld>
<p:clrMapOvr><a:overrideClrMapping bg1="lt1" tx1="dk1" bg2="lt2" tx2="dk2" accent1="accent1" accent2="accent2" accent3="accent3" accent4="accent4" accent5="accent5" accent6="accent6" hlink="hlink" folHlink="folHlink"/></p:clrMapOvr>
</p:sldLayout>`;

const SLIDE_LAYOUT_RELS = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="${NS_R}/slideMaster" Target="../slideMasters/slideMaster1.xml"/>
</Relationships>`;

const SLIDE_RELS = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="${NS_R}/slideLayout" Target="../slideLayouts/slideLayout1.xml"/>
</Relationships>`;

/** A text box. Coordinates and sizes are EMU (914400 per inch). */
function textBox(
  id: number,
  name: string,
  x: number,
  y: number,
  cx: number,
  cy: number,
  paragraphs: string
): string {
  return `<p:sp>
<p:nvSpPr><p:cNvPr id="${id}" name="${xmlEscape(name)}"/><p:cNvSpPr txBox="1"/><p:nvPr/></p:nvSpPr>
<p:spPr><a:xfrm><a:off x="${x}" y="${y}"/><a:ext cx="${cx}" cy="${cy}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom><a:noFill/></p:spPr>
<p:txBody><a:bodyPr wrap="square"><a:normAutofit/></a:bodyPr><a:lstStyle/>${paragraphs}</p:txBody>
</p:sp>`;
}

function paragraph(text: string, size: number, bold = false, bullet = false): string {
  const props = bullet
    ? `<a:pPr marL="285750" indent="-285750"><a:buChar char="•"/></a:pPr>`
    : `<a:pPr><a:buNone/></a:pPr>`;
  return `<a:p>${props}<a:r><a:rPr lang="en-US" sz="${size}"${bold ? ' b="1"' : ""}/><a:t>${xmlEscape(text)}</a:t></a:r></a:p>`;
}

function slideXml(slide: Slide, isTitle: boolean): string {
  const shapes: string[] = [];

  shapes.push(
    textBox(
      2,
      "Heading",
      838200,
      isTitle ? 2200000 : 685800,
      SLIDE_W - 1676400,
      isTitle ? 1600000 : 1000000,
      paragraph(slide.heading, isTitle ? 4400 : 3200, true)
    )
  );

  const body: string[] = [];
  if (slide.note) body.push(paragraph(slide.note, isTitle ? 2000 : 1800));
  for (const b of slide.bullets ?? []) body.push(paragraph(b, 1800, false, true));

  if (body.length > 0) {
    shapes.push(
      textBox(
        3,
        "Body",
        838200,
        isTitle ? 3900000 : 1905000,
        SLIDE_W - 1676400,
        SLIDE_H - (isTitle ? 4300000 : 2400000),
        body.join("")
      )
    );
  }

  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<p:sld xmlns:p="${NS_P}" xmlns:a="${NS_A}" xmlns:r="${NS_R}">
<p:cSld><p:spTree>
<p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr>
<p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/><a:chOff x="0" y="0"/><a:chExt cx="0" cy="0"/></a:xfrm></p:grpSpPr>
${shapes.join("")}
</p:spTree></p:cSld>
<p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr>
</p:sld>`;
}

export function renderPptx(opts: { title: string; slides: Slide[]; subtitle?: string }): Buffer {
  // The title slide is always present, so a deck is never zero slides — an
  // empty presentation is a file PowerPoint refuses to open.
  const all: Slide[] = [
    { heading: opts.title.trim() || "Presentation", note: opts.subtitle },
    ...(opts.slides ?? []),
  ];

  // Slide ids must start at 256 per the spec.
  const slideIds = all
    .map((_, i) => `<p:sldId id="${256 + i}" r:id="rId${i + 2}"/>`)
    .join("");
  const slideRels = all
    .map(
      (_, i) =>
        `<Relationship Id="rId${i + 2}" Type="${NS_R}/slide" Target="slides/slide${i + 1}.xml"/>`
    )
    .join("");

  const presentation = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<p:presentation xmlns:p="${NS_P}" xmlns:a="${NS_A}" xmlns:r="${NS_R}">
<p:sldMasterIdLst><p:sldMasterId id="2147483648" r:id="rId1"/></p:sldMasterIdLst>
<p:sldIdLst>${slideIds}</p:sldIdLst>
<p:sldSz cx="${SLIDE_W}" cy="${SLIDE_H}"/><p:notesSz cx="${SLIDE_H}" cy="${SLIDE_W}"/>
</p:presentation>`;

  const presentationRels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="${NS_R}/slideMaster" Target="slideMasters/slideMaster1.xml"/>
${slideRels}
<Relationship Id="rId${all.length + 2}" Type="${NS_R}/theme" Target="theme/theme1.xml"/>
</Relationships>`;

  return zip([
    { path: "[Content_Types].xml", data: contentTypes(all.length) },
    { path: "_rels/.rels", data: ROOT_RELS },
    { path: "ppt/_rels/presentation.xml.rels", data: presentationRels },
    { path: "ppt/presentation.xml", data: presentation },
    { path: "ppt/theme/theme1.xml", data: THEME },
    { path: "ppt/slideMasters/slideMaster1.xml", data: SLIDE_MASTER },
    { path: "ppt/slideMasters/_rels/slideMaster1.xml.rels", data: SLIDE_MASTER_RELS },
    { path: "ppt/slideLayouts/slideLayout1.xml", data: SLIDE_LAYOUT },
    { path: "ppt/slideLayouts/_rels/slideLayout1.xml.rels", data: SLIDE_LAYOUT_RELS },
    ...all.flatMap((slide, i) => [
      { path: `ppt/slides/slide${i + 1}.xml`, data: slideXml(slide, i === 0) },
      { path: `ppt/slides/_rels/slide${i + 1}.xml.rels`, data: SLIDE_RELS },
    ]),
  ]);
}

/**
 * Turn a written document into slides: "Heading:" lines become slides, and
 * the bullets and sentences under them become that slide's points. Prose with
 * no headings becomes one slide per paragraph block, capped so a long report
 * doesn't explode into eighty slides.
 */
export function slidesFromText(body: string, maxSlides = 20): Slide[] {
  const slides: Slide[] = [];
  let current: Slide | null = null;

  for (const block of body.split(/\n{2,}/)) {
    const lines = block.split("\n").filter((l) => l.trim());
    if (lines.length === 0) continue;

    const isHeading = lines.length === 1 && lines[0].length < 80 && lines[0].trim().endsWith(":");
    if (isHeading) {
      if (current) slides.push(current);
      current = { heading: lines[0].replace(/:$/, ""), bullets: [] };
      continue;
    }

    const points = lines.every((l) => /^\s*[-•*]\s+|^\s*\d+[.)]\s+/.test(l))
      ? lines.map((l) => l.replace(/^\s*[-•*]\s+/, "").replace(/^\s*\d+[.)]\s+/, ""))
      : // A prose block becomes at most three points, so a slide stays a slide
        // rather than a page of text nobody can read from the back of a room.
        lines.join(" ").split(/(?<=[.!?])\s+/).filter(Boolean).slice(0, 3);

    if (!current) current = { heading: "Overview", bullets: [] };
    current.bullets!.push(...points.map((p) => p.trim()).filter(Boolean));
  }
  if (current) slides.push(current);

  return slides
    .filter((s) => s.heading || (s.bullets?.length ?? 0) > 0)
    .slice(0, maxSlides)
    .map((s) => ({ ...s, bullets: (s.bullets ?? []).slice(0, 8) }));
}
