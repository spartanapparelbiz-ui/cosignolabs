// Capability-claim audit of the RENDERED product.
//
// Greps of source catch identifiers and comments; this reads what a person
// actually sees. It walks every surface in a real browser, pulls the visible
// text, and flags sentences that claim more than the product can demonstrate —
// protection, monitoring, prevention, or an absolute ("always", "every",
// "unlimited") — so each one can be checked against what the code really does.
//
//   node scripts/audit-claims.mjs            # report
//   node scripts/audit-claims.mjs --strict   # exit non-zero if anything is flagged
//
// It is a lead generator, not a judge: a flagged line may well be true. The
// point is that no claim reaches production without someone having read it.
import { chromium } from "@playwright/test";

const BASE = process.env.BASE ?? "http://localhost:3400";
// Pinned only where the image provides one. Unset elsewhere so Playwright
// resolves its own installed browser — a hardcoded revision path breaks on
// any other machine and after any Playwright upgrade.
const CHROME = process.env.CHROME_PATH ?? "/opt/pw-browsers/chromium-1194/chrome-linux/chrome";
const STRICT = process.argv.includes("--strict");

const SURFACES = [
  "/",
  "/product",
  "/pricing",
  "/security",
  "/operators",
  "/templates",
  "/app",
  "/app/missions",
  "/app/approvals",
  "/app/activity",
  "/app/connections",
  "/app/monitoring",
  "/app/mission-control",
  "/app/twins",
  "/app/preview",
  "/app/templates",
  "/app/account",
  "/app/health",
];

/**
 * Words that promise a capability. Each is paired with the question a reader
 * should be able to answer "yes" to before the sentence ships.
 */
const CLAIMS = [
  [/\bprotect(s|ed|ing|ion)?\b/i, "does it actually stop something today?"],
  [/\bmonitor(s|ed|ing)?\b/i, "is something really being watched, continuously?"],
  [/\bprevent(s|ed|ing)?\b/i, "is the thing genuinely impossible, not just discouraged?"],
  [/\bguarantee(s|d)?\b/i, "is it enforced in code, not intended?"],
  [/\bensure(s|d)?\b/i, "is it enforced in code, not intended?"],
  [/\bautomatic(ally)?\b/i, "does it happen with nobody present?"],
  [/\bunlimited\b/i, "is there really no cap?"],
  [/\b24\/7\b|\baround the clock\b|\bnon-?stop\b/i, "does it run when nobody is signed in?"],
  [/\bnever\b/i, "is it structurally impossible, or merely the current behaviour?"],
  [/\balways\b/i, "does it hold in every case, including failures?"],
  [/\bevery\b/i, "literally every one, with no exclusions?"],
  [/\ball your\b/i, "all, or only the connected subset?"],
  [/\breal-?time\b/i, "is it pushed, or polled on an interval?"],
  [/\bfully\b|\bcompletely\b|\btotally\b/i, "is the remaining gap zero?"],
];

const browser = await chromium.launch(CHROME ? { executablePath: CHROME } : {});
const ctx = await browser.newContext({ viewport: { width: 1440, height: 1200 } });
await ctx.addInitScript(() => {
  try {
    localStorage.setItem("cosigno_briefing_seen", String(Date.now() - 3_600_000));
  } catch {
    /* storage may be unavailable */
  }
});
const page = await ctx.newPage();

let flagged = 0;
const seen = new Set();

for (const path of SURFACES) {
  /* A surface that fails to load produces empty text, no hits, and a clean
     bill of health — the audit would pass a broken page. Unreachable IS a
     finding. */
  const res = await page
    .goto(`${BASE}${path}`, { waitUntil: "load", timeout: 90_000 })
    .catch(() => null);
  if (!res || res.status() >= 400) {
    console.log(`\n${path}\n  [unreachable] ${res ? `HTTP ${res.status()}` : "navigation failed"}`);
    flagged += 1;
    continue;
  }
  await page.waitForLoadState("networkidle", { timeout: 15_000 }).catch(() => {});
  await page.waitForTimeout(400);

  const text = await page
    .evaluate(() => document.body.innerText)
    .catch(() => "");

  // Sentence-ish units, so a flag points at a readable claim not a fragment.
  const lines = text
    .split(/\n+|(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 12 && s.length < 260);

  const hits = [];
  for (const line of lines) {
    for (const [re, question] of CLAIMS) {
      if (!re.test(line)) continue;
      const key = line.toLowerCase();
      if (seen.has(key)) break;
      seen.add(key);
      hits.push({ line, question, word: line.match(re)?.[0] });
      flagged += 1;
      break;
    }
  }

  if (hits.length > 0) {
    console.log(`\n${path}`);
    for (const h of hits) {
      console.log(`  [${h.word}] ${h.line}`);
      console.log(`      → ${h.question}`);
    }
  }
}

await browser.close();
console.log(`\n${flagged} claim${flagged === 1 ? "" : "s"} to verify across ${SURFACES.length} surfaces.`);
if (STRICT && flagged > 0) process.exit(1);
