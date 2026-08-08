// Perceived-performance measurement against the running app.
//
// Reports, per surface: every API request the page fires (flagging duplicates),
// the paint metrics the browser actually recorded, and how long the page took
// to stop making requests. Numbers, not impressions — a "feels fast" pass with
// no measurement is a decorating pass.
//
//   node scripts/measure.mjs                       # default surfaces
//   node scripts/measure.mjs /app /app/missions    # specific ones
//   THROTTLE=1 node scripts/measure.mjs            # 4x CPU + slow 4G
import { chromium } from "@playwright/test";

const BASE = process.env.BASE ?? "http://localhost:3400";
const CHROME = process.env.CHROME_PATH;
const THROTTLE = process.env.THROTTLE === "1";
const SURFACES =
  process.argv.slice(2).length > 0
    ? process.argv.slice(2)
    : ["/app", "/app/missions", "/app/approvals", "/app/activity", "/app/connections"];

const browser = await chromium.launch({ executablePath: CHROME || undefined });

console.log(THROTTLE ? "— throttled: 4x CPU, slow 4G —" : "— unthrottled —");

for (const path of SURFACES) {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  await ctx.addInitScript(() => {
    try {
      localStorage.setItem("cosigno_intro_seen", "1");
      localStorage.setItem("cosigno.name", "Nicholas");
    } catch {}
    // LCP is only observable as it happens — getEntriesByType returns nothing
    // for it after the fact, which is why it read as null.
    const w = window;
    w.__lcp = 0;
    try {
      new PerformanceObserver((list) => {
        for (const e of list.getEntries()) w.__lcp = Math.round(e.startTime);
      }).observe({ type: "largest-contentful-paint", buffered: true });
    } catch {}
  });
  const page = await ctx.newPage();

  if (THROTTLE) {
    const cdp = await ctx.newCDPSession(page);
    await cdp.send("Emulation.setCPUThrottlingRate", { rate: 4 });
    await cdp.send("Network.enable");
    await cdp.send("Network.emulateNetworkConditions", {
      offline: false,
      latency: 150,
      downloadThroughput: (1.6 * 1024 * 1024) / 8,
      uploadThroughput: (750 * 1024) / 8,
    });
  }

  const api = [];
  page.on("request", (r) => {
    const u = new URL(r.url());
    if (u.pathname.startsWith("/api/")) api.push(u.pathname + u.search);
  });

  const t0 = Date.now();
  await page.goto(BASE + path, { waitUntil: "networkidle", timeout: 90_000 });
  await page.waitForTimeout(1200);
  const settled = Date.now() - t0;

  const paint = await page.evaluate(() => {
    const fcp = performance.getEntriesByName("first-contentful-paint")[0];
    const nav = performance.getEntriesByType("navigation")[0];
    return {
      fcp: fcp ? Math.round(fcp.startTime) : null,
      lcp: window.__lcp || null,
      domInteractive: nav ? Math.round(nav.domInteractive) : null,
      transferKB: nav ? Math.round(nav.transferSize / 1024) : null,
    };
  });

  const counts = new Map();
  for (const u of api) counts.set(u, (counts.get(u) ?? 0) + 1);
  const dupes = [...counts.entries()].filter(([, n]) => n > 1);

  console.log(`\n${path}`);
  console.log(`  fcp ${paint.fcp}ms · lcp ${paint.lcp}ms · interactive ${paint.domInteractive}ms · settled ${settled}ms`);
  console.log(`  api requests: ${api.length}`);
  for (const [u, n] of counts) console.log(`    ${n > 1 ? `${n}x` : "  "} ${u}`);
  if (dupes.length) console.log(`  ⚠ ${dupes.length} duplicated endpoint(s)`);

  await ctx.close();
}


/**
 * The warm walk: one session, click through the rail, and report what each hop
 * costs. This is the number that decides whether the app feels native — a cold
 * page load happens once a day, a navigation happens fifty times.
 */
if (process.env.WALK === "1") {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  await ctx.addInitScript(() => {
    try {
      localStorage.setItem("cosigno_intro_seen", "1");
      localStorage.setItem("cosigno.name", "Nicholas");
    } catch {}
  });
  const page = await ctx.newPage();
  let hopApi = [];
  page.on("request", (r) => {
    const u = new URL(r.url());
    if (u.pathname.startsWith("/api/")) hopApi.push(u.pathname);
  });

  await page.goto(BASE + "/app", { waitUntil: "networkidle" });
  await page.waitForTimeout(600);

  console.log("\n— warm navigation (one session) —");
  for (const label of ["missions", "approvals", "activity", "connections", "home", "approvals"]) {
    hopApi = [];
    const t = Date.now();
    await page.getByRole("link", { name: label, exact: true }).first().click();
    // Content, not the network: what matters is when the page is readable.
    await page.waitForFunction(() => !document.querySelector(".skeleton"), null, { timeout: 15_000 })
      .catch(() => {});
    const paintedIn = Date.now() - t;
    await page.waitForTimeout(900);
    console.log(`  → ${label.padEnd(12)} readable in ${String(paintedIn).padStart(5)}ms · ${hopApi.length} api request(s)`);
  }
  await ctx.close();
}

await browser.close();
