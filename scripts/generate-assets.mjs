#!/usr/bin/env node
/**
 * Generates the cosigno identity assets into public/ from the deterministic
 * geometry in scripts/logo-geometry.mjs (mirrored by src/components/brand/
 * Logo.tsx). Clean, flat vector only — no gradients, shadows, or 3D. The icon
 * is the C + integrated check (NO dot; the orange dot lives over the wordmark's
 * "i"). Requires only `sharp` for rasterizing PNGs; the .ico is hand-built.
 *
 *   SVG (committed):
 *     logo.svg, favicon.svg (adaptive), mask-icon.svg,
 *     logo-icon-light/dark/oled.svg, logo-mono-black/white.svg,
 *     logo-lockup.svg (+ -dark/-oled)
 *   PNG (generated): icon-16/32/192/512, apple-touch-icon, og.png, favicon.ico
 */
import { writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import sharp from "sharp";
import { INK, SIGNAL, CREAM, WHITE, BLACK, C, CHECK } from "./logo-geometry.mjs";

const INK_SOFT = "#5C5650";
const PUB = join(process.cwd(), "public");
mkdirSync(PUB, { recursive: true });

/** The two-path icon (C + integrated check), colored explicitly. No dot. */
function markPaths(cColor, checkColor) {
  return `
  <path d="${C.d}" fill="none" stroke="${cColor}" stroke-width="${C.stroke}" stroke-linecap="round"/>
  <path d="${CHECK.d}" fill="none" stroke="${checkColor}" stroke-width="${CHECK.stroke}" stroke-linecap="round" stroke-linejoin="round"/>`;
}

/** A standalone icon SVG. `bg` fills a rounded-square plate; null = transparent. */
function iconSvg({ size = 100, pad = 8, cColor = SIGNAL, checkColor = INK, bg = null, radius = 0.22 }) {
  const scale = (size - pad * 2) / 160;
  const plate = bg ? `<rect width="${size}" height="${size}" rx="${size * radius}" fill="${bg}"/>` : "";
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
  ${plate}
  <g transform="translate(${pad},${pad}) scale(${scale})">${markPaths(cColor, checkColor)}</g>
</svg>`;
}

/** Theme-adaptive transparent icon (check repaints ink→cream via the OS theme). */
function adaptiveIconSvg({ size = 100, pad = 20 }) {
  const scale = (size - pad * 2) / 160;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
  <style>.k{stroke:${INK}}@media (prefers-color-scheme:dark){.k{stroke:${CREAM}}}</style>
  <g transform="translate(${pad},${pad}) scale(${scale})">
  <path d="${C.d}" fill="none" stroke="${SIGNAL}" stroke-width="${C.stroke}" stroke-linecap="round"/>
  <path d="${CHECK.d}" fill="none" class="k" stroke-width="${CHECK.stroke}" stroke-linecap="round" stroke-linejoin="round"/>
  </g>
</svg>`;
}

/** "cosigno" wordmark with the orange i-dot, at (x,y) baseline. */
function wordmark(x, y, fs, dotR, dotDx, dotDy, fill = INK) {
  return `<text x="${x}" y="${y}" font-family="Poppins, DejaVu Sans, sans-serif" font-weight="900" font-size="${fs}" letter-spacing="-2" fill="${fill}">cos<tspan>ı</tspan>gno</text>
  <circle cx="${x + dotDx}" cy="${y - dotDy}" r="${dotR}" fill="${SIGNAL}"/>`;
}

/** Full horizontal lockup (icon + wordmark). */
function lockupSvg({ cColor = SIGNAL, checkColor = INK, wordFill = INK, bg = null } = {}) {
  const plate = bg ? `<rect width="300" height="88" fill="${bg}"/>` : "";
  return `<svg xmlns="http://www.w3.org/2000/svg" width="300" height="88" viewBox="0 0 300 88" role="img" aria-label="cosigno">
  ${plate}
  <g transform="translate(2,11) scale(0.42)">${markPaths(cColor, checkColor)}</g>
  ${wordmark(80, 62, 46, 4.2, 78, 30, wordFill)}
</svg>`;
}

function maskIconSvg() {
  // Single-color silhouette Safari recolors. No dot.
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 160 160">
  <path d="${C.d}" fill="none" stroke="#000" stroke-width="${C.stroke}" stroke-linecap="round"/>
  <path d="${CHECK.d}" fill="none" stroke="#000" stroke-width="${CHECK.stroke}" stroke-linecap="round" stroke-linejoin="round"/>
</svg>`;
}

/** OG hero: flat mark + wordmark + tagline on the cream field. */
function ogSvg() {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630">
  <rect width="1200" height="630" fill="${CREAM}"/>
  <g transform="translate(600,232) scale(1.85) translate(-80,-80)">${markPaths(SIGNAL, INK)}</g>
  ${wordmark(600 - 158, 452, 88, 8, 150, 57, INK)}
  <text x="600" y="524" text-anchor="middle" font-family="Poppins, DejaVu Sans, sans-serif" font-weight="800" font-size="30" fill="${INK_SOFT}">the AI operator that asks first.</text>
</svg>`;
}

/* --- minimal ICO writer (PNG-in-ICO; supported by every modern browser) --- */
function buildIco(images) {
  // images: [{ size, buffer }]
  const count = images.length;
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0); // reserved
  header.writeUInt16LE(1, 2); // type: icon
  header.writeUInt16LE(count, 4);
  const dir = Buffer.alloc(16 * count);
  let offset = 6 + 16 * count;
  const blobs = [];
  images.forEach((img, i) => {
    const b = i * 16;
    dir.writeUInt8(img.size >= 256 ? 0 : img.size, b + 0); // width
    dir.writeUInt8(img.size >= 256 ? 0 : img.size, b + 1); // height
    dir.writeUInt8(0, b + 2); // color count
    dir.writeUInt8(0, b + 3); // reserved
    dir.writeUInt16LE(1, b + 4); // planes
    dir.writeUInt16LE(32, b + 6); // bit count
    dir.writeUInt32LE(img.buffer.length, b + 8); // bytes in resource
    dir.writeUInt32LE(offset, b + 12); // image offset
    offset += img.buffer.length;
    blobs.push(img.buffer);
  });
  return Buffer.concat([header, dir, ...blobs]);
}

async function main() {
  // --- committed SVGs -------------------------------------------------------
  writeFileSync(join(PUB, "logo.svg"), iconSvg({ size: 100, pad: 8 })); // light icon
  writeFileSync(join(PUB, "favicon.svg"), adaptiveIconSvg({ size: 100, pad: 20 }));
  writeFileSync(join(PUB, "mask-icon.svg"), maskIconSvg());

  // themed standalone icons (deliverables)
  writeFileSync(join(PUB, "logo-icon-light.svg"), iconSvg({ cColor: SIGNAL, checkColor: INK }));
  writeFileSync(join(PUB, "logo-icon-dark.svg"), iconSvg({ cColor: SIGNAL, checkColor: CREAM }));
  writeFileSync(join(PUB, "logo-icon-oled.svg"), iconSvg({ cColor: SIGNAL, checkColor: SIGNAL }));
  writeFileSync(join(PUB, "logo-mono-black.svg"), iconSvg({ cColor: INK, checkColor: INK }));
  writeFileSync(join(PUB, "logo-mono-white.svg"), iconSvg({ cColor: WHITE, checkColor: WHITE }));

  // full lockups (deliverables)
  writeFileSync(join(PUB, "logo-lockup.svg"), lockupSvg({ cColor: SIGNAL, checkColor: INK, wordFill: INK }));
  writeFileSync(join(PUB, "logo-lockup-dark.svg"), lockupSvg({ cColor: SIGNAL, checkColor: CREAM, wordFill: CREAM, bg: INK }));
  writeFileSync(join(PUB, "logo-lockup-oled.svg"), lockupSvg({ cColor: SIGNAL, checkColor: SIGNAL, wordFill: WHITE, bg: BLACK }));

  // --- app icons: orange C + ink check on a cream rounded plate -------------
  const plated = (s, pad) =>
    sharp(Buffer.from(iconSvg({ size: s, pad, cColor: SIGNAL, checkColor: INK, bg: CREAM, radius: 0.2 }))).png();
  await plated(192, 34).toFile(join(PUB, "icon-192.png"));
  await plated(512, 92).toFile(join(PUB, "icon-512.png"));
  await plated(180, 30).toFile(join(PUB, "apple-touch-icon.png"));

  // --- favicons: transparent, adaptive (orange C reads on any tab bar) ------
  const tab = (s, pad) => sharp(Buffer.from(adaptiveIconSvg({ size: s, pad }))).png();
  await tab(16, 1).toFile(join(PUB, "icon-16.png"));
  await tab(32, 3).toFile(join(PUB, "icon-32.png"));

  const f16 = await sharp(Buffer.from(adaptiveIconSvg({ size: 16, pad: 1 }))).png().toBuffer();
  const f32 = await sharp(Buffer.from(adaptiveIconSvg({ size: 32, pad: 3 }))).png().toBuffer();
  const f48 = await sharp(Buffer.from(adaptiveIconSvg({ size: 48, pad: 5 }))).png().toBuffer();
  writeFileSync(
    join(PUB, "favicon.ico"),
    buildIco([
      { size: 16, buffer: f16 },
      { size: 32, buffer: f32 },
      { size: 48, buffer: f48 },
    ])
  );

  await sharp(Buffer.from(ogSvg())).png().toFile(join(PUB, "og.png"));

  console.log("assets written to public/ — flat vector, exact tokens, no dot.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
