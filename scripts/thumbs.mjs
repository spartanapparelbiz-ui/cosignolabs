// Web-sized JPEGs for the gallery page.
//
// The PNG stills are full-fidelity and heavy; a shareable gallery needs them
// small enough to inline. Chromium is already the only image pipeline this
// repo depends on, so the conversion runs there: draw each PNG to a canvas,
// re-encode as JPEG, write it back out.
//
// Run: node scripts/thumbs.mjs [maxWidth] [quality]
import { chromium } from "@playwright/test";
import { mkdirSync, readdirSync, writeFileSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const CHROME = "/opt/pw-browsers/chromium-1194/chrome-linux/chrome";
const SRC = join(process.cwd(), "media", "stills");
const DEST = join(process.cwd(), "media", "thumbs");
const MAX_W = Number(process.argv[2] ?? 1000);
const QUALITY = Number(process.argv[3] ?? 0.72);

mkdirSync(DEST, { recursive: true });

const files = readdirSync(SRC).filter((f) => f.endsWith(".png")).sort();
if (!files.length) {
  console.log("no stills to convert");
  process.exit(0);
}

const browser = await chromium.launch({ executablePath: CHROME });
const page = await browser.newPage();
await page.goto("about:blank");

let before = 0;
let after = 0;

for (const f of files) {
  const src = join(SRC, f);
  before += statSync(src).size;
  const b64 = readFileSync(src).toString("base64");

  const out = await page.evaluate(
    async ({ b64, maxW, q }) => {
      const img = new Image();
      img.src = `data:image/png;base64,${b64}`;
      await img.decode();
      const scale = Math.min(1, maxW / img.naturalWidth);
      const c = document.createElement("canvas");
      c.width = Math.round(img.naturalWidth * scale);
      c.height = Math.round(img.naturalHeight * scale);
      const ctx = c.getContext("2d");
      ctx.imageSmoothingQuality = "high";
      // JPEG has no alpha — paint the page background in first so any
      // transparent region lands on white instead of black.
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, c.width, c.height);
      ctx.drawImage(img, 0, 0, c.width, c.height);
      return c.toDataURL("image/jpeg", q);
    },
    { b64, maxW: MAX_W, q: QUALITY },
  );

  const name = f.replace(/\.png$/, ".jpg");
  const buf = Buffer.from(out.split(",")[1], "base64");
  writeFileSync(join(DEST, name), buf);
  after += buf.length;
  console.log(`  ${name}  ${(buf.length / 1024).toFixed(0)} KB`);
}

await browser.close();
console.log(
  `\n${files.length} images: ${(before / 1e6).toFixed(1)} MB → ${(after / 1e6).toFixed(1)} MB`,
);
