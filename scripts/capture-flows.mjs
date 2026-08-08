// Flow capture: the moments a product is judged on, recorded as VIDEO as well
// as stills — loading, page transitions, the command bar, a mission running to
// its approval gate and past it, and a connection succeeding. Motion is most of
// what "premium" means here, and a PNG cannot show motion.
//
// scripts/review-shots.mjs covers static surfaces; this covers the sequences.
//
//   node scripts/capture-flows.mjs [outdir]      # default: screenshots/flows
//   BASE=http://localhost:3500 node scripts/capture-flows.mjs
//
// The dev server must already be listening on :3400 (demo mode is fine — it is
// the only mode where /app renders without live keys).
import { chromium } from "@playwright/test";
import { mkdirSync, renameSync, readdirSync } from "node:fs";
import { join } from "node:path";

// Pinned only where the image provides one; otherwise Playwright resolves its
// own installed browser (a hardcoded revision breaks on any other machine).

const OUT = process.argv[2] ?? join(process.cwd(), "screenshots", "flows");
const SHOTS = join(OUT, "screenshots");
const VIDEO = join(OUT, "video");
mkdirSync(SHOTS, { recursive: true });
mkdirSync(VIDEO, { recursive: true });

// Point at a production server with BASE=http://localhost:3500 — motion
// captured against `next dev` includes the dev overlay and compile pauses.
const BASE = process.env.BASE ?? "http://localhost:3400";
const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || undefined });

async function fresh(name, opts = {}) {
  const ctx = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    recordVideo: { dir: join(VIDEO, name), size: { width: 1440, height: 900 } },
    ...opts,
  });
  await ctx.addInitScript(() => {
    try {
      localStorage.setItem("cosigno_intro_seen", "1");
      localStorage.setItem("cosigno.name", "Nicholas");
    } catch {}
  });
  return ctx;
}

/** Playwright names videos by hash; give each clip its flow's name. */
async function close(ctx, name) {
  await ctx.close();
  const dir = join(VIDEO, name);
  const file = readdirSync(dir).find((f) => f.endsWith(".webm"));
  if (file) renameSync(join(dir, file), join(VIDEO, `${name}.webm`));
  console.log("video », " + name);
}

/* ---------------------- 1. app launch + loading ---------------------- */
{
  const ctx = await fresh("01-app-launch");
  const page = await ctx.newPage();
  await page.goto(`${BASE}/app`, { waitUntil: "commit" });
  await page.waitForTimeout(200);
  await page.screenshot({ path: join(SHOTS, "01-app-launch.png") });
  await page.waitForLoadState("networkidle");
  await page.waitForTimeout(1200);
  await page.screenshot({ path: join(SHOTS, "02-dashboard.png") });
  await close(ctx, "01-app-launch");
}

/* ---------------------- 2. page transitions -------------------------- */
{
  const ctx = await fresh("02-page-transitions");
  const page = await ctx.newPage();
  await page.goto(`${BASE}/app`, { waitUntil: "networkidle" });
  await page.waitForTimeout(800);
  for (const label of ["missions", "approvals", "activity", "connections", "home"]) {
    await page.getByRole("link", { name: label, exact: true }).first().click();
    await page.waitForTimeout(1100);
  }
  await close(ctx, "02-page-transitions");
}

/* ---------------------- 3. command bar ------------------------------- */
{
  const ctx = await fresh("03-command-bar");
  const page = await ctx.newPage();
  await page.goto(`${BASE}/app`, { waitUntil: "networkidle" });
  await page.waitForTimeout(600);
  await page.keyboard.press("ControlOrMeta+k");
  await page.waitForTimeout(900);
  await page.screenshot({ path: join(SHOTS, "03-command-bar.png") });
  await page.keyboard.type("inbox", { delay: 90 });
  await page.waitForTimeout(1200);
  await page.screenshot({ path: join(SHOTS, "04-command-bar-results.png") });
  await page.keyboard.press("Escape");
  await page.waitForTimeout(500);
  await close(ctx, "03-command-bar");
}

/* ------------- 4. mission start → approval → completion -------------- */
{
  const ctx = await fresh("04-mission-and-approval");
  const page = await ctx.newPage();
  await page.goto(`${BASE}/app`, { waitUntil: "networkidle" });
  await page.waitForTimeout(600);

  // Start it the way a person does: type into the ask box.
  await page.getByPlaceholder(/Ask cosigno anything/).fill("clean up my inbox");
  await page.waitForTimeout(400);
  await page.screenshot({ path: join(SHOTS, "05-mission-start.png") });

  // The inbox operator runs to a real approval gate.
  const res = await page.request.post(`${BASE}/api/missions`, {
    data: { template: "inbox_cleanup" },
  });
  const { mission } = await res.json();
  await page.goto(`${BASE}/app/missions/${mission.id}`, { waitUntil: "networkidle" });
  await page
    .getByText(/waiting for your signature/i)
    .first()
    .waitFor({ timeout: 20_000 })
    .catch(() => {});
  await page.waitForTimeout(1200);
  await page.screenshot({ path: join(SHOTS, "06-mission-running.png"), fullPage: true });

  await page.goto(`${BASE}/app/approvals`, { waitUntil: "networkidle" });
  await page.waitForTimeout(1200);
  await page.screenshot({ path: join(SHOTS, "07-approval-card.png"), fullPage: true });

  // Approve it and watch execution resume.
  const approve = page.getByRole("button", { name: /approve/i }).first();
  if (await approve.isVisible().catch(() => false)) {
    await approve.click();
    await page.waitForTimeout(2200);
    await page.screenshot({ path: join(SHOTS, "08-approval-executed.png"), fullPage: true });
  }

  await page.goto(`${BASE}/app/missions/${mission.id}`, { waitUntil: "networkidle" });
  await page.waitForTimeout(6000); // let the engine finish the remaining steps
  await page.reload({ waitUntil: "networkidle" });
  await page.waitForTimeout(1500);
  await page.screenshot({ path: join(SHOTS, "09-mission-complete.png"), fullPage: true });
  await close(ctx, "04-mission-and-approval");
}

/* ---------------------- 5. connections ------------------------------- */
{
  const ctx = await fresh("05-connections");
  const page = await ctx.newPage();
  // ?status=connected&key=… is exactly what the OAuth callback returns, so
  // this is the real success moment, not a mock of it.
  await page.goto(`${BASE}/app/connections?status=connected&key=google`, {
    waitUntil: "networkidle",
  });
  await page.waitForTimeout(700);
  await page.screenshot({ path: join(SHOTS, "10-connection-success.png") });
  await page.waitForTimeout(2600);
  await page.screenshot({ path: join(SHOTS, "11-connections.png") });
  await close(ctx, "05-connections");
}

/* ---------------------- 6. empty states ------------------------------ */
{
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  await ctx.addInitScript(() => {
    try {
      localStorage.setItem("cosigno_intro_seen", "1");
      localStorage.setItem("cosigno.name", "Nicholas");
    } catch {}
  });
  const page = await ctx.newPage();
  for (const [path, name] of [
    ["/app/activity", "12-activity"],
    ["/app/trust", "13-trust"],
  ]) {
    await page.goto(BASE + path, { waitUntil: "networkidle" });
    await page.waitForTimeout(1200);
    await page.screenshot({ path: join(SHOTS, `${name}.png`) });
  }
  await ctx.close();
}

await browser.close();
console.log("done");
