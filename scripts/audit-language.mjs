// Plain-language audit of the RENDERED product.
//
// Walks every customer-facing surface in a real browser and flags text that
// leaks engineering vocabulary — environment variable names, infrastructure
// words, stack-trace debris, HTTP status codes. A founder should never have to
// know what a deployment is to understand why something is off.
//
// Developer diagnostics are a legitimate place for these words, so the pages
// that exist to show internal state are excluded by name rather than by
// accident — see DIAGNOSTIC_SURFACES.
//
//   node scripts/audit-language.mjs           # report
//   node scripts/audit-language.mjs --strict  # exit non-zero on any finding
import { chromium } from "@playwright/test";

const BASE = process.env.BASE ?? "http://localhost:3400";
// Pinned only where the image provides one. Unset elsewhere so Playwright
// resolves its own installed browser — a hardcoded revision path breaks on
// any other machine and after any Playwright upgrade.
const CHROME = process.env.CHROME_PATH ?? "/opt/pw-browsers/chromium-1194/chrome-linux/chrome";
const STRICT = process.argv.includes("--strict");

/** Pages a customer uses. Every one of these must read as plain English. */
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
  "/app/watch",
  "/app/account",
  "/app/files",
  "/app/memory",
];

/**
 * Pages whose PURPOSE is internal state. Env names and infrastructure belong
 * here and nowhere else — the separation is the point, not an exception to it.
 */
const DIAGNOSTIC_SURFACES = ["/app/health"];

const JARGON = [
  [/\b[A-Z][A-Z0-9]{2,}(_[A-Z0-9]+)+\b/, "an environment variable name"],
  [/\benv(ironment)? var(iable)?s?\b/i, "environment variables"],
  [/\bdeployment\b/i, "“deployment” — a word about our infrastructure, not their workspace"],
  [/\bserver[- ]side\b|\bthe server\b/i, "“the server” — implementation, not experience"],
  [/\bcron\b|\bscheduler\b/i, "scheduler internals"],
  [/\bAPI key\b/i, "“API key” — fine where they paste one, jargon elsewhere"],
  [/\bOAuth\b/i, "“OAuth” — the mechanism, not the outcome"],
  [/\bendpoint\b|\bwebhook\b/i, "HTTP plumbing"],
  [/\bnull\b|\bundefined\b|\bNaN\b/, "a value that leaked from code"],
  [/\b(4\d{2}|5\d{2}) (error|status)\b|\bstatus (code )?\d{3}\b/i, "an HTTP status code"],
  [/\bstack trace\b|\bexception\b|\bTypeError\b|\bReferenceError\b/, "a stack trace"],
  [/\bdatabase\b|\bsupabase\b|\bredis\b|\bpostgres\b/i, "our storage layer"],
  [/\bencryption key\b|\bcredential vault\b/i, "key management internals"],
  [/\bin-?memory\b/i, "how state is stored"],
  [/\bconfigured\b/i, "“configured” — says nothing about what to do next"],
  [/\bprovision(ed|ing)?\b/i, "“provisioned”"],
  [/\brate limit(ed|ing)?\b/i, "“rate limit” — say what they should do instead"],
];

/**
 * Deliberate exceptions, each with the reason it earns its word.
 *
 * The list exists so "we decided this one is fine" is written down and can be
 * argued with, instead of living in someone's memory. Anything NOT here is a
 * line nobody has defended yet.
 */
const ALLOWED = [
  [
    /\bthe server (enforces|assigns|proposes)|enforced by the server|never leave the server\b/i,
    "“the server” is the load-bearing distinction on the security pages: the guarantee holds because a machine enforces it, not because the model chose to behave. Removing the word weakens a true claim.",
  ],
  [
    /AES-256-GCM|row-level security|\boauth tokens\b/i,
    "the security page is written for someone evaluating exactly this; naming the mechanism is the answer they came for.",
  ],
  [
    /base URL \+ API key|remote MCP endpoint|webhook \/ API access|update_record · webhook/i,
    "field labels and a named developer plan feature — the words appear where a developer types those very things.",
  ],
];

function isAllowed(line) {
  return ALLOWED.find(([re]) => re.test(line));
}

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

let findings = 0;
let allowedCount = 0;
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
    findings += 1;
    continue;
  }
  await page.waitForLoadState("networkidle", { timeout: 15_000 }).catch(() => {});
  await page.waitForTimeout(500);

  const text = await page.evaluate(() => document.body.innerText).catch(() => "");
  const lines = text
    .split(/\n+|(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 8 && s.length < 300);

  const hits = [];
  for (const line of lines) {
    for (const [re, why] of JARGON) {
      if (!re.test(line)) continue;
      const key = line.toLowerCase();
      if (seen.has(key)) break;
      seen.add(key);
      const allowed = isAllowed(line);
      if (allowed) {
        allowedCount += 1;
        break;
      }
      hits.push({ line, why, match: line.match(re)?.[0] });
      findings += 1;
      break;
    }
  }

  if (hits.length > 0) {
    console.log(`\n${path}`);
    for (const h of hits) {
      console.log(`  ${h.line}`);
      console.log(`      ↳ "${h.match}" — ${h.why}`);
    }
  }
}

await browser.close();

console.log(
  `\n${findings} line${findings === 1 ? "" : "s"} to rewrite across ${SURFACES.length} customer surfaces.`
);
console.log(`${allowedCount} allowed by an explicit, documented exception (see ALLOWED).`);
console.log(`diagnostics excluded by design: ${DIAGNOSTIC_SURFACES.join(", ")}`);
if (STRICT && findings > 0) process.exit(1);
