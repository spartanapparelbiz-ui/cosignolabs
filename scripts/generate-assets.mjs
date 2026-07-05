#!/usr/bin/env node
/**
 * Generates the cosigno identity assets into public/ and public/brand/.
 *   flat:  public/logo.svg, public/logo-lockup.svg
 *   3D:    public/brand/logo-3d.png (icon+wordmark), public/brand/icon-3d.png
 *   icons: favicon.ico, icon-192/512, apple-touch-icon, og.png
 *
 * Geometry is traced from scripts/logo-geometry.mjs (mirrored by the flat
 * SVG React component). Requires `npm i --no-save sharp png-to-ico` and
 * Nunito Sans ExtraBold installed locally (fontconfig) for text.
 */
import { writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import sharp from "sharp";
import pngToIco from "png-to-ico";
import { INK, SIGNAL, C, CHECK } from "./logo-geometry.mjs";

const CREAM = "#FBF4EA";
const PUB = join(process.cwd(), "public");
const BRAND = join(PUB, "brand");
mkdirSync(BRAND, { recursive: true });

/** Flat mark, viewBox 0 0 100 100. `flat=false` adds soft-3D shading. */
function markInner(flat = true) {
  if (flat) {
    return `
  <path d="${C.d}" fill="none" stroke="${INK}" stroke-width="${C.stroke}" stroke-linecap="round"/>
  <path d="${CHECK.d}" fill="none" stroke="${SIGNAL}" stroke-width="${CHECK.stroke}" stroke-linecap="round" stroke-linejoin="round"/>`;
  }
  // Soft-3D: vertical charcoal gradient on the C, warm gradient on the check,
  // a drop shadow, and a soft top highlight — a rich translation of the mark.
  return `
  <defs>
    <linearGradient id="ci" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#2b2b2b"/>
      <stop offset="0.55" stop-color="#161616"/>
      <stop offset="1" stop-color="#050505"/>
    </linearGradient>
    <linearGradient id="ch" x1="0" y1="0" x2="0.3" y2="1">
      <stop offset="0" stop-color="#ff6a44"/>
      <stop offset="0.6" stop-color="#ff4b1f"/>
      <stop offset="1" stop-color="#e23a12"/>
    </linearGradient>
    <filter id="ds" x="-30%" y="-30%" width="160%" height="160%">
      <feDropShadow dx="0" dy="3.2" stdDeviation="3.4" flood-color="#000" flood-opacity="0.28"/>
    </filter>
  </defs>
  <g filter="url(#ds)">
    <path d="${C.d}" fill="none" stroke="url(#ci)" stroke-width="${C.stroke}" stroke-linecap="round"/>
    <path d="${C.d}" fill="none" stroke="#ffffff" stroke-opacity="0.10" stroke-width="${C.stroke - 16}" stroke-linecap="round" transform="translate(0,-3)"/>
    <path d="${CHECK.d}" fill="none" stroke="url(#ch)" stroke-width="${CHECK.stroke}" stroke-linecap="round" stroke-linejoin="round"/>
    <path d="${CHECK.d}" fill="none" stroke="#ffffff" stroke-opacity="0.22" stroke-width="4" stroke-linecap="round" stroke-linejoin="round" transform="translate(-1,-2)"/>
  </g>`;
}

function markSvg({ size, flat = true, plate = false, pad = 8 }) {
  const inner = markInner(flat);
  const scale = (size - pad * 2) / 100;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
  ${plate ? `<rect width="${size}" height="${size}" rx="${size * 0.2}" fill="${CREAM}"/>` : ""}
  <g transform="translate(${pad},${pad}) scale(${scale})">${inner}</g>
</svg>`;
}

function wordmark(x, y, fs, dotR, dotDx, dotDy) {
  // lowercase "cosigno" with the signal i-dot placed over the ı.
  return `<text x="${x}" y="${y}" font-family="Nunito Sans, DejaVu Sans, sans-serif" font-weight="900" font-size="${fs}" letter-spacing="-2" fill="${INK}">cos<tspan>ı</tspan>gno</text>
  <circle cx="${x + dotDx}" cy="${y - dotDy}" r="${dotR}" fill="${SIGNAL}"/>`;
}

function lockupSvg(flat = true) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="300" height="88" viewBox="0 0 300 88" role="img" aria-label="cosigno">
  <g transform="translate(2,10) scale(0.68)">${markInner(flat)}</g>
  ${wordmark(80, 62, 46, 4.2, 78, 30)}
</svg>`;
}

function ogSvg() {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630">
  <defs>
    <radialGradient id="glow" cx="0.5" cy="0.42" r="0.4">
      <stop offset="0" stop-color="#FF4B1F" stop-opacity="0.10"/>
      <stop offset="1" stop-color="#FF4B1F" stop-opacity="0"/>
    </radialGradient>
  </defs>
  <rect width="1200" height="630" fill="${CREAM}"/>
  <rect width="1200" height="630" fill="url(#glow)"/>
  <g transform="translate(480,120) scale(2.4)">${markInner(false)}</g>
  ${wordmark(600 - 168, 470, 96, 8.5, 163, 62)}
  <text x="600" y="545" text-anchor="middle" font-family="Nunito Sans, DejaVu Sans, sans-serif" font-weight="800" font-size="34" fill="#5C5650">the AI operator that asks first.</text>
</svg>`;
}

async function main() {
  // Flat SVGs (committed, used in nav/footer/favicon/app).
  writeFileSync(join(PUB, "logo.svg"), markSvg({ size: 100, pad: 8 }));
  writeFileSync(join(PUB, "logo-lockup.svg"), lockupSvg(true));

  // Rich 3D rasters for hero + reference.
  await sharp(Buffer.from(markSvg({ size: 512, flat: false, pad: 40 })))
    .png()
    .toFile(join(BRAND, "icon-3d.png"));
  await sharp(Buffer.from(lockupSvg(false)), { density: 300 })
    .resize(1200)
    .png()
    .toFile(join(BRAND, "logo-3d.png"));

  // App icons (flat mark on a cream plate so it reads on any tab bg).
  const icon = (s, pad) => sharp(Buffer.from(markSvg({ size: s, plate: true, pad }))).png();
  await icon(192, 30).toFile(join(PUB, "icon-192.png"));
  await icon(512, 82).toFile(join(PUB, "icon-512.png"));
  await icon(180, 28).toFile(join(PUB, "apple-touch-icon.png"));

  const f16 = await sharp(Buffer.from(markSvg({ size: 16, plate: true, pad: 1 }))).png().toBuffer();
  const f32 = await sharp(Buffer.from(markSvg({ size: 32, plate: true, pad: 2 }))).png().toBuffer();
  const f48 = await sharp(Buffer.from(markSvg({ size: 48, plate: true, pad: 4 }))).png().toBuffer();
  writeFileSync(join(PUB, "favicon.ico"), await pngToIco([f16, f32, f48]));

  await sharp(Buffer.from(ogSvg())).png().toFile(join(PUB, "og.png"));

  console.log("assets written to public/ and public/brand/");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
