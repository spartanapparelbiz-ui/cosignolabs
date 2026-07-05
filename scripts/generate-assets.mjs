#!/usr/bin/env node
/**
 * Generates the cosigno identity assets into public/:
 *   logo.svg, logo-lockup.svg, favicon.ico, icon-192.png, icon-512.png,
 *   apple-touch-icon.png, og.png (1200×630)
 *
 * Requires: `npm i --no-save sharp png-to-ico` and Nunito Sans ExtraBold
 * installed locally (fontconfig) for the og image text. Colors mirror
 * src/lib/brand.ts.
 */
import { writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import sharp from "sharp";
import pngToIco from "png-to-ico";

const INK = "#141414";
const CREAM = "#FBF4EA";
const SIGNAL = "#FF4B1F";

const PUB = join(process.cwd(), "public");
mkdirSync(PUB, { recursive: true });

/** The C + check mark. `plate` adds a cream rounded plate behind it. */
function markSvg({ size, plate = false, pad = 0 }) {
  const inner = `
  <path d="M24 4a20 20 0 1 0 14.1 34.2l-6.4-6.4A11 11 0 1 1 35 24h9A20 20 0 0 0 24 4Z" fill="${INK}"/>
  <path d="M23.5 26.5 29 32l11-12" stroke="${SIGNAL}" stroke-width="6.5" stroke-linecap="round" stroke-linejoin="round"/>`;
  const scale = (size - pad * 2) / 48;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
  ${plate ? `<rect width="${size}" height="${size}" rx="${size * 0.2}" fill="${CREAM}"/>` : ""}
  <g transform="translate(${pad},${pad}) scale(${scale})">${inner}</g>
</svg>`;
}

/** Icon + lowercase wordmark with the signal i-dot. */
function lockupSvg() {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="260" height="64" viewBox="0 0 260 64" role="img" aria-label="cosigno">
  <g transform="translate(4,8) scale(1)">
    <path d="M24 4a20 20 0 1 0 14.1 34.2l-6.4-6.4A11 11 0 1 1 35 24h9A20 20 0 0 0 24 4Z" fill="${INK}"/>
    <path d="M23.5 26.5 29 32l11-12" stroke="${SIGNAL}" stroke-width="6.5" stroke-linecap="round" stroke-linejoin="round"/>
  </g>
  <text x="62" y="45" font-family="Nunito Sans, system-ui, sans-serif" font-weight="800" font-size="38" letter-spacing="-1" fill="${INK}">cos<tspan>ı</tspan>gno</text>
  <circle cx="151" cy="19" r="3.4" fill="${SIGNAL}"/>
</svg>`;
}

function ogSvg() {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630">
  <rect width="1200" height="630" fill="${CREAM}"/>
  <g transform="translate(468,168) scale(2.75)">
    <path d="M24 4a20 20 0 1 0 14.1 34.2l-6.4-6.4A11 11 0 1 1 35 24h9A20 20 0 0 0 24 4Z" fill="${INK}"/>
    <path d="M23.5 26.5 29 32l11-12" stroke="${SIGNAL}" stroke-width="6.5" stroke-linecap="round" stroke-linejoin="round"/>
  </g>
  <text x="600" y="390" text-anchor="middle" font-family="Nunito Sans, DejaVu Sans, sans-serif" font-weight="800" font-size="86" letter-spacing="-3" fill="${INK}">cos<tspan>ı</tspan>gno</text>
  <circle cx="659" cy="330" r="7.5" fill="${SIGNAL}"/>
  <text x="600" y="470" text-anchor="middle" font-family="Nunito Sans, DejaVu Sans, sans-serif" font-weight="800" font-size="34" fill="#5C5650">the AI operator that asks first.</text>
</svg>`;
}

async function main() {
  // Committed SVGs
  writeFileSync(join(PUB, "logo.svg"), markSvg({ size: 48 }));
  writeFileSync(join(PUB, "logo-lockup.svg"), lockupSvg());

  // Raster icons (plate keeps the mark readable on any background)
  const icon = (s, pad) => sharp(Buffer.from(markSvg({ size: s, plate: true, pad }))).png();
  await icon(192, 26).toFile(join(PUB, "icon-192.png"));
  await icon(512, 70).toFile(join(PUB, "icon-512.png"));
  await icon(180, 26).toFile(join(PUB, "apple-touch-icon.png"));

  // Favicon: 16 + 32 in one .ico
  const f16 = await sharp(Buffer.from(markSvg({ size: 16, plate: true, pad: 1 }))).png().toBuffer();
  const f32 = await sharp(Buffer.from(markSvg({ size: 32, plate: true, pad: 2 }))).png().toBuffer();
  writeFileSync(join(PUB, "favicon.ico"), await pngToIco([f16, f32]));

  // OpenGraph card
  await sharp(Buffer.from(ogSvg())).png().toFile(join(PUB, "og.png"));

  console.log("assets written to public/");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
