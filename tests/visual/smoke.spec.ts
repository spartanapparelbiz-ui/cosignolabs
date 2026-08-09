import { test, expect, type Page } from "@playwright/test";
import { mkdirSync } from "node:fs";
import { join } from "node:path";

/**
 * Visual smoke test: screenshots every surface at 390px (mobile) and
 * 1440px (desktop), and asserts the core states render — landing, the live
 * preview with an executed card, a real mission from start to its approval
 * gate, activity, and the account center. Screenshots land in
 * tests/visual/__screenshots__. Runs against the dev server (see
 * playwright.config.ts).
 *
 * The three properties every surface has to keep, checked on all of them
 * rather than asserted once: nothing throws, nothing scrolls sideways, and
 * the keyboard can reach the content without walking the whole rail.
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

    /**
     * There is no onboarding to skip any more, and that is the assertion.
     * cosigno used to open on a modal asking what stole the most of your
     * time; the whole point of removing it is that a first-time visitor
     * lands on the working product, so a test that a dialog does NOT appear
     * is the one that would catch it coming back.
     */
    test("a first-time visitor lands straight in the product", async ({ page }) => {
      await page.goto("/app", { waitUntil: "networkidle" });
      await expect(page.getByRole("dialog")).toHaveCount(0);
      await expect(
        page.getByRole("heading", { name: "What do you want to get done?" })
      ).toBeVisible();
      // The ask box is the first thing, and it is usable immediately.
      await expect(page.getByPlaceholder(/Ask cosigno anything/i)).toBeVisible();
      await noHorizontalScroll(page);
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

    /**
     * The three accessibility properties that are easy to lose and expensive
     * to lose: the keyboard can reach the content, the workspace announces
     * itself in landmarks, and reduced motion leaves the product usable
     * rather than half-faded.
     */
    test("keyboard, landmarks, and reduced motion", async ({ page }) => {
      await page.goto("/app", { waitUntil: "networkidle" });

      // The very first tab stop skips the rail. Without it, reaching the page
      // content means tabbing through eleven navigation items, every time.
      await page.keyboard.press("Tab");
      const first = await page.evaluate(() => document.activeElement?.textContent?.trim());
      expect(first).toBe("Skip to content");

      // One main landmark, and navigation that says what it is.
      expect(await page.locator("main#main").count()).toBe(1);
      expect(await page.getByRole("navigation", { name: "app navigation" }).count()).toBeGreaterThan(0);

      // Reduced motion: nothing may be left invisible by an animation that
      // never ran. This is the failure mode of "collapse everything to 0ms".
      await page.emulateMedia({ reducedMotion: "reduce" });
      await page.reload({ waitUntil: "networkidle" });
      await page.waitForTimeout(600);
      const invisible = await page.evaluate(() =>
        [...document.querySelectorAll("main *")]
          .filter(
            (el) =>
              parseFloat(getComputedStyle(el).opacity) < 0.05 &&
              el.getBoundingClientRect().height > 8
          )
          .map((el) => el.tagName)
      );
      expect(invisible, "content hidden behind an animation that never played").toEqual([]);
      await noHorizontalScroll(page);
      await page.screenshot({ path: join(OUT, `reduced-motion-app-${vp.name}.png`), fullPage: true });
      await page.emulateMedia({ reducedMotion: null });
    });

    /**
     * LABEL IN NAME (WCAG 2.5.3), swept across the workspace.
     *
     * When a control shows words, the name assistive technology reports must
     * contain those words — someone driving the page by voice says what they
     * can see. An aria-label that substitutes different words makes the
     * control unreachable by speech: nothing looks broken, nothing warns, and
     * it fails only for the people least able to work around it.
     *
     * This found the workspace kill switch reading "Stop all" while
     * announcing itself as "emergency stop — pause every AI action".
     *
     * Only short, literal labels are checked. A card-sized link whose
     * aria-label summarises its contents is good practice, not a violation.
     */
    test("every control can be reached by saying what it says", async ({ page }) => {
      const violations: string[] = [];
      for (const path of ["/app", "/app/missions", "/app/approvals", "/app/connections", "/app/account"]) {
        await page.goto(path, { waitUntil: "networkidle" });
        const found = await page.evaluate(() => {
          // The wordmark renders a dotless ı so the brand dot can sit above
          // it; spoken aloud it is the same word.
          const norm = (t: string | null) =>
            (t || "").replace(/ı/g, "i").replace(/\s+/g, " ").trim().toLowerCase();
          const out: string[] = [];
          for (const el of document.querySelectorAll("button, a[href], [role=switch], [role=tab]")) {
            const label = el.getAttribute("aria-label");
            const visible = norm(el.textContent);
            // No visible words: the aria-label IS the name, correctly.
            // Long text: a summarising label on a card, not a substituted one.
            if (!label || !visible || visible.length > 40) continue;
            if (!norm(label).includes(visible)) {
              out.push(`shows "${visible}" — announced as "${label}"`);
            }
          }
          return out;
        });
        for (const f of found) violations.push(`${path}: ${f}`);
      }
      expect([...new Set(violations)], "controls that cannot be said out loud").toEqual([]);
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
      // The slider answers one question: which tier covers this many actions.
      await expect(page.getByText(/covers that/i)).toBeVisible();
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

    test("home: one question, one box, six worked examples", async ({ page }) => {
      await page.goto("/app", { waitUntil: "networkidle" });
      await expect(page.getByRole("heading", { name: "What do you want to get done?" })).toBeVisible();
      await expect(page.getByPlaceholder(/Ask cosigno anything/i)).toBeVisible();
      await expect(page.getByRole("button", { name: /Delegate/i })).toBeVisible();

      /**
       * Home has two legitimate shapes, and which one this run sees depends on
       * whether earlier tests left work in the shared demo store. Both are
       * asserted rather than one being forced, because forcing it would mean
       * testing a state the product never reaches on its own.
       */
      const examples = page.getByRole("heading", { name: "For example" });
      if (await examples.count()) {
        // QUIET: the six shapes of work. Examples, not a menu — clicking one
        // fills the box so it can be edited, and starts nothing.
        for (const label of [
          "Build something",
          "Research something",
          "Fix something",
          "Plan something",
          "Grow something",
          "Handle something",
        ]) {
          await expect(page.getByRole("button", { name: new RegExp(label) })).toBeVisible();
        }
        await page.getByRole("button", { name: /Fix something/ }).click();
        await expect(page.getByPlaceholder(/Ask cosigno anything/i)).toHaveValue(/broken/i);
        expect(page.url()).toContain("/app");
      } else {
        // BUSY: real work displaced the examples, and the page leads with the
        // thing that costs the reader something by being missed.
        const sections = page.locator("section h2");
        await expect(sections.first()).toBeVisible();
        const headings = await sections.allInnerTexts();
        expect(
          headings.some((h) => /Needs you|working on|Finished today/i.test(h)),
          `expected a work section, saw: ${headings.join(" | ")}`
        ).toBe(true);
      }
      await noHorizontalScroll(page);
      await page.screenshot({ path: join(OUT, `dashboard-${vp.name}.png`), fullPage: true });
    });

    test("ask box: file + link controls, and the paste-a-link field fits", async ({ page }) => {
      await page.goto("/app", { waitUntil: "networkidle" });
      // The three honest controls sit under the ask box (no voice).
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
      // Exactly one "Stop" — the workspace-wide kill switch in the header is
      // "Stop all", so the two can never be confused for each other.
      await expect(page.getByRole("button", { name: "Stop", exact: true })).toHaveCount(1);
      await expect(page.getByRole("button", { name: /Stop all/ })).toBeVisible();
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
      await expect(page.getByRole("heading", { name: "Templates" })).toBeVisible();
      // Real, installable jobs — and the property that matters on every one
      // of them: what runs alone, and what stops for a signature.
      await expect(page.getByText("Build tomorrow's meeting brief")).toBeVisible();
      await expect(page.getByText("Build my morning brief")).toBeVisible();
      await expect(page.getByText(/waits for your approval/i).first()).toBeVisible();
      await noHorizontalScroll(page);
      await page.screenshot({ path: join(OUT, `templates-${vp.name}.png`), fullPage: true });

      // The isolated mission workspace: start a real mission, open its page.
      // It has to answer the five questions before anything else on screen.
      const res = await page.request.post("/api/missions", {
        data: { template: "laptop_compare" },
      });
      expect(res.ok()).toBeTruthy();
      const { mission } = await res.json();
      await page.goto(`/app/missions/${mission.id}`, { waitUntil: "networkidle" });
      await expect(page.getByText("What cosigno is doing")).toBeVisible();
      await expect(page.getByText("Right now")).toBeVisible();
      await expect(page.getByText("Next", { exact: true })).toBeVisible();
      await expect(page.getByRole("button", { name: /Pause|Resume/ })).toBeVisible();
      await expect(page.getByRole("button", { name: "Stop", exact: true })).toHaveCount(1);
      await noHorizontalScroll(page);
      await page.screenshot({ path: join(OUT, `mission-workspace-${vp.name}.png`), fullPage: true });

      // WHO did the work is available, and folded away by default — the
      // primary experience is cosigno, not a roster to pick from.
      const who = page.locator("summary", { hasText: /specialist/i }).first();
      await expect(who).toBeVisible();
      await who.click();
      await expect(page.getByText(/Never:/).first()).toBeVisible();
      await page.screenshot({ path: join(OUT, `mission-specialists-${vp.name}.png`), fullPage: true });
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
      await expect(page.getByText("Needs you").first()).toBeVisible({ timeout: 15_000 });
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
      // One vocabulary everywhere: a card that needs a signature says
      // "Needs approval", on this page and on every other.
      await expect(page.getByText(/Needs approval/i).first()).toBeVisible();
      // The clarity system: the "what is cosigno doing?" guide with its
      // honest no-changes line and the visible plan.
      const guide = page.getByRole("button", { name: /what is cosigno doing/i });
      await expect(guide).toBeVisible();
      await guide.click();
      // The guide's standing promise: it always says what has changed, and
      // when nothing has, it says that rather than leaving the section blank.
      await expect(page.getByText("changes made").first()).toBeVisible();
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
      await expect(page.getByRole("heading", { name: "Activity" })).toBeVisible();
      await noHorizontalScroll(page);
      await page.screenshot({ path: join(OUT, `activity-${vp.name}.png`), fullPage: true });
    });

    test("compiler: an open-ended goal becomes a real, previewed plan", async ({ page }) => {
      // The goal box lives on home now. It used to be duplicated on the
      // missions page as a second, differently-worded composer.
      await page.goto("/app", { waitUntil: "networkidle" });
      const box = page.getByPlaceholder(/Ask cosigno anything/i);
      await expect(box).toBeVisible();
      await box.fill("compare the best laptops under $1,000");
      await page.getByRole("button", { name: /Delegate/i }).click();
      // The goal-understanding screen appears before anything runs, built
      // only from real tools: what cosigno will do, and where it stops.
      await expect(page.getByText("I'll handle this.")).toBeVisible({ timeout: 30_000 });
      await expect(page.getByText("Objective")).toBeVisible();
      await expect(page.getByText(/I'll handle/).first()).toBeVisible();
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
      await expect(page.getByText(/welcome to/i)).toBeVisible();
      await page.waitForTimeout(500);
      await noHorizontalScroll(page);
      await page.screenshot({ path: join(OUT, `checkout-success-${vp.name}.png`), fullPage: true });
    });

    test("account center — all five panels", async ({ page }) => {
      await page.goto("/app/account", { waitUntil: "networkidle" });
      await expect(page.getByRole("heading", { name: "Account", exact: true })).toBeVisible();

      // profile (default panel)
      await expect(page.getByRole("heading", { name: "Profile" })).toBeVisible();
      // Personalization is legible and switchable, not a hidden profile. The
      // switch is one control with one accessible name — a strict-mode
      // violation here would mean the label is duplicated for screen readers.
      await expect(
        page.getByRole("switch", { name: "Let cosigno learn how you work" })
      ).toBeVisible();
      await expect(page.getByText("What cosigno has picked up")).toBeVisible();
      await page.waitForTimeout(250); // let the fade-through transition settle
      await noHorizontalScroll(page);
      await page.screenshot({ path: join(OUT, `account-profile-${vp.name}.png`), fullPage: true });

      // the trust center — how much rope cosigno gets, per kind of action
      await page.getByRole("tab", { name: "trust center" }).click();
      await expect(page.getByRole("heading", { name: "Trust center" })).toBeVisible();
      await page.waitForTimeout(250);
      await noHorizontalScroll(page);
      await page.screenshot({ path: join(OUT, `account-permissions-${vp.name}.png`), fullPage: true });

      // plan & usage — the usage ring + sparkline + plan card
      await page.getByRole("tab", { name: "plan & usage" }).click();
      await expect(page.getByText(/used this cycle/i)).toBeVisible();
      await page.waitForTimeout(250);
      await noHorizontalScroll(page);
      await page.screenshot({ path: join(OUT, `account-usage-${vp.name}.png`), fullPage: true });

      // connections — third-party apps + custom MCP servers
      await page.getByRole("tab", { name: "connections" }).click();
      await expect(page.getByRole("heading", { name: /connections/i }).first()).toBeVisible();
      await page.waitForTimeout(400);
      await noHorizontalScroll(page);
      await page.screenshot({ path: join(OUT, `account-integrations-${vp.name}.png`), fullPage: true });

      // security — audit trail + injection tiles
      await page.getByRole("tab", { name: "security" }).click();
      await expect(page.getByRole("heading", { name: "Security" })).toBeVisible();
      await page.waitForTimeout(250);
      await noHorizontalScroll(page);
      await page.screenshot({ path: join(OUT, `account-security-${vp.name}.png`), fullPage: true });
    });
  });
}
