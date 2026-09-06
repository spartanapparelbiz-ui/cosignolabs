#!/usr/bin/env node
/**
 * Generates the cosigno identity assets into public/ from the deterministic
 * geometry in scripts/logo-geometry.mjs (mirrored by src/components/brand/
 * Logo.tsx). Clean, flat vector only — no gradients, shadows, or 3D. The icon
 * is the soft orange triangle with its counter knocked out; the counter is a
 * real hole (fill-rule="evenodd"), so every icon works on whatever sits behind
 * it. The wordmark ships as outlines, so these files render the real logotype
 * on a machine with no webfonts installed. Requires only `sharp` for
 * rasterizing PNGs; the .ico is hand-built.
 *
 *   SVG (committed):
 *     logo.svg, favicon.svg, mask-icon.svg,
 *     logo-icon-light/dark/oled.svg, logo-mono-black/white.svg,
 *     logo-lockup.svg (+ -dark/-oled)
 *   PNG (generated): icon-16/32/192/512, apple-touch-icon, og.png, favicon.ico
 */
import { writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import sharp from "sharp";
import { INK, SIGNAL, CREAM, WHITE, BLACK, MARK, WORDMARK, LOCKUP, VIEWBOX } from "./logo-geometry.mjs";

const INK_SOFT = "#5C5650";
const PUB = join(process.cwd(), "public");
mkdirSync(PUB, { recursive: true });

/** The mark, in one colour, with its counter knocked out. */
function markPath(color) {
  return `<path d="${MARK.d}" fill-rule="evenodd" fill="${color}"/>`;
}

/** A standalone icon SVG. `bg` fills a rounded-square plate; null = transparent. */
function iconSvg({ size = 100, pad = 8, color = SIGNAL, bg = null, radius = 0.22 }) {
  const scale = (size - pad * 2) / VIEWBOX;
  const plate = bg ? `<rect width="${size}" height="${size}" rx="${size * radius}" fill="${bg}"/>` : "";
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
  ${plate}
  <g transform="translate(${pad},${pad}) scale(${scale})">${markPath(color)}</g>
</svg>`;
}

/**
 * "cosigno" as outlines, baseline-aligned, at font size `fs`. Returns the
 * markup and the advance so a caller can size the artboard around it.
 */
function wordmark(x, y, fs, fill = INK) {
  const s = fs / WORDMARK.em;
  return `<g transform="translate(${x},${y}) scale(${s})"><path d="${WORDMARK.d}" fill="${fill}"/></g>`;
}
const wordWidth = (fs) => (WORDMARK.advance * fs) / WORDMARK.em;

/**
 * Full horizontal lockup, laid out by the one shared rule in LOCKUP: the mark
 * stands 0.92em tall beside a 1em wordmark, with a 0.26em gap, centred on the
 * wordmark's optical middle.
 */
function lockupSvg({ color = SIGNAL, wordFill = INK, bg = null, fs = 46, pad = 16 } = {}) {
  const m = fs * LOCKUP.markScale;
  const gap = fs * LOCKUP.gap;
  const w = Math.round(pad * 2 + m + gap + wordWidth(fs));
  const h = Math.round(pad * 2 + fs * 1.34);
  const mid = h / 2;
  const plate = bg ? `<rect width="${w}" height="${h}" fill="${bg}"/>` : "";
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" role="img" aria-label="cosigno">
  ${plate}
  <g transform="translate(${pad},${mid - m / 2}) scale(${m / VIEWBOX})">${markPath(color)}</g>
  ${wordmark(pad + m + gap, mid + fs * LOCKUP.wordCentre, fs, wordFill)}
</svg>`;
}

function maskIconSvg() {
  // Single-colour silhouette Safari recolors. The counter stays a hole.
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${VIEWBOX} ${VIEWBOX}">
  ${markPath("#000")}
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

/** OG hero: the mark + wordmark + tagline on the cream field, framed by
 *  four floating approval/receipt cards (the product's actual surface). */
function ogSvg() {
  const OGCREAM = "#F8F0E8";
  const GREEN = "#2f9e5a";
  const MUTE = "#a89f95";
  const WORD_FS = 96;
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
  <g transform="translate(600,116) scale(1.16) translate(-80,-80)">${markPath(SIGNAL)}</g>
  ${wordmark(600 - wordWidth(WORD_FS) / 2, 424, WORD_FS, INK)}
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
  // One orange mark reads on a light OR a dark tab bar, and the counter is a
  // hole, so the favicon needs no prefers-color-scheme rule at all.
  writeFileSync(join(PUB, "favicon.svg"), iconSvg({ size: 100, pad: 12 }));
  writeFileSync(join(PUB, "mask-icon.svg"), maskIconSvg());

  // themed standalone icons (deliverables)
  writeFileSync(join(PUB, "logo-icon-light.svg"), iconSvg({ color: SIGNAL }));
  writeFileSync(join(PUB, "logo-icon-dark.svg"), iconSvg({ color: SIGNAL }));
  writeFileSync(join(PUB, "logo-icon-oled.svg"), iconSvg({ color: SIGNAL }));
  writeFileSync(join(PUB, "logo-mono-black.svg"), iconSvg({ color: INK }));
  writeFileSync(join(PUB, "logo-mono-white.svg"), iconSvg({ color: WHITE }));

  // full lockups (deliverables)
  writeFileSync(join(PUB, "logo-lockup.svg"), lockupSvg({ color: SIGNAL, wordFill: INK }));
  writeFileSync(join(PUB, "logo-lockup-dark.svg"), lockupSvg({ color: SIGNAL, wordFill: CREAM, bg: INK }));
  writeFileSync(join(PUB, "logo-lockup-oled.svg"), lockupSvg({ color: SIGNAL, wordFill: WHITE, bg: BLACK }));

  // --- app icons: the orange mark on a cream rounded plate ------------------
  const plated = (s, pad) =>
    sharp(Buffer.from(iconSvg({ size: s, pad, color: SIGNAL, bg: CREAM, radius: 0.2 }))).png();
  await plated(192, 34).toFile(join(PUB, "icon-192.png"));
  await plated(512, 92).toFile(join(PUB, "icon-512.png"));
  await plated(180, 30).toFile(join(PUB, "apple-touch-icon.png"));

  // --- favicons: transparent (the orange mark reads on any tab bar) ---------
  const tab = (s, pad) => sharp(Buffer.from(iconSvg({ size: s, pad }))).png();
  await tab(16, 1).toFile(join(PUB, "icon-16.png"));
  await tab(32, 2).toFile(join(PUB, "icon-32.png"));

  const f16 = await tab(16, 1).toBuffer();
  const f32 = await tab(32, 2).toBuffer();
  const f48 = await tab(48, 3).toBuffer();
  writeFileSync(
    join(PUB, "favicon.ico"),
    buildIco([
      { size: 16, buffer: f16 },
      { size: 32, buffer: f32 },
      { size: 48, buffer: f48 },
    ])
  );

  await sharp(Buffer.from(ogSvg())).png().toFile(join(PUB, "og.png"));

  console.log("assets written to public/ — flat vector, exact tokens, counter knocked out.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
