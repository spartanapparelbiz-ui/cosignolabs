// Cosigno demo reel — records narrated screen-recordings of the running app.
//
// Read-only: it drives the real UI and records it; it never mutates product
// code. Each chapter gets its own browser context, so each produces its own
// .webm file under media/video/. Key moments are also captured as stills.
//
// Run: node scripts/capture-video.mjs   (dev server must be on :3400)
import { chromium } from "@playwright/test";
import { mkdirSync, readdirSync, renameSync, rmSync, writeFileSync, statSync } from "node:fs";
import { join } from "node:path";

const BASE = "http://localhost:3400";
const CHROME = "/opt/pw-browsers/chromium-1194/chrome-linux/chrome";
const OUT = join(process.cwd(), "media");
const VID = join(OUT, "video");
const SHOTS = join(OUT, "stills");
const RAW = join(OUT, ".raw");
const SIZE = { width: 1280, height: 800 };

for (const d of [OUT, VID, SHOTS, RAW]) mkdirSync(d, { recursive: true });

const manifest = [];
const browser = await chromium.launch({ executablePath: CHROME });

/* ---------------------------------------------------------------- overlay --
   A visible cursor + a caption pill, injected into every page. Playwright's
   recorder captures the page only — with no OS cursor in the frame, a viewer
   cannot tell what is being clicked. These two elements make the recording
   legible as a demo instead of a slideshow of state changes.            */
const OVERLAY_SRC = () => {
  if (window.__cosigno_overlay) return;
  window.__cosigno_overlay = true;
  const mount = () => {
    if (!document.body) return setTimeout(mount, 20);

    const cursor = document.createElement("div");
    cursor.id = "__cosigno_cursor";
    Object.assign(cursor.style, {
      position: "fixed", left: "-100px", top: "-100px",
      width: "20px", height: "20px", borderRadius: "50%",
      border: "2px solid rgba(255,255,255,.95)",
      background: "rgba(17,17,17,.45)",
      boxShadow: "0 0 0 1.5px rgba(0,0,0,.55), 0 3px 12px rgba(0,0,0,.5)",
      transform: "translate(-50%,-50%)", zIndex: "2147483647",
      pointerEvents: "none",
    });

    const caption = document.createElement("div");
    caption.id = "__cosigno_caption";
    Object.assign(caption.style, {
      position: "fixed", left: "50%", bottom: "26px",
      transform: "translateX(-50%)", zIndex: "2147483646",
      display: "none", alignItems: "center", gap: "10px",
      padding: "11px 20px", borderRadius: "999px",
      background: "rgba(12,12,14,.9)",
      border: "1px solid rgba(255,255,255,.14)",
      boxShadow: "0 8px 30px rgba(0,0,0,.45)",
      color: "#fff", pointerEvents: "none",
      font: "500 15px/1.3 ui-sans-serif,system-ui,-apple-system,'Segoe UI',sans-serif",
      letterSpacing: ".01em", maxWidth: "80vw",
      backdropFilter: "blur(8px)",
    });
    const dot = document.createElement("span");
    Object.assign(dot.style, {
      width: "7px", height: "7px", borderRadius: "50%",
      background: "#4ade80", flex: "0 0 auto",
      boxShadow: "0 0 8px rgba(74,222,128,.9)",
    });
    const text = document.createElement("span");
    text.id = "__cosigno_caption_text";
    caption.append(dot, text);

    document.body.append(cursor, caption);

    addEventListener("mousemove", (e) => {
      cursor.style.left = e.clientX + "px";
      cursor.style.top = e.clientY + "px";
    }, true);

    addEventListener("mousedown", (e) => {
      const r = document.createElement("div");
      Object.assign(r.style, {
        position: "fixed", left: e.clientX + "px", top: e.clientY + "px",
        width: "20px", height: "20px", borderRadius: "50%",
        border: "2px solid rgba(96,165,250,.95)",
        transform: "translate(-50%,-50%) scale(.4)",
        zIndex: "2147483647", pointerEvents: "none", opacity: "1",
        transition: "transform .45s ease-out, opacity .45s ease-out",
      });
      document.body.appendChild(r);
      requestAnimationFrame(() => {
        r.style.transform = "translate(-50%,-50%) scale(2.6)";
        r.style.opacity = "0";
      });
      setTimeout(() => r.remove(), 500);
    }, true);
  };
  mount();
};

/* ------------------------------------------------------------- primitives -- */
let current = { chapter: "", step: "" };

async function caption(page, step) {
  current.step = step;
  await page
    .evaluate(({ chapter, step }) => {
      const el = document.getElementById("__cosigno_caption");
      const t = document.getElementById("__cosigno_caption_text");
      if (!el || !t) return;
      t.textContent = chapter ? `${chapter} — ${step}` : step;
      el.style.display = step ? "flex" : "none";
    }, { chapter: current.chapter, step })
    .catch(() => {});
}

// Re-assert the caption after a navigation wipes the overlay.
async function reassert(page) {
  await page.evaluate(() => {}).catch(() => {});
  await caption(page, current.step);
}

async function beat(page, ms = 900) {
  await page.waitForTimeout(ms);
}

async function goto(page, path, step) {
  await page.goto(`${BASE}${path}`, { waitUntil: "load", timeout: 90_000 }).catch(() => {});
  await page.waitForTimeout(500);
  if (step) await caption(page, step);
  else await reassert(page);
  await page.waitForTimeout(700);
}

// Move the pointer to a target before clicking, so the recorded cursor
// travels to what it activates instead of teleporting.
async function point(page, locator, { steps = 22 } = {}) {
  const box = await locator.boundingBox().catch(() => null);
  if (!box) return false;
  await locator.scrollIntoViewIfNeeded().catch(() => {});
  const b = (await locator.boundingBox().catch(() => null)) ?? box;
  await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2, { steps });
  await page.waitForTimeout(280);
  return true;
}

async function click(page, locator, step, { pause = 850 } = {}) {
  if (step) await caption(page, step);
  const ok = await point(page, locator);
  if (!ok) return false;
  await locator.click({ timeout: 8000 }).catch(() => {});
  await page.waitForTimeout(pause);
  return true;
}

// Screenshot with the demo overlay hidden — stills stay clean product shots.
async function shot(page, name, note, { full = false } = {}) {
  const file = `${name}.png`;
  const path = join(SHOTS, file);
  await page
    .evaluate(() => {
      for (const id of ["__cosigno_caption", "__cosigno_cursor"]) {
        const el = document.getElementById(id);
        if (el) el.dataset.prev = el.style.display, (el.style.display = "none");
      }
    })
    .catch(() => {});
  try {
    await page.screenshot({ path, fullPage: full });
    manifest.push({ kind: "still", file: `stills/${file}`, note });
    console.log(`   · still  ${file}`);
  } catch (e) {
    console.log(`   ! still  ${file} — ${String(e).slice(0, 90)}`);
  }
  await page
    .evaluate(() => {
      const cap = document.getElementById("__cosigno_caption");
      const cur = document.getElementById("__cosigno_cursor");
      if (cap) cap.style.display = cap.dataset.prev || "flex";
      if (cur) cur.style.display = cur.dataset.prev || "block";
    })
    .catch(() => {});
}

// Slow, readable scroll — a jump-cut to the footer reads as a glitch on video.
async function scroll(page, distance = 1400, stepPx = 55) {
  for (let y = 0; y < distance; y += stepPx) {
    await page.mouse.wheel(0, stepPx);
    await page.waitForTimeout(28);
  }
  await page.waitForTimeout(500);
}

/* ---------------------------------------------------------------- chapter -- */
async function chapter(slug, title, body) {
  console.log(`\n== ${slug} — ${title}`);
  current = { chapter: title, step: "" };
  const dir = join(RAW, slug);
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(dir, { recursive: true });

  const ctx = await browser.newContext({
    viewport: SIZE,
    recordVideo: { dir, size: SIZE },
    deviceScaleFactor: 1,
  });
  await ctx.addInitScript(OVERLAY_SRC);
  await ctx.addInitScript(() => {
    try {
      localStorage.setItem("cosigno_intro_seen", "1");
      localStorage.setItem("cosigno_briefing_seen", String(Date.now() - 3_600_000));
      localStorage.setItem("cosigno_name", "Nicholas");
    } catch {}
  });

  const page = await ctx.newPage();
  page.on("pageerror", (e) => console.log(`   ~ pageerror: ${e.message.slice(0, 100)}`));

  try {
    await body(page, ctx);
  } catch (e) {
    console.log(`   ! chapter failed: ${String(e).slice(0, 200)}`);
  }

  await caption(page, "").catch(() => {});
  await page.waitForTimeout(600);
  await ctx.close();

  const found = readdirSync(dir).filter((f) => f.endsWith(".webm"));
  if (!found.length) {
    console.log("   ! no video produced");
    return;
  }
  const dest = join(VID, `${slug}.webm`);
  renameSync(join(dir, found[0]), dest);
  const mb = (statSync(dest).size / 1e6).toFixed(2);
  manifest.push({ kind: "video", file: `video/${slug}.webm`, note: title, mb });
  console.log(`   ✓ video  ${slug}.webm (${mb} MB)`);
  rmSync(dir, { recursive: true, force: true });
}

/* ----------------------------------------------------------------- warmup -- */
// The dev server compiles each route on first hit. Warming them here keeps
// multi-second compile stalls out of the recordings.
{
  console.log("== warming routes (keeps compile stalls out of the video)");
  const w = await browser.newContext({ viewport: SIZE });
  const wp = await w.newPage();
  const routes = [
    "/", "/product", "/operators", "/pricing", "/security", "/templates",
    "/demo", "/privacy", "/terms", "/sign-in", "/sign-up",
    "/app", "/app/missions", "/app/objectives", "/app/focus", "/app/activity",
    "/app/watch", "/app/connections", "/app/settings", "/app/settings/rules",
    "/app/account", "/app/skills", "/app/files", "/app/memory", "/app/team",
    "/app/workspace", "/app/health", "/app/decisions", "/app/mission-control",
    "/app/trust", "/app/simulation", "/app/monitoring", "/app/automations",
  ];
  for (const r of routes) {
    await wp.goto(`${BASE}${r}`, { waitUntil: "domcontentloaded", timeout: 60_000 }).catch(() => {});
    await wp.waitForTimeout(120);
  }
  await w.close();
  console.log(`   ✓ warmed ${routes.length} routes`);
}

/* =============================================================== CHAPTERS == */

await chapter("01-landing-and-product", "The public site", async (page) => {
  await goto(page, "/", "cosignolabs.com — the operator that asks first");
  await scroll(page, 2600);
  await shot(page, "01-landing-full", "Landing page, full scroll", { full: true });
  await page.mouse.wheel(0, -4000);
  await beat(page, 700);

  await goto(page, "/product", "Product — what the operator actually does");
  await scroll(page, 2200);
  await shot(page, "02-product-full", "Product page", { full: true });

  await goto(page, "/pricing", "Pricing — free, pro, max");
  await scroll(page, 1500);
  await shot(page, "03-pricing", "Pricing tiers");

  await goto(page, "/security", "Security — what cosigno will and will not do");
  await scroll(page, 1600);
  await shot(page, "04-security", "Security page");

  await goto(page, "/operators", "Operators");
  await scroll(page, 1400);
  await shot(page, "05-operators", "Operators page");

  await goto(page, "/templates", "Templates — prebuilt delegations");
  await scroll(page, 1200);
  await shot(page, "06-templates", "Templates gallery");
});

await chapter("02-first-run", "First run", async (page, ctx) => {
  await ctx.addInitScript(() => {
    try { localStorage.removeItem("cosigno_intro_seen"); } catch {}
  });
  await page.goto(`${BASE}/app`, { waitUntil: "load", timeout: 90_000 }).catch(() => {});
  await page.getByRole("dialog").waitFor({ timeout: 15_000 }).catch(() => {});
  await caption(page, "First-run introduction, screen 1");
  await beat(page, 1500);
  await shot(page, "07-onboarding-1", "First-run intro — screen 1");

  await click(page, page.getByRole("button", { name: /see how it works/i }), "Screen 2 — how it works", { pause: 1400 });
  await shot(page, "08-onboarding-2", "First-run intro — screen 2");

  await click(page, page.getByRole("button", { name: /one more thing/i }), "Screen 3 — one more thing", { pause: 1400 });
  await shot(page, "09-onboarding-3", "First-run intro — screen 3");
  await beat(page, 900);
});

await chapter("03-now-and-command", "Now — the home surface", async (page) => {
  await goto(page, "/app", "NOW — what cosigno is doing right now");
  await beat(page, 1200);
  await shot(page, "10-now-home", "NOW / home — current state and delegation box");
  await scroll(page, 1100);
  await page.mouse.wheel(0, -1400);
  await beat(page, 700);

  await caption(page, "The morning briefing");
  await page.evaluate(() => localStorage.removeItem("cosigno_briefing_seen")).catch(() => {});
  await goto(page, "/app", "The morning briefing");
  await beat(page, 1400);
  await shot(page, "11-now-briefing", "NOW with the morning briefing card");
  await page.evaluate(() => localStorage.setItem("cosigno_briefing_seen", String(Date.now()))).catch(() => {});

  await goto(page, "/app", "Asking what it can do right now");
  await click(page, page.getByText(/What can you do right now/i).first(), "Capability report", { pause: 1500 });
  await shot(page, "12-now-capabilities", "What cosigno can do right now — capability report");

  await goto(page, "/app", "Cosigno Presence — Ctrl-K from anywhere");
  await caption(page, "Cosigno Presence — Ctrl-K from anywhere");
  await beat(page, 800);
  await page.keyboard.press("Control+k");
  await beat(page, 1400);
  await shot(page, "13-command-overlay", "Cosigno Presence — command overlay (Ctrl-K)");
  await page.keyboard.type("draft", { delay: 130 });
  await beat(page, 1500);
  await shot(page, "14-command-overlay-typing", "Command overlay — matching as you type");
  await page.keyboard.press("Escape");
  await beat(page, 700);
});

await chapter("04-delegations", "Delegations", async (page) => {
  await goto(page, "/app/missions", "Delegations — everything handed to cosigno");
  await beat(page, 1200);
  await shot(page, "15-delegations-list", "Delegations list — states and contextual actions");
  await scroll(page, 900);
  await page.mouse.wheel(0, -1200);

  await click(page, page.getByRole("button", { name: /brief me/i }).first(), "Brief me — why is this waiting?", { pause: 1600 });
  await shot(page, "16-delegation-brief", "Brief Me — why this is waiting");
  await page.keyboard.press("Escape");
  await beat(page, 800);

  await click(page, page.getByRole("button", { name: /^replay$/i }).first(), "Replay — every step it took", { pause: 1700 });
  await shot(page, "17-delegation-replay", "Delegation replay timeline");
  await page.keyboard.press("Escape");
  await beat(page, 700);
});

await chapter("05-objectives", "Objectives", async (page) => {
  await goto(page, "/app/objectives", "Objectives — the outcomes it is driving");
  await beat(page, 1300);
  await shot(page, "18-objectives-list", "Objectives list with progress");

  await click(page, page.getByText("Launch the company by August 1").first(), "Inside one objective", { pause: 1800 });
  await beat(page, 900);
  await shot(page, "19-objective-detail", "Objective detail — linked delegations and progress", { full: true });
  await scroll(page, 900);
});

await chapter("06-boundary-and-sign", "The boundary — approval and signature", async (page) => {
  await goto(page, "/app/focus", "The boundary — where cosigno stops and asks");
  await page.getByText(/I need your decision/i).waitFor({ timeout: 15_000 }).catch(() => {});
  await beat(page, 1400);
  await shot(page, "20-boundary-focus", "The boundary — it needs your decision");

  await click(page, page.getByRole("button", { name: /Review all/i }), "Reviewing the whole bundle at once", { pause: 1600 });
  await shot(page, "21-approval-bundle", "Approval bundle — review all together");
  await click(page, page.getByRole("button", { name: /One at a time/i }), "Back to one at a time", { pause: 1100 });

  await click(page, page.getByRole("button", { name: /I'll take it from here/i }), "Taking control by hand", { pause: 1600 });
  await shot(page, "22-live-takeover", "Live takeover — you have control, fully editable");

  await click(page, page.getByRole("button", { name: /Cosigno, continue/i }), "Handing it back mid-task", { pause: 1800 });
  await shot(page, "23-continue-from-here", "Continue from here — handed back to cosigno");

  await page.getByText(/I need your decision/i).waitFor({ timeout: 15_000 }).catch(() => {});
  await beat(page, 800);
  await click(page, page.getByRole("button", { name: /Sign →/i }).first(), "Cosigno Sign — authorising by signature", { pause: 1500 });
  await shot(page, "24-sign-dialog", "Cosigno Sign — the signature surface");

  const canvas = page.locator("canvas");
  if (await canvas.isVisible().catch(() => false)) {
    await caption(page, "Signing by hand");
    const b = await canvas.boundingBox();
    const cx = b.x + 70;
    const cy = b.y + b.height - 60;
    await page.mouse.move(cx, cy, { steps: 18 });
    await beat(page, 500);
    await page.mouse.down();
    for (let i = 0; i < 55; i++) {
      await page.mouse.move(cx + i * 6, cy + Math.sin(i / 3.5) * 22, { steps: 2 });
      await page.waitForTimeout(14);
    }
    await page.mouse.up();
    await beat(page, 700);
    await page.getByLabel(/your name for the signature record/i).fill("Nicholas").catch(() => {});
    await beat(page, 800);
    await shot(page, "25-signature-drawn", "Signature drawn, ready to authorise");

    await click(page, page.getByRole("button", { name: /Sign to authorize/i }), "Sealing the authorisation", { pause: 1500 });
    await shot(page, "26-signature-sealed", "Signed — the authorisation is sealed");
    await beat(page, 2600);
  }
});

await chapter("07-trust-receipts", "Activity and trust receipts", async (page) => {
  await goto(page, "/app/activity", "Activity — the ledger of everything done");
  await beat(page, 1300);
  await shot(page, "27-activity-ledger", "Activity ledger — filters, search, today");
  await scroll(page, 800);
  await page.mouse.wheel(0, -1000);

  await click(page, page.getByRole("button", { name: /view receipt/i }).first(), "Opening a trust receipt", { pause: 1700 });
  await shot(page, "28-trust-receipt", "Trust receipt with the cosigno seal");

  await click(page, page.getByRole("button", { name: /^trace$/i }), "Expanding the full trace", { pause: 1500 });
  await shot(page, "29-trust-receipt-trace", "Trust receipt — trace expanded");
  await page.keyboard.press("Escape");
  await beat(page, 700);
});

await chapter("08-watch-standing-orders", "Watch and standing orders", async (page) => {
  await goto(page, "/app/watch", "Watch — the things it keeps an eye on");
  await beat(page, 1300);
  await shot(page, "30-watch", "Watch and standing orders");

  await click(page, page.getByRole("button", { name: /new standing order/i }), "Writing a new standing order", { pause: 1700 });
  await shot(page, "31-standing-order-create", "New standing order — observe / prepare / operate");
  await scroll(page, 700);
  await beat(page, 800);
});

await chapter("09-connections-and-rules", "Connections and safety rules", async (page) => {
  await goto(page, "/app/connections", "Connections — the apps it can operate");
  await beat(page, 1300);
  await shot(page, "32-connections", "Connections — connect the apps it operates");
  await scroll(page, 1500);
  await page.mouse.wheel(0, -1800);
  await beat(page, 600);

  await goto(page, "/app/settings/rules", "Safety rules — what it may never do alone");
  await beat(page, 1400);
  await shot(page, "33-rules", "Safety rules — the standing limits", { full: true });
  await scroll(page, 1600);
});

await chapter("10-account-and-permissions", "Account and permission tiers", async (page) => {
  await goto(page, "/app/account", "Account — the control centre");
  await beat(page, 1200);
  await shot(page, "34-account", "Account centre");

  for (const [name, file, note] of [
    ["permissions", "35-account-permissions", "Permission tiers — auto / approve / sign"],
    ["profile", "36-account-profile", "Profile panel"],
    ["security", "37-account-security", "Security panel"],
    ["usage", "38-account-usage", "Usage and plan panel"],
    ["integrations", "39-account-integrations", "Integrations panel"],
  ]) {
    const btn = page.getByRole("button", { name: new RegExp(`^${name}$`, "i") }).first();
    if (await btn.isVisible().catch(() => false)) {
      await click(page, btn, `The ${name} panel`, { pause: 1300 });
      await shot(page, file, note);
    }
  }
});

await chapter("11-cosigno-hold", "Cosigno Hold — the authority brake", async (page) => {
  await goto(page, "/app", "Everything running normally");
  await beat(page, 1200);

  await caption(page, "Pulling the brake — hold all external action");
  await page.request.post(`${BASE}/api/hold`, { data: { scope: "external" } }).catch(() => {});
  await goto(page, "/app", "Cosigno Hold is active — nothing leaves the building");
  await beat(page, 1800);
  await shot(page, "40-cosigno-hold", "Cosigno Hold active — banner and control");
  await scroll(page, 700);

  await caption(page, "Releasing the hold");
  await page.request.post(`${BASE}/api/hold`, { data: { scope: "none" } }).catch(() => {});
  await goto(page, "/app", "Released — back to work");
  await beat(page, 1500);
  await shot(page, "41-hold-released", "Hold released — back to normal operation");
});

await chapter("12-other-surfaces", "The rest of the app", async (page) => {
  for (const [path, step, file, note] of [
    ["/app/skills", "Skills — what it knows how to do", "42-skills", "Skills marketplace"],
    ["/app/files", "Files — hand it a document", "43-files", "Files — the Take This entry point"],
    ["/app/memory", "Rules and memory — how it works for you", "44-memory", "My rules and memory"],
    ["/app/team", "Team", "45-team", "Team"],
    ["/app/workspace", "Workspace — shared delegations", "46-workspace", "Workspace"],
    ["/app/decisions", "Decision inbox", "47-decisions", "Decision inbox"],
    ["/app/health", "Health — is everything actually wired up", "48-health", "Health and status"],
  ]) {
    await goto(page, path, step);
    await beat(page, 1100);
    await shot(page, file, note);
    await scroll(page, 600);
    await page.mouse.wheel(0, -800);
    await beat(page, 400);
  }
});

/* ------------------------------------------------------------------ close -- */
await browser.close();
rmSync(RAW, { recursive: true, force: true });

writeFileSync(join(OUT, "manifest.json"), JSON.stringify(manifest, null, 2));

const vids = manifest.filter((m) => m.kind === "video");
const stills = manifest.filter((m) => m.kind === "still");
console.log(`\n──────────────────────────────────────────`);
console.log(`  ${vids.length} videos, ${stills.length} stills → media/`);
console.log(`──────────────────────────────────────────`);
for (const v of vids) console.log(`  ${v.file}  (${v.mb} MB)  ${v.note}`);
