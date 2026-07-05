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
const CREAM_DEEP = "#F3E9DA";
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

/** A single floating action-card tile for the OG hero scene. */
function ogCard({ x, y, rot, tier, label, summary, state }) {
  const dot = tier === 2 ? SIGNAL : tier === 3 ? INK : "#E4D9C8";
  const badge =
    state === "executed"
      ? `<g transform="translate(14,58)"><circle cx="6" cy="6" r="6" fill="${SIGNAL}"/><path d="M3 6.2 5.2 8.4 9 4.2" fill="none" stroke="${CREAM}" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/><text x="18" y="10" font-family="Nunito Sans, DejaVu Sans, sans-serif" font-weight="800" font-size="11" fill="${SIGNAL}">executed</text></g>`
      : state === "awaiting"
        ? `<g transform="translate(14,52)"><rect width="120" height="18" rx="9" fill="${CREAM_DEEP}"/><text x="10" y="13" font-family="Nunito Sans, DejaVu Sans, sans-serif" font-weight="700" font-size="10" fill="#5C5650">awaiting sign-off</text></g>`
        : `<g transform="translate(14,52)"><text x="0" y="10" font-family="Nunito Sans, DejaVu Sans, sans-serif" font-weight="700" font-size="10" fill="#5C5650">locked · typed confirm</text></g>`;
  return `<g transform="translate(${x},${y}) rotate(${rot})" filter="url(#cardsh)">
    <rect width="230" height="86" rx="14" fill="#ffffff"/>
    ${tier === 3 ? `<rect width="14" height="86" rx="7" fill="${SIGNAL}" opacity="0.12"/>` : ""}
    <circle cx="18" cy="20" r="4" fill="${dot}"/>
    <text x="30" y="24" font-family="Nunito Sans, DejaVu Sans, sans-serif" font-weight="800" font-size="10" letter-spacing="1" fill="#5C5650">TIER ${tier} · ${label.toUpperCase()}</text>
    <text x="14" y="44" font-family="Nunito Sans, DejaVu Sans, sans-serif" font-weight="800" font-size="15" fill="${INK}">${summary}</text>
    ${badge}
  </g>`;
}

/** OG hero scene: the mark centered, real action cards floating around it. */
function ogSvg() {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630">
  <defs>
    <radialGradient id="glow" cx="0.5" cy="0.42" r="0.5">
      <stop offset="0" stop-color="#FF4B1F" stop-opacity="0.12"/>
      <stop offset="1" stop-color="#FF4B1F" stop-opacity="0"/>
    </radialGradient>
    <filter id="cardsh" x="-30%" y="-30%" width="160%" height="160%">
      <feDropShadow dx="0" dy="8" stdDeviation="12" flood-color="#141414" flood-opacity="0.14"/>
    </filter>
  </defs>
  <rect width="1200" height="630" fill="${CREAM}"/>
  <rect width="1200" height="630" fill="url(#glow)"/>

  <!-- floating action cards (behind + around the mark) -->
  ${ogCard({ x: 70, y: 120, rot: -5, tier: 1, label: "auto", summary: "archived 24 newsletters", state: "executed" })}
  ${ogCard({ x: 900, y: 96, rot: 4, tier: 2, label: "approve", summary: "draft replies to 3 leads", state: "awaiting" })}
  ${ogCard({ x: 88, y: 400, rot: 3, tier: 3, label: "locked", summary: "refund $48.00 · order #2231", state: "locked" })}
  ${ogCard({ x: 890, y: 424, rot: -4, tier: 1, label: "auto", summary: "repriced 12 products", state: "executed" })}

  <!-- the mark -->
  <g transform="translate(505,150) scale(1.9)">${markInner(false)}</g>
  ${wordmark(600 - 150, 452, 84, 7.5, 143, 54)}
  <text x="600" y="520" text-anchor="middle" font-family="Nunito Sans, DejaVu Sans, sans-serif" font-weight="800" font-size="32" fill="#5C5650">the AI operator that asks first.</text>
</svg>`;
}

/**
 * Dark-adaptive SVG favicon. The ink C vanishes on dark browser tab bars,
 * so an internal prefers-color-scheme rule repaints the C cream on dark; the
 * signal check reads on both. Supporting browsers prefer this over the .ico.
 */
function faviconSvg() {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100" viewBox="0 0 100 100">
  <style>
    .c { stroke: ${INK}; }
    @media (prefers-color-scheme: dark) { .c { stroke: ${CREAM}; } }
  </style>
  <path class="c" d="${C.d}" fill="none" stroke-width="${C.stroke}" stroke-linecap="round"/>
  <path d="${CHECK.d}" fill="none" stroke="${SIGNAL}" stroke-width="${CHECK.stroke}" stroke-linecap="round" stroke-linejoin="round"/>
</svg>`;
}

async function main() {
  // Flat SVGs (committed, used in nav/footer/favicon/app).
  writeFileSync(join(PUB, "logo.svg"), markSvg({ size: 100, pad: 8 }));
  writeFileSync(join(PUB, "logo-lockup.svg"), lockupSvg(true));
  writeFileSync(join(PUB, "favicon.svg"), faviconSvg());

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
