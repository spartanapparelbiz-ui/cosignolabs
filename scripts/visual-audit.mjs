// Cosigno visual audit — captures the real running app into screenshots/.
// Read-only: navigates and screenshots; never mutates product code.
// Run: node scripts/visual-audit.mjs  (dev server must be on :3400)
import { chromium } from "@playwright/test";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const BASE = "http://localhost:3400";
const ROOT = join(process.cwd(), "screenshots");
const CHROME = "/opt/pw-browsers/chromium-1194/chrome-linux/chrome";
const log = [];

function dir(sub) {
  const d = join(ROOT, sub);
  mkdirSync(d, { recursive: true });
  return d;
}

const browser = await chromium.launch({ executablePath: CHROME });

async function shot(page, folder, file, note, { full = true } = {}) {
  const path = join(dir(folder), file);
  const errors = page.__errors ?? [];
  try {
    await page.screenshot({ path, fullPage: full });
    log.push({ folder, file, note, ok: true, errors: [...errors] });
    console.log(`  ✓ ${folder}/${file}`);
  } catch (e) {
    log.push({ folder, file, note, ok: false, reason: String(e).slice(0, 200) });
    console.log(`  ✗ ${folder}/${file} — ${String(e).slice(0, 120)}`);
  }
  if (page.__errors) page.__errors.length = 0;
}

function wireErrors(page) {
  page.__errors = [];
  const IGNORE = /React DevTools|favicon|\/_next\/|hydrat|Failed to load resource|net::ERR|status of 4|status of 5|Fast Refresh/i;
  page.on("pageerror", (e) => page.__errors.push(`pageerror: ${e.message}`));
  page.on("console", (m) => {
    if (m.type() === "error" && !IGNORE.test(m.text())) page.__errors.push(`console: ${m.text().slice(0, 160)}`);
  });
}

async function goto(page, path, waitText) {
  await page.goto(`${BASE}${path}`, { waitUntil: "load", timeout: 90_000 }).catch(() => {});
  if (waitText) await page.getByText(waitText).first().waitFor({ timeout: 15_000 }).catch(() => {});
  await page.waitForTimeout(700);
}

/* ------------------------------------------------------------ DESKTOP ---- */
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
// keep the app in its steady state (skip first-run intro except where captured)
await ctx.addInitScript(() => {
  try {
    localStorage.setItem("cosigno_intro_seen", "1");
    localStorage.setItem("cosigno_briefing_seen", String(Date.now() - 3600_000));
    localStorage.setItem("cosigno_name", "Nicholas");
  } catch {}
});
const page = await ctx.newPage();
wireErrors(page);

console.log("== marketing ==");
await goto(page, "/");
await shot(page, "01-marketing", "landing-desktop.png", "Public landing page");
await goto(page, "/product");
await shot(page, "01-marketing", "product-desktop.png", "Product page");
await goto(page, "/operators");
await shot(page, "01-marketing", "operators-desktop.png", "Operators page");
await goto(page, "/pricing");
await shot(page, "01-marketing", "pricing-desktop.png", "Pricing — free / pro / max");
await goto(page, "/security");
await shot(page, "01-marketing", "security-desktop.png", "Security page");
await goto(page, "/templates");
await shot(page, "01-marketing", "templates-desktop.png", "Templates page");
await goto(page, "/demo");
await shot(page, "01-marketing", "demo-desktop.png", "Demo page");
await goto(page, "/privacy");
await shot(page, "01-marketing", "privacy-desktop.png", "Privacy policy");
await goto(page, "/terms");
await shot(page, "01-marketing", "terms-desktop.png", "Terms");

console.log("== auth ==");
await goto(page, "/sign-in");
await shot(page, "02-auth", "sign-in-desktop.png", "Sign in (live auth unconfigured in demo)");
await goto(page, "/sign-up");
await shot(page, "02-auth", "sign-up-desktop.png", "Sign up (live auth unconfigured in demo)");

console.log("== onboarding ==");
{
  const oc = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const op = await oc.newPage();
  wireErrors(op);
  await op.goto(`${BASE}/app`, { waitUntil: "load", timeout: 90_000 }).catch(() => {});
  await op.getByRole("dialog").waitFor({ timeout: 15_000 }).catch(() => {});
  await op.waitForTimeout(800);
  await shot(op, "02-auth", "onboarding-1-desktop.png", "First-run intro, screen 1", { full: false });
  await op.getByRole("button", { name: /see how it works/i }).click().catch(() => {});
  await op.waitForTimeout(500);
  await shot(op, "02-auth", "onboarding-2-desktop.png", "First-run intro, screen 2", { full: false });
  await op.getByRole("button", { name: /one more thing/i }).click().catch(() => {});
  await op.waitForTimeout(500);
  await shot(op, "02-auth", "onboarding-3-desktop.png", "First-run intro, screen 3", { full: false });
  await oc.close();
}

console.log("== now / home ==");
await goto(page, "/app", "What should cosigno handle?");
await shot(page, "03-now", "now-home-desktop.png", "NOW / home — current state, delegation box");
// briefing (fresh — clear the seen flag then reload)
await page.evaluate(() => localStorage.removeItem("cosigno_briefing_seen"));
await goto(page, "/app", "What should cosigno handle?");
await shot(page, "03-now", "now-briefing-desktop.png", "NOW with morning briefing card");
await page.evaluate(() => localStorage.setItem("cosigno_briefing_seen", String(Date.now())));
// capabilities card expanded
await goto(page, "/app", "What should cosigno handle?");
await page.getByText(/What can you do right now/i).click().catch(() => {});
await page.waitForTimeout(600);
await page.locator("section", { hasText: "What cosigno can do" }).scrollIntoViewIfNeeded().catch(() => {});
await shot(page, "03-now", "now-capabilities-desktop.png", "What can you do right now — capability report");

console.log("== presence / command overlay ==");
await goto(page, "/app", "What should cosigno handle?");
await page.keyboard.press("Control+k");
await page.waitForTimeout(600);
await shot(page, "03-now", "presence-command-overlay-desktop.png", "Cosigno Presence — command overlay (Cmd/Ctrl-K)", { full: false });
await page.keyboard.press("Escape");

console.log("== delegations ==");
await goto(page, "/app/missions", "What is cosigno working on?");
await shot(page, "04-delegations", "delegations-list-desktop.png", "Delegations list — states, contextual actions");
// brief modal
await page.getByRole("button", { name: /brief me/i }).first().click().catch(() => {});
await page.getByText(/^Why:/).waitFor({ timeout: 10_000 }).catch(() => {});
await page.waitForTimeout(400);
await shot(page, "04-delegations", "delegation-brief-desktop.png", "Brief Me / Why is this waiting", { full: false });
await page.keyboard.press("Escape");
// replay modal
await page.getByRole("button", { name: /^replay$/i }).first().click().catch(() => {});
await page.waitForTimeout(700);
await shot(page, "04-delegations", "delegation-replay-desktop.png", "Delegation Replay timeline", { full: false });
await page.keyboard.press("Escape");

console.log("== objectives ==");
await goto(page, "/app/objectives", "What are you trying to reach?");
await shot(page, "05-objectives", "objectives-list-desktop.png", "Objectives list with progress");
await page.getByText("Launch the company by August 1").first().click().catch(() => {});
await page.getByText(/^Progress$/).waitFor({ timeout: 12_000 }).catch(() => {});
await page.waitForTimeout(500);
await shot(page, "05-objectives", "objective-detail-desktop.png", "Objective detail — linked delegations, progress");

console.log("== boundary / focus / sign ==");
await goto(page, "/app/focus");
await page.getByText(/I need your decision/i).waitFor({ timeout: 15_000 }).catch(() => {});
await page.waitForTimeout(500);
await shot(page, "06-boundary", "boundary-focus-desktop.png", "The Boundary / Handoff — Focus, needs you, why-me");
// approval bundle
await page.getByRole("button", { name: /Review all/i }).click().catch(() => {});
await page.waitForTimeout(500);
await shot(page, "06-boundary", "approval-bundle-desktop.png", "Approval bundle — review all together", { full: false });
await page.getByRole("button", { name: /One at a time/i }).click().catch(() => {});
// live takeover
await page.getByRole("button", { name: /I'll take it from here/i }).click().catch(() => {});
await page.waitForTimeout(500);
await shot(page, "06-boundary", "live-takeover-desktop.png", "Live Takeover — YOU HAVE CONTROL, editable", { full: false });
await page.getByRole("button", { name: /Cosigno, continue/i }).click().catch(() => {});
await page.waitForTimeout(900);
await shot(page, "06-boundary", "continue-from-here-desktop.png", "Continue From Here — handed back", { full: false });
// sign dialog
await page.getByText(/I need your decision/i).waitFor({ timeout: 15_000 }).catch(() => {});
await page.getByRole("button", { name: /^Sign$/i }).first().click().catch(() => {});
await page.waitForTimeout(600);
await shot(page, "06-boundary", "sign-dialog-desktop.png", "Cosigno Sign — signature surface", { full: false });
// draw signature
const canvas = page.locator("canvas");
if (await canvas.isVisible().catch(() => false)) {
  const b = await canvas.boundingBox();
  const cx = b.x + 70, cy = b.y + b.height - 60;
  await page.mouse.move(cx, cy); await page.mouse.down();
  for (let i = 0; i < 55; i++) await page.mouse.move(cx + i * 6, cy + Math.sin(i / 3.5) * 22, { steps: 2 });
  await page.mouse.up();
  await page.getByLabel(/your name for the signature record/i).fill("Nicholas").catch(() => {});
  await page.waitForTimeout(300);
  await shot(page, "06-boundary", "signature-drawn-desktop.png", "Signature drawn, ready to authorize", { full: false });
  await page.getByRole("button", { name: /Sign to authorize/i }).click().catch(() => {});
  await page.waitForTimeout(700);
  await shot(page, "06-boundary", "signature-sealed-desktop.png", "Signature sealing — Signed by Nicholas", { full: false });
  await page.waitForTimeout(2600);
}

console.log("== receipts / seal ==");
await goto(page, "/app/activity", "What changed?");
await shot(page, "08-activity", "activity-ledger-desktop.png", "Activity ledger — filters, search, today");
await page.getByRole("button", { name: /^Receipt$/i }).first().click().catch(() => {});
await page.getByText(/Permission used/i).waitFor({ timeout: 10_000 }).catch(() => {});
await page.waitForTimeout(400);
await shot(page, "08-activity", "trust-receipt-desktop.png", "Trust Receipt with Cosigno Seal", { full: false });
await page.getByRole("button", { name: /^trace$/i }).click().catch(() => {});
await page.waitForTimeout(400);
await shot(page, "08-activity", "trust-receipt-trace-desktop.png", "Trust Receipt — trace expanded", { full: false });
await page.keyboard.press("Escape");

console.log("== watch / standing orders ==");
await goto(page, "/app/watch", "What is cosigno watching?");
await shot(page, "07-watch", "watch-standing-orders-desktop.png", "Watch & standing orders");
await page.getByRole("button", { name: /new standing order/i }).click().catch(() => {});
await page.waitForTimeout(500);
await shot(page, "07-watch", "standing-order-create-desktop.png", "New standing order — trust modes (observe/prepare/operate)");

console.log("== connections ==");
await goto(page, "/app/connections");
await shot(page, "09-connections", "connections-desktop.png", "Connections — connect apps");

console.log("== settings / account ==");
await goto(page, "/app/settings");
await shot(page, "10-settings", "settings-desktop.png", "Settings landing");
await goto(page, "/app/account");
await page.waitForTimeout(600);
await shot(page, "10-settings", "account-desktop.png", "Account center");
// try the permission board panel
for (const [name, file, note] of [
  ["trust center", "account-permissions-desktop.png", "Trust panel — what cosigno may do"],
  ["profile", "account-profile-desktop.png", "Profile panel"],
  ["security", "account-security-desktop.png", "Security panel"],
  ["plan & usage", "account-usage-desktop.png", "Plan & usage panel"],
  ["connections", "account-integrations-desktop.png", "Connections panel"],
]) {
  const btn = page.getByRole("button", { name: new RegExp(`^${name}$`, "i") }).first();
  if (await btn.isVisible().catch(() => false)) {
    await btn.click().catch(() => {});
    await page.waitForTimeout(500);
    await shot(page, "10-settings", file, note);
  } else {
    log.push({ folder: "10-settings", file, note, ok: false, reason: `panel tab "${name}" not found on /app/account` });
  }
}

console.log("== other app surfaces ==");
for (const [path, folder, file, note, wait] of [
  ["/app/skills", "12-misc", "skills-desktop.png", "Skills marketplace", null],
  ["/app/files", "12-misc", "files-desktop.png", "Files (Take This entry point)", null],
  ["/app/memory", "12-misc", "rules-memory-desktop.png", "My Rules & Memory (personal operating rules)", null],
  ["/app/team", "12-misc", "team-desktop.png", "Team", null],
  ["/app/workspace", "12-misc", "workspace-desktop.png", "Workspace (shared delegations)", null],
  ["/app/health", "12-misc", "health-desktop.png", "Health / status", null],
  ["/app/autopilot", "12-misc", "autopilot-desktop.png", "Autopilot brief (legacy intelligence layer)", null],
  ["/app/decisions", "12-misc", "decisions-inbox-desktop.png", "Decision inbox (approval cards)", null],
]) {
  await goto(page, path, wait);
  await shot(page, folder, file, note);
}

console.log("== hold (authority brake) ==");
await page.request.post(`${BASE}/api/hold`, { data: { scope: "external" } }).catch(() => {});
await goto(page, "/app", "What should cosigno handle?");
await shot(page, "03-now", "cosigno-hold-active-desktop.png", "Cosigno Hold active — banner + control");
await page.request.post(`${BASE}/api/hold`, { data: { scope: "none" } }).catch(() => {});

console.log("== empty state (fresh delegations) ==");
{
  // A brand-new context with no data shows empty states cleanly.
  const ec = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  await ec.addInitScript(() => { try { localStorage.setItem("cosigno_intro_seen", "1"); } catch {} });
  const ep = await ec.newPage();
  wireErrors(ep);
  // note: demo store is shared, so this still shows seeded data; capture the
  // objectives empty state only if none — otherwise document in the audit.
  await ep.goto(`${BASE}/app/watch`, { waitUntil: "load", timeout: 90_000 }).catch(() => {});
  await ep.waitForTimeout(1500);
  await shot(ep, "13-states", "watch-empty-desktop.png", "Watch empty state (no standing orders)");
  await ec.close();
}

await ctx.close();

/* ------------------------------------------------------------- MOBILE ---- */
console.log("== mobile ==");
const mctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
await mctx.addInitScript(() => {
  try {
    localStorage.setItem("cosigno_intro_seen", "1");
    localStorage.setItem("cosigno_briefing_seen", String(Date.now()));
    localStorage.setItem("cosigno_name", "Nicholas");
  } catch {}
});
const mp = await mctx.newPage();
wireErrors(mp);
for (const [path, file, note, wait] of [
  ["/", "landing-mobile.png", "Landing (mobile)", null],
  ["/pricing", "pricing-mobile.png", "Pricing (mobile)", null],
  ["/app", "now-home-mobile.png", "NOW / home (mobile)", "Now"],
  ["/app/missions", "delegations-mobile.png", "Delegations (mobile)", "delegations"],
  ["/app/objectives", "objectives-mobile.png", "Objectives (mobile)", "objectives"],
  ["/app/focus", "boundary-focus-mobile.png", "Boundary / Focus (mobile)", null],
  ["/app/watch", "watch-mobile.png", "Watch (mobile)", "watch"],
  ["/app/activity", "activity-mobile.png", "Activity (mobile)", "activity"],
  ["/app/connections", "connections-mobile.png", "Connections (mobile)", null],
]) {
  await mp.goto(`${BASE}${path}`, { waitUntil: "load", timeout: 90_000 }).catch(() => {});
  if (wait) await mp.getByText(wait).first().waitFor({ timeout: 12_000 }).catch(() => {});
  await mp.waitForTimeout(700);
  await shot(mp, "mobile", file, note);
}
// mobile sign dialog
await mp.goto(`${BASE}/app/focus`, { waitUntil: "load", timeout: 90_000 }).catch(() => {});
await mp.getByText(/I need your decision/i).waitFor({ timeout: 12_000 }).catch(() => {});
await mp.getByRole("button", { name: /Sign →/i }).first().click().catch(() => {});
await mp.waitForTimeout(600);
await shot(mp, "mobile", "sign-dialog-mobile.png", "Cosigno Sign (mobile)", { full: false });
await mctx.close();

await browser.close();
writeFileSync(join(ROOT, "_capture-log.json"), JSON.stringify(log, null, 2));
const ok = log.filter((l) => l.ok).length;
console.log(`\nCaptured ${ok}/${log.length} screenshots. Log → screenshots/_capture-log.json`);
