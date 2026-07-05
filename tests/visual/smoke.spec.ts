import { test, expect, type Page } from "@playwright/test";
import { mkdirSync } from "node:fs";
import { join } from "node:path";

/**
 * Visual smoke test: screenshots every surface at 390px (mobile) and
 * 1440px (desktop), and asserts the core states render — landing, the live
 * preview with an executed card, the workspace with a proposed card,
 * activity, and settings. Screenshots land in tests/visual/__screenshots__.
 * Runs against the demo-mode production server (see playwright.config.ts).
 */

const OUT = join(process.cwd(), "tests", "visual", "__screenshots__");
mkdirSync(OUT, { recursive: true });

const VIEWPORTS = [
  { name: "mobile", width: 390, height: 844 },
  { name: "desktop", width: 1440, height: 900 },
];

async function noHorizontalScroll(page: Page) {
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth
  );
  expect(overflow, "no horizontal scroll").toBeLessThanOrEqual(1);
}

for (const vp of VIEWPORTS) {
  test.describe(`${vp.name} (${vp.width}px)`, () => {
    test.use({ viewport: { width: vp.width, height: vp.height } });

    test("landing", async ({ page }) => {
      await page.goto("/", { waitUntil: "networkidle" });
      await expect(
        page.getByRole("heading", { name: "the AI operator that asks first." })
      ).toBeVisible();
      // Scroll through so on-reveal sections animate in before capture.
      await page.evaluate(async () => {
        for (let y = 0; y <= document.body.scrollHeight; y += 400) {
          window.scrollTo(0, y);
          await new Promise((r) => setTimeout(r, 60));
        }
        window.scrollTo(0, 0);
      });
      await page.waitForTimeout(400);
      await noHorizontalScroll(page);
      await page.screenshot({ path: join(OUT, `landing-${vp.name}.png`), fullPage: true });
    });

    test("live preview with an executed card", async ({ page }) => {
      await page.goto("/", { waitUntil: "networkidle" });
      const preview = page.locator("#try");
      await preview.scrollIntoViewIfNeeded();
      // Wait for the lazy-loaded sandbox to hydrate.
      await expect(preview.getByText(/sandbox — simulated tools/)).toBeVisible();
      await preview.getByRole("button", { name: "clear my inbox of newsletters" }).click();
      // A tier-1 card auto-executes; approve the tier-2 card too.
      await preview.getByRole("button", { name: "approve" }).first().click();
      await expect(preview.getByText(/simulated/i).first()).toBeVisible();
      await noHorizontalScroll(page);
      await preview.scrollIntoViewIfNeeded();
      await preview.screenshot({ path: join(OUT, `preview-${vp.name}.png`) });
    });

    test("workspace with a proposed card", async ({ page }) => {
      await page.goto("/app", { waitUntil: "networkidle" });
      const box = page.getByPlaceholder(/tell cosigno what to do/);
      await expect(box).toBeVisible();
      await box.fill("reprice these products for the summer sale");
      await page.keyboard.press("Enter");
      await expect(page.getByText(/awaiting your sign-off/).first()).toBeVisible();
      await noHorizontalScroll(page);
      await page.screenshot({ path: join(OUT, `workspace-${vp.name}.png`), fullPage: true });
    });

    test("activity", async ({ page }) => {
      await page.goto("/app/activity");
      await expect(page.getByRole("heading", { name: "activity" })).toBeVisible();
      await noHorizontalScroll(page);
      await page.screenshot({ path: join(OUT, `activity-${vp.name}.png`), fullPage: true });
    });

    test("account center", async ({ page }) => {
      await page.goto("/app/account", { waitUntil: "networkidle" });
      await expect(page.getByRole("heading", { name: "account", exact: true })).toBeVisible();
      // land on the permissions panel and screenshot the tier board
      await page.getByRole("button", { name: "permissions" }).click();
      await expect(page.getByText(/how much rope the operator gets/)).toBeVisible();
      await noHorizontalScroll(page);
      await page.screenshot({ path: join(OUT, `account-${vp.name}.png`), fullPage: true });
    });
  });
}
