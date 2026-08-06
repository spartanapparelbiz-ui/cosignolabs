// Live design-review capture. Drives the REAL running app in a real browser
// and writes fresh PNGs to screenshots/review/<run>/, one per surface per
// viewport, plus a console-error report so a screenshot can never quietly
// hide a broken page.
//
//   node scripts/review-shots.mjs                 # every surface
//   node scripts/review-shots.mjs dashboard missions   # only those
//   RUN=after node scripts/review-shots.mjs       # label the run folder
//
// The dev server must already be listening on :3400 (demo mode is fine — it
// is the only mode where /app renders without live keys).
import { chromium } from "@playwright/test";
import { mkdirSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";

const BASE = process.env.BASE ?? "http://localhost:3400";
const RUN = process.env.RUN ?? "current";
const CHROME = "/opt/pw-browsers/chromium-1194/chrome-linux/chrome";
const OUT = join(process.cwd(), "screenshots", "review", RUN);

/**
 * Every surface a review can ask for, keyed by the name a person would use.
 * `wait` is text that proves the page actually rendered its own content
 * rather than a shell or an error boundary.
 */
const SURFACES = {
  dashboard: { path: "/app", wait: "would you like" },
  missions: { path: "/app/missions" },
  approvals: { path: "/app/approvals" },
  activity: { path: "/app/activity" },
  connections: { path: "/app/connections" },
  monitoring: { path: "/app/monitoring" },
  control: { path: "/app/mission-control" },
  capabilities: { path: "/app/twins" },
  simulation: { path: "/app/simulation" },
  templates: { path: "/app/templates" },
  settings: { path: "/app/settings" },
  health: { path: "/app/health" },
  landing: { path: "/" },
  product: { path: "/product" },
  pricing: { path: "/pricing" },
  checkout: { path: "/checkout?plan=operator" },
  security: { path: "/security" },
};

const VIEWPORTS = [
  { name: "desktop", width: 1440, height: 900 },
  { name: "mobile", width: 390, height: 844 },
];

/**
 * Dev-server noise that says nothing about the product: the DevTools banner,
 * source maps, favicon misses, and the network errors demo mode produces by
 * design (no Stripe, no Supabase). Everything else is a real finding.
 */
const IGNORE =
  /React DevTools|favicon|sourcemap|Download the React|Fast Refresh|net::ERR_|Failed to load resource/i;

const names = process.argv.slice(2).filter((a) => !a.startsWith("-"));
const wanted = names.length ? names : Object.keys(SURFACES);
const unknown = wanted.filter((n) => !SURFACES[n]);
if (unknown.length) {
  console.error(`unknown surface(s): ${unknown.join(", ")}`);
  console.error(`known: ${Object.keys(SURFACES).join(", ")}`);
  process.exit(1);
}

rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch({ executablePath: CHROME });
const report = [];

for (const vp of VIEWPORTS) {
  const ctx = await browser.newContext({
    viewport: { width: vp.width, height: vp.height },
    deviceScaleFactor: 2,
  });
  // Steady state: the first-run intro and the daily briefing are their own
  // captures, not something that should sit on top of every other surface.
  await ctx.addInitScript(() => {
    try {
      localStorage.setItem("cosigno_intro_seen", "1");
      localStorage.setItem("cosigno_briefing_seen", String(Date.now() - 3_600_000));
      localStorage.setItem("cosigno_name", "Nicholas");
    } catch {
      /* storage may be unavailable */
    }
  });

  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));
  page.on("console", (m) => {
    if (m.type() === "error" && !IGNORE.test(m.text())) {
      errors.push(`console: ${m.text().slice(0, 200)}`);
    }
  });

  for (const name of wanted) {
    const { path, wait } = SURFACES[name];
    errors.length = 0;
    let status = 0;
    const res = await page
      .goto(`${BASE}${path}`, { waitUntil: "load", timeout: 90_000 })
      .catch((e) => {
        errors.push(`navigation: ${String(e).slice(0, 160)}`);
        return null;
      });
    if (res) status = res.status();
    if (wait) {
      await page
        .getByText(wait, { exact: false })
        .first()
        .waitFor({ timeout: 15_000 })
        .catch(() => errors.push(`missing expected content: "${wait}"`));
    }
    // Let client fetches settle and any entrance animation finish.
    await page.waitForLoadState("networkidle", { timeout: 20_000 }).catch(() => {});
    await page.waitForTimeout(600);

    const overflow = await page
      .evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
      .catch(() => 0);
    if (overflow > 1) errors.push(`horizontal overflow: ${overflow}px`);

    const file = `${name}-${vp.name}.png`;
    await page.screenshot({ path: join(OUT, file), fullPage: true });
    report.push({ surface: name, viewport: vp.name, path, status, file, errors: [...errors] });
    const mark = errors.length ? "✗" : "✓";
    console.log(`  ${mark} ${file}  (${status})${errors.length ? ` — ${errors.join(" | ")}` : ""}`);
  }

  await ctx.close();
}

await browser.close();
writeFileSync(join(OUT, "report.json"), JSON.stringify(report, null, 2));

const bad = report.filter((r) => r.errors.length || r.status >= 400);
console.log(`\n${report.length} shots → screenshots/review/${RUN}`);
if (bad.length) {
  console.log(`${bad.length} surface(s) need attention:`);
  for (const b of bad) console.log(`  - ${b.surface} (${b.viewport}): ${b.errors.join(" | ") || `HTTP ${b.status}`}`);
  process.exit(1);
}
console.log("all surfaces clean — no console errors, no overflow");
