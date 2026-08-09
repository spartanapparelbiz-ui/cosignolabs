import { chromium } from "@playwright/test";
import { mkdirSync } from "node:fs";

const OUT = "/tmp/claude-0/-home-user-cosignolabs/7b0254a2-29d2-5fed-aaf1-6bee55d2314d/scratchpad/shots";
mkdirSync(OUT, { recursive: true });

const BASE = "http://localhost:3400";
const IGNORE =
  /(React DevTools|ResizeObserver loop|favicon|\/_next\/|hydrat|Extra attributes from the server|Failed to load resource|net::ERR|status of 4|status of 5)/i;

const PATHS = process.argv[2]
  ? process.argv[2].split(",")
  : [
      "/app",
      "/app/missions",
      "/app/approvals",
      "/app/activity",
      "/app/connections",
      "/app/account",
      "/app/trust",
      "/app/monitoring",
      "/app/mission-control",
      "/app/settings/rules",
      "/app/templates",
      "/app/memory",
      "/app/files",
      "/app/health",
      "/app/workspace",
    ];

const VIEWPORTS = [
  { name: "desktop", width: 1440, height: 950 },
  { name: "mobile", width: 390, height: 844 },
];

const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
const problems = [];

for (const vp of VIEWPORTS) {
  const ctx = await browser.newContext({ viewport: { width: vp.width, height: vp.height } });
  const page = await ctx.newPage();
  page.on("pageerror", (e) => problems.push(`[${vp.name}] pageerror: ${e.message}`));
  page.on("console", (m) => {
    if (m.type() === "error" && !IGNORE.test(m.text()))
      problems.push(`[${vp.name}] console: ${m.text()}`);
  });

  for (const path of PATHS) {
    try {
      await page.goto(BASE + path, { waitUntil: "networkidle", timeout: 60000 });
    } catch (e) {
      problems.push(`[${vp.name}] ${path} nav: ${e.message}`);
      continue;
    }
    await page.waitForTimeout(500);
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth
    );
    if (overflow > 1) problems.push(`[${vp.name}] ${path} horizontal overflow: ${overflow}px`);
    const name = path.replace(/\//g, "_") || "_root";
    await page.screenshot({ path: `${OUT}/${name}-${vp.name}.png`, fullPage: true });
  }
  await ctx.close();
}

await browser.close();
console.log(problems.length ? "PROBLEMS:\n" + problems.join("\n") : "clean: no console errors, no overflow");
