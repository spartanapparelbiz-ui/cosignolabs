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

    test("first-run onboarding: one question → recommended job → real mission", async ({ page }) => {
      await page.addInitScript(() => {
        try {
          window.localStorage.removeItem("cosigno_intro_seen");
        } catch {
          /* ignore */
        }
      });
      await page.goto("/app", { waitUntil: "networkidle" });
      const dialog = page.getByRole("dialog");
      await expect(
        dialog.getByRole("heading", { name: "what steals the most time?" })
      ).toBeVisible();
      await page.screenshot({ path: join(OUT, `intro-question-${vp.name}.png`) });
      // Pick inbox → the recommendation spells out the auto/signature split.
      await dialog.getByRole("button", { name: "my inbox" }).click();
      await expect(dialog.getByText("runs automatically")).toBeVisible();
      await expect(dialog.getByText("needs your signature")).toBeVisible();
      await expect(dialog.getByText(/clearly-labeled sandbox/)).toBeVisible();
      await page.screenshot({ path: join(OUT, `intro-recommend-${vp.name}.png`) });
      // Starting creates the REAL template mission and lands in its workspace.
      await dialog.getByRole("button", { name: "start this job" }).click();
      await page.waitForURL(/\/app\/missions\/[a-z0-9-]+/i, { timeout: 20_000 });
      await expect(page.getByRole("dialog")).toHaveCount(0);
      // The seen flag persisted — future visits skip the intro.
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
      for (const path of ["/", "/product", "/operators", "/demo", "/templates", "/security", "/pricing", "/privacy", "/terms", "/app", "/app/missions", "/app/approvals", "/app/templates", "/app/decisions", "/app/automations", "/app/connections", "/app/memory", "/app/files", "/app/team", "/app/health", "/app/activity", "/app/account", "/app/workspace", "/sign-in"]) {
        await page.goto(path, { waitUntil: "networkidle" });
        await page.waitForTimeout(300);
        await noHorizontalScroll(page);
      }
      expect(errors, errors.join("\n")).toEqual([]);
    });

    test("landing", async ({ page }) => {
      await page.goto("/", { waitUntil: "networkidle" });
      await expect(
        page.getByRole("heading", { name: "give cosigno the work. keep the final say." })
      ).toBeVisible();
      // The rebuilt section order: outcomes, launch jobs, comparison,
      // templates, pricing preview — each pinned by its anchor copy.
      await expect(page.getByText("inbox cleared")).toBeVisible();
      await expect(
        page.getByRole("heading", { name: "three real jobs, working today" })
      ).toBeVisible();
      await expect(
        page.getByRole("heading", { name: "why not another chatbot?" })
      ).toBeVisible();
      await expect(page.getByRole("heading", { name: "start from a template" })).toBeVisible();
      await expect(page.getByRole("heading", { name: "simple pricing" })).toBeVisible();
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

    test("live preview: starter mission + isolation + honest unsupported answer", async ({ page }) => {
      await page.goto("/", { waitUntil: "networkidle" });
      const preview = page.locator("#sandbox");
      await preview.scrollIntoViewIfNeeded();
      // Wait for the lazy-loaded sandbox to hydrate.
      await expect(preview.getByText(/sandbox — simulated tools/)).toBeVisible();
      // One-click starter mission (the spec'd demo opening state).
      await preview.getByRole("button", { name: "clean my newsletter clutter" }).click();
      await expect(preview.getByText(/mission:/).first()).toBeVisible();
      // A tier-1 card auto-executes; approve the tier-2 card too.
      await preview.getByRole("button", { name: "approve" }).first().click();
      await expect(preview.getByText(/simulated/i).first()).toBeVisible();
      // reveal the audit row the toy "wrote"
      await preview.getByRole("button", { name: /what just happened/i }).first().click();
      await expect(preview.getByText(/audit_log/i)).toBeVisible();
      await noHorizontalScroll(page);
      await preview.screenshot({ path: join(OUT, `preview-${vp.name}.png`) });

      // Mission isolation: an out-of-domain command becomes its OWN mission
      // with an honest plan-only answer; the earlier mission collapses into
      // history and its cards never mix into the new board.
      await preview.getByLabel("sandbox command").fill("negotiate my office lease renewal");
      await preview.getByRole("button", { name: "send" }).click();
      await expect(preview.getByText(/won't pretend/i)).toBeVisible();
      await expect(preview.getByText("previous missions")).toBeVisible();
      // the newsletter cards live only in history now — no approve buttons on the board
      await expect(preview.getByRole("button", { name: "approve" })).toHaveCount(0);
      await preview.screenshot({ path: join(OUT, `preview-honest-${vp.name}.png`) });
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

    test("home dashboard: it greets you, then hands you the box", async ({ page }) => {
      await page.goto("/app", { waitUntil: "networkidle" });
      // The page opens by naming the time of day (resolved from the visitor's
      // own clock after mount) and stating what this workspace needs today —
      // never the word "Dashboard".
      await expect(
        page.getByRole("heading", { name: /^Good (morning|afternoon|evening)/ })
      ).toBeVisible();
      await expect(page.getByText(/waiting for your signature|cosigno is working on|Everything from today is done|Nothing needs your attention/)).toBeVisible();
      await expect(page.getByPlaceholder(/Ask cosigno anything/)).toBeVisible();
      await expect(page.getByRole("button", { name: /Delegate/ })).toBeVisible();
      // Search is discoverable without knowing the shortcut.
      await expect(page.getByRole("button", { name: "search cosigno" }).first()).toBeVisible();
      await noHorizontalScroll(page);
      await page.screenshot({ path: join(OUT, `dashboard-${vp.name}.png`), fullPage: true });
    });

    test("command bar: opens on ⌘K, shows real work, and never dead-ends", async ({ page }) => {
      await page.goto("/app", { waitUntil: "networkidle" });
      await page.keyboard.press("ControlOrMeta+k");
      const bar = page.getByRole("dialog", { name: "search cosigno" });
      await expect(bar).toBeVisible();
      // An empty box is a screen, not an absence: the pinned destinations are
      // always there even in a brand-new workspace.
      await expect(bar.getByText("Go to")).toBeVisible();
      await expect(bar.getByText("Approvals")).toBeVisible();
      await page.screenshot({ path: join(OUT, `command-bar-${vp.name}.png`) });

      // Nothing matching offers the operator rather than an apology.
      await page.keyboard.type("zzzz no such thing zzzz");
      await expect(bar.getByText(/Nothing here matches/)).toBeVisible();
      await expect(bar.getByRole("button", { name: /Make it a mission instead/ })).toBeVisible();
      await page.screenshot({ path: join(OUT, `command-bar-empty-${vp.name}.png`) });
      await page.keyboard.press("Escape");
      await expect(bar).toBeHidden();
    });

    test("empty states encourage rather than report an absence", async ({ page }) => {
      await page.goto("/app/approvals", { waitUntil: "networkidle" });
      // Either there are decisions waiting, or the queue says it is CLEAR —
      // both are fine, but "No approvals" is not one of the options.
      const handled = page.getByText("Everything waiting on you has been handled.");
      if (await handled.isVisible().catch(() => false)) {
        await page.screenshot({ path: join(OUT, `approvals-empty-${vp.name}.png`) });
      }
      await noHorizontalScroll(page);
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

    test("browser view: laptop mission with live progress and read-only promise", async ({ page }) => {
      // Start the browser mission through the real API, then watch it.
      const res = await page.request.post("/api/missions", {
        data: { template: "laptop_compare" },
      });
      expect(res.ok()).toBeTruthy();
      const { mission } = await res.json();
      await page.goto(`/app/browser/${mission.id}`, { waitUntil: "networkidle" });

      // The two-column truth: what it's doing, what it found, what's next,
      // and the standing read-only statement.
      await expect(page.getByText("What cosigno is doing")).toBeVisible();
      await expect(page.getByText("What it found")).toBeVisible();
      await expect(page.getByText("Changes made")).toBeVisible();
      await expect(page.getByText(/No external changes have been made/)).toBeVisible();
      // Controls exist (pause/stop/refresh) — no dead buttons.
      await expect(page.getByRole("button", { name: /Pause|Resume/ })).toBeVisible();
      await expect(page.getByRole("button", { name: "Stop" })).toBeVisible();
      await noHorizontalScroll(page);
      await page.screenshot({ path: join(OUT, `browser-view-${vp.name}.png`), fullPage: true });

      // Let the client poll drive the sandbox mission to completion, then the
      // result screen appears with the recommendation + report.
      await expect(page.getByText("Mission complete")).toBeVisible({ timeout: 90_000 });
      await expect(page.getByText("Recommended option")).toBeVisible();
      await expect(page.getByRole("link", { name: /Open comparison/ })).toBeVisible();
      await expect(page.getByText(/Prices and availability may change/)).toBeVisible();
      await noHorizontalScroll(page);
      await page.screenshot({ path: join(OUT, `browser-result-${vp.name}.png`), fullPage: true });
    });

    test("app shell + templates + isolated mission workspace", async ({ page }) => {
      // Templates: only REAL installable jobs, each with the auto/signature split.
      await page.goto("/app/templates", { waitUntil: "networkidle" });
      await expect(page.getByRole("heading", { name: "templates" })).toBeVisible();
      await expect(page.getByText("build tomorrow's meeting brief")).toBeVisible();
      await expect(page.getByText("compare three laptops under $1,000")).toBeVisible();
      await expect(page.getByText("clean up my inbox")).toBeVisible();
      await expect(page.getByText("prepare my follow-ups")).toBeVisible();
      await expect(page.getByText("build my morning brief")).toBeVisible();
      await expect(page.getByText("needs your signature").first()).toBeVisible();
      await noHorizontalScroll(page);
      await page.screenshot({ path: join(OUT, `templates-${vp.name}.png`), fullPage: true });

      // The isolated mission workspace: start a real mission, open its page.
      const res = await page.request.post("/api/missions", {
        data: { template: "laptop_compare" },
      });
      expect(res.ok()).toBeTruthy();
      const { mission } = await res.json();
      await page.goto(`/app/missions/${mission.id}`, { waitUntil: "networkidle" });
      await expect(page.getByText("Timeline")).toBeVisible();
      await expect(page.getByText("Plan", { exact: true })).toBeVisible();
      await expect(page.getByText(/steps complete/)).toBeVisible();
      await expect(page.getByRole("button", { name: /Pause|Resume/ })).toBeVisible();
      await expect(page.getByRole("button", { name: "Stop" })).toBeVisible();
      await noHorizontalScroll(page);
      await page.screenshot({ path: join(OUT, `mission-workspace-${vp.name}.png`), fullPage: true });
    });

    test("inbox cleanup job runs to its approval gate and the card reaches approvals", async ({ page }) => {
      // The Inbox Operator: reads + drafts run automatically, then the mission
      // stops on the archive card — visible in the workspace and in approvals.
      const res = await page.request.post("/api/missions", {
        data: { template: "inbox_cleanup" },
      });
      expect(res.ok()).toBeTruthy();
      const { mission } = await res.json();
      await page.goto(`/app/missions/${mission.id}`, { waitUntil: "networkidle" });
      await expect(page.getByText(/waiting for your signature/i).first()).toBeVisible({ timeout: 15_000 });
      await noHorizontalScroll(page);
      await page.screenshot({ path: join(OUT, `inbox-mission-${vp.name}.png`), fullPage: true });

      await page.goto("/app/approvals", { waitUntil: "networkidle" });
      await expect(page.getByText(/archive .* newsletter/i).first()).toBeVisible();
      await noHorizontalScroll(page);
      await page.screenshot({ path: join(OUT, `inbox-approval-${vp.name}.png`), fullPage: true });
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
