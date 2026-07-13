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

    // The first-run intro is covered by its own test below; everywhere else
    // the flag is pre-set so surfaces render in their steady state.
    test.beforeEach(async ({ page }) => {
      await page.addInitScript(() => {
        try {
          window.localStorage.setItem("cosigno_intro_seen", "1");
        } catch {
          /* storage may be unavailable */
        }
      });
    });

    test("first-run intro: three screens, once", async ({ page }) => {
      await page.addInitScript(() => {
        try {
          window.localStorage.removeItem("cosigno_intro_seen");
        } catch {
          /* ignore */
        }
      });
      await page.goto("/app", { waitUntil: "networkidle" });
      // Scope to the intro dialog — the dashboard shares this headline.
      await expect(
        page.getByRole("dialog").getByRole("heading", { name: "what do you need handled?" })
      ).toBeVisible();
      await page.getByRole("button", { name: "see how it works" }).click();
      await expect(page.getByRole("heading", { name: "how a mission works" })).toBeVisible();
      await page.getByRole("button", { name: "one more thing" }).click();
      await expect(page.getByRole("heading", { name: "you stay in control" })).toBeVisible();
      await page.screenshot({ path: join(OUT, `intro-control-${vp.name}.png`) });
      await page.getByRole("button", { name: /i understand/ }).click();
      await expect(page.getByRole("dialog")).toHaveCount(0);
      // Dismissing persisted the seen flag — future visits skip the intro.
      // (A reload here would re-run this test's flag-clearing init script,
      // so the flag itself is the assertion.)
      expect(
        await page.evaluate(() => window.localStorage.getItem("cosigno_intro_seen"))
      ).toBe("1");
    });

    // §5 QA harness: walk the core surfaces and assert nothing threw an
    // uncaught error and nothing overflows horizontally. Dev-server noise
    // (React DevTools banner, favicon/resource 404s, source maps, dev-only
    // hydration warnings) is filtered; real app errors + pageerrors are not.
    test("no uncaught errors + no overflow across surfaces", async ({ page }) => {
      // A long walk (20+ surfaces, each waiting for networkidle) — give it
      // room beyond the default 120s per-test budget.
      test.setTimeout(240_000);
      const errors: string[] = [];
      const IGNORE =
        /(React DevTools|ResizeObserver loop|favicon|\/_next\/|hydrat|Extra attributes from the server|Failed to load resource|net::ERR|status of 4|status of 5)/i;
      page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));
      page.on("console", (m) => {
        if (m.type() === "error" && !IGNORE.test(m.text())) errors.push(`console: ${m.text()}`);
      });
      for (const path of ["/", "/product", "/operators", "/demo", "/templates", "/security", "/pricing", "/privacy", "/terms", "/app", "/app/missions", "/app/decisions", "/app/automations", "/app/connections", "/app/memory", "/app/files", "/app/team", "/app/health", "/app/activity", "/app/account", "/app/workspace", "/sign-in"]) {
        await page.goto(path, { waitUntil: "networkidle" });
        await page.waitForTimeout(300);
        await noHorizontalScroll(page);
      }
      expect(errors, errors.join("\n")).toEqual([]);
    });

    test("landing", async ({ page }) => {
      await page.goto("/", { waitUntil: "networkidle" });
      await expect(
        page.getByRole("heading", { name: "tell cosigno what you need done." })
      ).toBeVisible();
      // Hero viewport capture FIRST, while the composed scene is pristine at
      // the top of the page — its floating cards use scroll-driven parallax,
      // which the fullPage tiling below would otherwise disturb.
      await page.waitForTimeout(700);
      await noHorizontalScroll(page);
      await page.screenshot({ path: join(OUT, `landing-${vp.name}.png`) });
      // Then scroll through so on-reveal sections animate in, and capture the
      // full page as a layout reference.
      await page.evaluate(async () => {
        for (let y = 0; y <= document.body.scrollHeight; y += 400) {
          window.scrollTo(0, y);
          await new Promise((r) => setTimeout(r, 60));
        }
        window.scrollTo(0, 0);
      });
      await page.waitForTimeout(400);
      await page.screenshot({ path: join(OUT, `landing-full-${vp.name}.png`), fullPage: true });
    });

    test("pricing", async ({ page }) => {
      await page.goto("/pricing", { waitUntil: "networkidle" });
      await expect(page.getByText("most popular")).toBeVisible();
      // drive the actions slider — the covering tier should update live
      const probe = page.locator("#probe");
      await expect(probe).toBeVisible();
      await probe.fill("5000");
      await expect(page.getByText(/max covers 5,000 actions/i)).toBeVisible();
      // open a FAQ item (deep-linkable accordion)
      await page.getByRole("button", { name: /what counts as an action/i }).click();
      // toggle to annual to exercise the animated price count
      await page.getByRole("button", { name: /2 months free/ }).click();
      await page.evaluate(async () => {
        for (let y = 0; y <= document.body.scrollHeight; y += 400) {
          window.scrollTo(0, y);
          await new Promise((r) => setTimeout(r, 60));
        }
        window.scrollTo(0, 0);
      });
      await page.waitForTimeout(400);
      await noHorizontalScroll(page);
      await page.screenshot({ path: join(OUT, `pricing-${vp.name}.png`), fullPage: true });
    });

    test("live preview: command palette + executed card + audit row", async ({ page }) => {
      await page.goto("/", { waitUntil: "networkidle" });
      const preview = page.locator("#sandbox");
      await preview.scrollIntoViewIfNeeded();
      // Wait for the lazy-loaded sandbox to hydrate.
      await expect(preview.getByText(/sandbox — simulated tools/)).toBeVisible();
      // focusing the input opens the command palette; pick a grouped suggestion
      await preview.getByPlaceholder(/type a command/).click();
      await preview.getByRole("option", { name: "clear my inbox of newsletters" }).click();
      // A tier-1 card auto-executes; approve the tier-2 card too.
      await preview.getByRole("button", { name: "approve" }).first().click();
      await expect(preview.getByText(/simulated/i).first()).toBeVisible();
      // reveal the audit row the toy "wrote"
      await preview.getByRole("button", { name: /what just happened/i }).first().click();
      await expect(preview.getByText(/audit_log/i)).toBeVisible();
      await noHorizontalScroll(page);
      await preview.scrollIntoViewIfNeeded();
      await preview.screenshot({ path: join(OUT, `preview-${vp.name}.png`) });
    });

    test("landing interactive widgets", async ({ page }) => {
      await page.goto("/", { waitUntil: "networkidle" });

      // --- approval story (§3 script): approve card 1, then the tier-3 refund
      // (typed-confirm) card slides in — a stable, filmable mid-story state.
      const story = page.locator("section", {
        hasText: "one command. one signature. done.",
      });
      await story.scrollIntoViewIfNeeded();
      await expect(story.getByText(/draft replies to your 3 most recent leads/i)).toBeVisible();
      const approve = story.getByRole("button", { name: "approve" });
      await expect(approve).toBeVisible();
      await approve.click();
      // the locked tier-3 refund card appears and asks for typed confirmation
      await expect(story.getByText(/refund \$48\.00/i)).toBeVisible();
      await expect(story.getByText(/type .*confirm.* to authorize/i)).toBeVisible();
      await noHorizontalScroll(page);
      await story.screenshot({ path: join(OUT, `story-${vp.name}.png`) });

      // --- tier board: move "send email" into Auto → consequence warning
      const board = page.locator("section", { hasText: "you set the rope" });
      await board.scrollIntoViewIfNeeded();
      await expect(board.getByRole("button", { name: "send email" })).toBeVisible();
      await board.getByRole("button", { name: "send email" }).click();
      await board.getByRole("button", { name: "move here" }).first().click();
      await expect(board.getByText(/emails would now send without asking/i)).toBeVisible();
      await noHorizontalScroll(page);
      await board.screenshot({ path: join(OUT, `tierboard-${vp.name}.png`) });
    });

    test("home dashboard: the four-question layout", async ({ page }) => {
      await page.goto("/app", { waitUntil: "networkidle" });
      await expect(page.getByRole("heading", { name: "What do you need handled?" })).toBeVisible();
      // The ask box + the four honest section headings (stable regardless of
      // how much data exists in the shared demo store).
      await expect(page.getByPlaceholder(/Ask cosigno to handle something/)).toBeVisible();
      await expect(page.getByRole("button", { name: /Start Mission/ })).toBeVisible();
      await expect(page.getByText("In progress").first()).toBeVisible();
      await expect(page.getByText("Needs your approval").first()).toBeVisible();
      await expect(page.getByText("Connected apps").first()).toBeVisible();
      await noHorizontalScroll(page);
      await page.screenshot({ path: join(OUT, `dashboard-${vp.name}.png`), fullPage: true });
    });

    test("ask box: file + link controls, and the paste-a-link field fits", async ({ page }) => {
      await page.goto("/app", { waitUntil: "networkidle" });
      // The four honest controls sit under the ask box (no voice).
      await expect(page.getByRole("button", { name: "Add file" })).toBeVisible();
      await expect(page.getByRole("button", { name: "Add link" })).toBeVisible();
      await expect(page.getByRole("button", { name: "Choose apps" })).toBeVisible();
      // Add link opens a compact field with Add + Cancel, and never overflows.
      await page.getByRole("button", { name: "Add link" }).click();
      await expect(page.getByPlaceholder(/Paste a link/)).toBeVisible();
      await expect(page.getByRole("button", { name: "Cancel" })).toBeVisible();
      await noHorizontalScroll(page);
      await page.screenshot({ path: join(OUT, `ask-sources-${vp.name}.png`) });
    });

    test("workspace with a proposed card", async ({ page }) => {
      await page.goto("/app/workspace", { waitUntil: "networkidle" });
      const box = page.getByPlaceholder(/what do you want cosigno to handle/);
      await expect(box).toBeVisible();
      await box.fill("reprice these products for the summer sale");
      await page.keyboard.press("Enter");
      await expect(page.getByText(/awaiting your sign-off/).first()).toBeVisible();
      // The clarity system: mission state chip + the "what is cosigno doing?"
      // guide with its honest no-changes line and the visible plan.
      await expect(page.getByText("waiting for your approval").first()).toBeVisible();
      const guide = page.getByRole("button", { name: /what is cosigno doing/i });
      await expect(guide).toBeVisible();
      await guide.click();
      await expect(page.getByText(/waiting for your (typed )?approval\.?/).first()).toBeVisible();
      await noHorizontalScroll(page);
      await page.screenshot({ path: join(OUT, `workspace-${vp.name}.png`), fullPage: true });
      await guide.click();
    });

    test("living logo — one breather, and static under reduced motion", async ({
      page,
    }) => {
      // Default motion: after idle registration + observation settles, at most
      // ONE mark on the landing page carries the breath class.
      await page.goto("/", { waitUntil: "networkidle" });
      await page.waitForTimeout(900); // requestIdleCallback + IO callback
      const breathing = page.locator(".animate-logo-breath");
      expect(await breathing.count()).toBeLessThanOrEqual(1);
      // The mark itself always renders (the breath is additive, never required).
      await expect(page.locator("header svg").first()).toBeVisible();

      // Reduced motion: the coordinator never activates — no mark breathes —
      // but every logo still renders. This is the reduced-motion guarantee.
      await page.emulateMedia({ reducedMotion: "reduce" });
      await page.reload({ waitUntil: "networkidle" });
      await page.waitForTimeout(900);
      expect(await page.locator(".animate-logo-breath").count()).toBe(0);
      await expect(page.locator("header svg").first()).toBeVisible();
      await noHorizontalScroll(page);
      await page.screenshot({ path: join(OUT, `logo-reduced-motion-${vp.name}.png`) });
      await page.emulateMedia({ reducedMotion: null });
    });

    test("activity", async ({ page }) => {
      await page.goto("/app/activity");
      await expect(page.getByRole("heading", { name: "activity" })).toBeVisible();
      await noHorizontalScroll(page);
      await page.screenshot({ path: join(OUT, `activity-${vp.name}.png`), fullPage: true });
    });

    test("compiler: an open-ended goal becomes a real, previewed plan", async ({ page }) => {
      await page.goto("/app/missions", { waitUntil: "networkidle" });
      const box = page.getByPlaceholder(/compare the best laptops/i);
      await expect(box).toBeVisible();
      await box.fill("compare the best laptops under $1,000");
      await page.getByRole("button", { name: "plan it" }).click();
      // The goal-understanding preview appears, built only from real tools.
      await expect(page.getByText("i understood the goal")).toBeVisible();
      await expect(page.getByText(/created this plan from your goal/i)).toBeVisible();
      await expect(page.getByText(/no supported payment connection|payment/i).first()).toBeVisible();
      await noHorizontalScroll(page);
      await page.screenshot({ path: join(OUT, `compiler-preview-${vp.name}.png`), fullPage: true });
    });

    test("checkout: giant card choreography (demo)", async ({ page }) => {
      await page.goto("/checkout?plan=pro", { waitUntil: "networkidle" });
      await expect(page.getByText(/name on card/i)).toBeVisible();
      await expect(page.getByText(/you're upgrading to/i)).toBeVisible();
      await noHorizontalScroll(page);
      // idle
      await page.screenshot({ path: join(OUT, `checkout-${vp.name}.png`), fullPage: true });

      // fill the card (demo signals only — dots fill, brand flips in)
      await page.locator("#cardholder").fill("alex operator");
      await page.locator("#demo-num").fill("4242424242424242");
      await page.getByLabel("expiry MMYY").fill("1230");
      // CVC focus flips the card to its back — the signature moment
      await page.getByLabel("CVC").click();
      await page.getByLabel("CVC").fill("123");
      await page.waitForTimeout(650);
      await noHorizontalScroll(page);
      await page.screenshot({ path: join(OUT, `checkout-cvc-${vp.name}.png`), fullPage: true });

      // pay → the card slides to the reader, then pops back stamped
      await page.getByRole("button", { name: /pay & cosign/i }).click();
      await expect(page.getByText(/cosigned\. welcome to pro/i)).toBeVisible();
      await page.waitForTimeout(500);
      await noHorizontalScroll(page);
      await page.screenshot({ path: join(OUT, `checkout-success-${vp.name}.png`), fullPage: true });
    });

    test("account center — all five panels", async ({ page }) => {
      await page.goto("/app/account", { waitUntil: "networkidle" });
      await expect(page.getByRole("heading", { name: "account", exact: true })).toBeVisible();

      // profile (default panel)
      await expect(page.getByRole("heading", { name: "profile" })).toBeVisible();
      await page.waitForTimeout(250); // let the fade-through transition settle
      await noHorizontalScroll(page);
      await page.screenshot({ path: join(OUT, `account-profile-${vp.name}.png`), fullPage: true });

      // permissions — the three-column tier board
      await page.getByRole("button", { name: "permissions" }).click();
      await expect(page.getByRole("heading", { name: "permissions" })).toBeVisible();
      await page.waitForTimeout(250);
      await noHorizontalScroll(page);
      await page.screenshot({ path: join(OUT, `account-permissions-${vp.name}.png`), fullPage: true });

      // plan & usage — the usage ring + sparkline + plan card
      await page.getByRole("button", { name: "plan & usage" }).click();
      await expect(page.getByText(/actions used this cycle/)).toBeVisible();
      await page.waitForTimeout(250);
      await noHorizontalScroll(page);
      await page.screenshot({ path: join(OUT, `account-usage-${vp.name}.png`), fullPage: true });

      // connections — third-party apps + custom MCP servers
      await page.getByRole("button", { name: "connections" }).click();
      await expect(page.getByRole("heading", { name: "connections" })).toBeVisible();
      await page.waitForTimeout(400);
      await noHorizontalScroll(page);
      await page.screenshot({ path: join(OUT, `account-integrations-${vp.name}.png`), fullPage: true });

      // security — audit trail + injection tiles
      await page.getByRole("button", { name: "security" }).click();
      await expect(page.getByRole("heading", { name: "security" })).toBeVisible();
      await page.waitForTimeout(250);
      await noHorizontalScroll(page);
      await page.screenshot({ path: join(OUT, `account-security-${vp.name}.png`), fullPage: true });
    });
  });
}
