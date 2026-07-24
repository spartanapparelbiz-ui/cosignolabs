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
  <path d="${C.d}" fill="${cColor}"/>
  <path d="${CHECK.d}" fill="${checkColor}"/>`;
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
  <style>.k{fill:${INK}}@media (prefers-color-scheme:dark){.k{fill:${CREAM}}}</style>
  <g transform="translate(${pad},${pad}) scale(${scale})">
  <path d="${C.d}" fill="${SIGNAL}"/>
  <path d="${CHECK.d}" class="k"/>
  </g>
</svg>`;
}

/** "cosigno" wordmark with the orange i-dot, at (x,y) baseline. */
function wordmark(x, y, fs, dotR, dotDx, dotDy, fill = INK) {
  return `<text x="${x}" y="${y}" font-family="Poppins, DejaVu Sans, sans-serif" font-weight="700" font-size="${fs}" letter-spacing="-1.5" fill="${fill}">cos<tspan>ı</tspan>gno</text>
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
  <path d="${C.d}" fill="#000"/>
  <path d="${CHECK.d}" fill="#000"/>
</svg>`;
}

/** A floating receipt/approval card for the OG hero. */
function ogCard(x, y, rot, tier, dotColor, title, status, statusColor) {
  return `<g transform="translate(${x},${y}) rotate(${rot})">
    <rect width="266" height="84" rx="16" fill="#FFFFFF" filter="url(#ogsh)"/>
    <circle cx="24" cy="28" r="4" fill="${dotColor}"/>
    <text x="37" y="32" font-family="DejaVu Sans, sans-serif" font-weight="700" font-size="10.5" letter-spacing="1.4" fill="#a89f95">${tier}</text>
    <text x="24" y="56" font-family="DejaVu Sans, sans-serif" font-weight="700" font-size="16" fill="#171512">${title}</text>
    <text x="24" y="74" font-family="DejaVu Sans, sans-serif" font-weight="700" font-size="11.5" fill="${statusColor}">${status}</text>
  </g>`;
}

/** OG hero: the traced mark + wordmark + tagline on the cream field, framed by
 *  four floating approval/receipt cards (the product's actual surface). */
function ogSvg() {
  const OGCREAM = "#F8F0E8";
  const GREEN = "#2f9e5a";
  const MUTE = "#a89f95";
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630">
  <defs>
    <filter id="ogsh" x="-30%" y="-30%" width="160%" height="160%">
      <feDropShadow dx="0" dy="7" stdDeviation="12" flood-color="#171512" flood-opacity="0.10"/>
    </filter>
    <radialGradient id="ogbg" cx="50%" cy="40%" r="62%">
      <stop offset="0%" stop-color="#FCF6EF"/>
      <stop offset="100%" stop-color="${OGCREAM}"/>
    </radialGradient>
  </defs>
  <rect width="1200" height="630" fill="url(#ogbg)"/>
  <g transform="translate(600,116) scale(1.16) translate(-80,-80)">${markPaths(SIGNAL, INK)}</g>
  ${wordmark(600 - 150, 424, 84, 8, 143, 54, INK)}
  <text x="600" y="486" text-anchor="middle" font-family="DejaVu Sans, sans-serif" font-weight="700" font-size="27" fill="${INK_SOFT}">the AI operator that asks first.</text>
  ${ogCard(64, 150, -4, "TIER 1 · AUTO", MUTE, "archived 24 newsletters", "executed", GREEN)}
  ${ogCard(872, 128, 4, "TIER 2 · APPROVE", SIGNAL, "draft replies to 3 leads", "awaiting sign-off", MUTE)}
  ${ogCard(64, 408, 4, "TIER 3 · LOCKED", INK, "refund $48.00 · order #2231", "locked · typed confirm", MUTE)}
  ${ogCard(872, 430, -4, "TIER 1 · AUTO", MUTE, "repriced 12 products", "executed", GREEN)}
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
