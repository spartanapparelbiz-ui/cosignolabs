import { chromium } from "@playwright/test";
import { mkdirSync } from "node:fs";

const OUT = "/tmp/claude-0/-home-user-cosignolabs/7b0254a2-29d2-5fed-aaf1-6bee55d2314d/scratchpad/shots";
mkdirSync(OUT, { recursive: true });
const BASE = "http://localhost:3400";
const IGNORE =
  /(React DevTools|ResizeObserver loop|favicon|\/_next\/|hydrat|Extra attributes from the server|Failed to load resource|net::ERR|status of 4|status of 5)/i;

const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 950 } });
const page = await ctx.newPage();
const problems = [];
page.on("pageerror", (e) => problems.push(`pageerror: ${e.message}`));
page.on("console", (m) => {
  if (m.type() === "error" && !IGNORE.test(m.text())) problems.push(`console: ${m.text()}`);
});

// 1. Start a real mission through the real API (inbox cleanup stops on an
//    approval gate, which is the state that matters most).
const res = await page.request.post(`${BASE}/api/missions`, {
  data: { template: "inbox_cleanup" },
});
console.log("start mission:", res.status());
const { mission } = await res.json();

// 2. Home should now show it under "Needs you" or "working on".
await page.goto(`${BASE}/app`, { waitUntil: "networkidle" });
await page.waitForTimeout(2500);
await page.screenshot({ path: `${OUT}/flow-home-active.png`, fullPage: true });

// 3. The mission's own page.
await page.goto(`${BASE}/app/missions/${mission.id}`, { waitUntil: "networkidle" });
await page.waitForTimeout(4000);
await page.screenshot({ path: `${OUT}/flow-mission.png`, fullPage: true });

// 4. Open the specialists disclosure.
const details = page.locator("summary", { hasText: /specialist/i }).first();
if (await details.count()) {
  await details.click();
  await page.waitForTimeout(400);
  await page.screenshot({ path: `${OUT}/flow-specialists.png`, fullPage: true });
} else {
  problems.push("no specialist disclosure on the mission page");
}

// 5. Approvals.
await page.goto(`${BASE}/app/approvals`, { waitUntil: "networkidle" });
await page.waitForTimeout(1200);
await page.screenshot({ path: `${OUT}/flow-approvals.png`, fullPage: true });

// 6. Missions list with real content.
await page.goto(`${BASE}/app/missions`, { waitUntil: "networkidle" });
await page.waitForTimeout(1500);
await page.screenshot({ path: `${OUT}/flow-missions-list.png`, fullPage: true });

// 7. Keyboard: tab from the top of home and check the skip link comes first.
await page.goto(`${BASE}/app`, { waitUntil: "networkidle" });
await page.keyboard.press("Tab");
const firstStop = await page.evaluate(() => {
  const el = document.activeElement;
  return el ? `${el.tagName}:${(el.textContent || "").trim().slice(0, 30)}` : "none";
});
console.log("first tab stop:", firstStop);

// 8. Reduced motion: nothing should be mid-animation or invisible.
await page.emulateMedia({ reducedMotion: "reduce" });
await page.reload({ waitUntil: "networkidle" });
await page.waitForTimeout(800);
const hidden = await page.evaluate(() => {
  const bad = [];
  for (const el of document.querySelectorAll("main *")) {
    const cs = getComputedStyle(el);
    if (parseFloat(cs.opacity) < 0.05 && el.getBoundingClientRect().height > 8) {
      bad.push(el.className?.toString().slice(0, 60) || el.tagName);
    }
  }
  return bad.slice(0, 5);
});
if (hidden.length) problems.push(`invisible under reduced motion: ${hidden.join(" | ")}`);
await page.screenshot({ path: `${OUT}/flow-reduced-motion.png`, fullPage: true });
await page.emulateMedia({ reducedMotion: null });

await browser.close();
console.log(problems.length ? "PROBLEMS:\n" + problems.join("\n") : "flow clean");
