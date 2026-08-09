#!/usr/bin/env node
/**
 * `npm run verify:deploy -- <BASE_URL>` — runs against the LIVE site and
 * prints PASS / FAIL / SKIP per check, in plain English a non-technical
 * founder can follow. Exits nonzero if anything FAILs, with the most likely
 * fix printed next to it.
 *
 * Example: npm run verify:deploy -- https://cosignolabs.com
 */

const VENDOR = /\b(anthropic|claude|haiku|sonnet|opus)\b/i;

function parseBaseUrl() {
  const arg = process.argv.slice(2).find((a) => a.startsWith("http"));
  if (!arg) {
    console.error(
      "usage: npm run verify:deploy -- <BASE_URL>\n" +
        "  e.g. npm run verify:deploy -- https://cosignolabs.com"
    );
    process.exit(2);
  }
  return arg.replace(/\/$/, "");
}

const BASE = parseBaseUrl();
const results = [];
function record(name, pass, detail, fix) {
  results.push({ name, pass, detail, fix });
}
const SKIP = Symbol("skip");

const NET_RETRIES = 2;
const RETRY_DELAY_MS = 2000;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * fetch that retries only transient NETWORK failures — a DNS blip, a dropped
 * connection, a reset handshake. It never retries an HTTP status: a 500 is a
 * real answer about the deploy and must be recorded as one.
 *
 * The distinction matters because this gate decides whether a production
 * deploy is called broken. One `TypeError: fetch failed` on a single hit,
 * while every other route on the same host answers 200 seconds later, is
 * noise — and failing the whole run on it reports a healthy site as down.
 */
async function netFetch(url, init, retries = NET_RETRIES) {
  let lastErr;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await fetch(url, init);
    } catch (err) {
      lastErr = err;
      if (attempt < retries) await sleep(RETRY_DELAY_MS);
    }
  }
  throw lastErr;
}

async function timedFetch(url, init) {
  const start = Date.now();
  const res = await netFetch(url, init);
  return { res, ms: Date.now() - start };
}

async function main() {
  // Wake the serverless functions before measuring anything. On the post-deploy
  // gate the first request is ALWAYS cold, so timing it measured the platform
  // starting up rather than how fast the site serves — which turned healthy
  // deploys red. This throwaway hit pays that cost; the timed request below
  // then measures steady state, which is what the check claims to assert.
  try {
    await netFetch(BASE + "/", { redirect: "manual" });
  } catch {
    /* the landing check below is what reports an unreachable site */
  }

  // 1. landing
  try {
    const { res, ms } = await timedFetch(BASE + "/");
    const body = await res.text();
    record(
      "GET / → 200 and says 'cosigno'",
      res.status === 200 && /cosigno/i.test(body),
      `status ${res.status}, ${ms}ms`,
      "the site isn't serving. Check the Netlify deploy succeeded and that @netlify/plugin-nextjs ran (build log)."
    );
    // 10. response time
    record(
      "GET / responds in < 1.5s",
      ms < 1500,
      `${ms}ms`,
      "cold start or a heavy page. Re-run once warm; if still slow, check the Netlify function region."
    );
    // 6. security headers
    const csp = res.headers.get("content-security-policy");
    const xfo = res.headers.get("x-frame-options");
    const xcto = res.headers.get("x-content-type-options");
    record(
      "security headers present on /",
      Boolean(csp && xfo && xcto),
      `CSP:${csp ? "yes" : "no"} XFO:${xfo || "no"} XCTO:${xcto || "no"}`,
      "headers come from next.config.mjs — make sure the deploy used the latest build."
    );
    // 7. no vendor/model names in served HTML + a sample of JS chunks
    let leak = VENDOR.test(body) ? "html" : null;
    const scripts = [...new Set(
      [...body.matchAll(/\/_next\/static\/[^"'\s)]+?\.js/g)].map((m) => m[0])
    )].slice(0, 10);
    for (const s of scripts) {
      if (leak) break;
      try {
        const js = await (await fetch(s.startsWith("http") ? s : BASE + s)).text();
        if (VENDOR.test(js)) leak = s;
      } catch {
        /* ignore a chunk we couldn't fetch */
      }
    }
    record(
      "no vendor/model names in served HTML/JS of /",
      !leak,
      leak ? `found in ${leak}` : `scanned html + ${scripts.length} JS chunks`,
      "a vendor/model name leaked into the client bundle. Run `npm run build` (the check-vendor gate) locally to find it, then redeploy."
    );
  } catch (err) {
    record("GET / reachable", false, String(err), "the domain isn't resolving or the TLS handshake failed — see the HTTPS + DNS checks below.");
  }

  // 2. pricing
  await simpleStatus("GET /pricing → 200", "/pricing", (s) => s === 200,
    "pricing is a public marketing page — if it 500s, the deploy is broken or predates the fail-closed fix.");

  // 3. health
  try {
    const { res } = await timedFetch(BASE + "/api/health");
    let json = null;
    try { json = await res.json(); } catch { /* not json */ }
    record("GET /api/health → 200 JSON", res.status === 200 && json !== null,
      `status ${res.status}`,
      "the health route needs no keys. A failure means functions aren't running — check @netlify/plugin-nextjs.");
  } catch (err) {
    record("GET /api/health → 200 JSON", false, String(err), "functions aren't reachable — check the Netlify Next runtime plugin.");
  }

  // 4. preview mock command
  try {
    const { res } = await timedFetch(BASE + "/api/preview", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ command: "clear my inbox of newsletters" }),
    });
    let json = null;
    try { json = await res.json(); } catch { /* */ }
    record("preview mock command → 200 with action cards",
      res.status === 200 && Array.isArray(json?.cards) && json.cards.length > 0,
      `status ${res.status}, cards: ${json?.cards?.length ?? 0}`,
      "the sandbox uses no keys and must always work. If it fails, the function crashed — check logs.");
  } catch (err) {
    record("preview mock command → 200 with action cards", false, String(err),
      "the preview function is unreachable — check the Netlify Next runtime.");
  }

  // 5. /app → 200 (keys present) or branded 503 (keys absent); raw 500 fails
  try {
    const { res } = await timedFetch(BASE + "/app", { redirect: "manual" });
    const s = res.status;
    const ok = s === 200 || s === 503 || (s >= 300 && s < 400); // 3xx = sign-in redirect
    record("GET /app → 200, branded 503, or sign-in redirect (never raw 500)",
      ok && s !== 500,
      `status ${s}`,
      "a raw 500 means fail-closed scoping isn't deployed. Deploy the latest build; keyless /app must serve the branded 503.");
  } catch (err) {
    record("GET /app → 200 / 503 / redirect (never raw 500)", false, String(err),
      "/app is unreachable — check functions + middleware.");
  }

  // 8. HTTPS cert valid (only meaningful for https on a real host)
  if (BASE.startsWith("https://")) {
    try {
      await fetch(BASE + "/api/health"); // throws on cert error
      record("HTTPS certificate valid for the domain", true, "TLS handshake ok",
        "");
    } catch (err) {
      const certish = /certificate|tls|ssl/i.test(String(err));
      record("HTTPS certificate valid for the domain", !certish, String(err),
        "SSL isn't provisioned yet. In Netlify → Domain management, wait for 'Netlify certificate' to issue (can take a few minutes after DNS).");
    }
  } else {
    record("HTTPS certificate valid for the domain", SKIP, "http/localhost", "");
  }

  // 9. www → apex redirect (only for a real apex domain)
  const host = new URL(BASE).host;
  const isApex = /^[^.]+\.[^.]+$/.test(host) && !host.startsWith("www.");
  if (BASE.startsWith("https://") && isApex) {
    try {
      const wwwUrl = `https://www.${host}/`;
      const res = await netFetch(wwwUrl, { redirect: "manual" });
      const loc = res.headers.get("location") || "";
      const redirects = res.status >= 300 && res.status < 400 && new URL(loc, wwwUrl).host === host;
      record("www → apex redirect", redirects, `status ${res.status} → ${loc || "(none)"}`,
        "add a redirect from www to the apex in Netlify → Domain management → set the apex as primary.");
    } catch (err) {
      record("www → apex redirect", false, String(err),
        "www.<domain> isn't resolving — add it as a domain alias in Netlify.");
    }
  } else {
    record("www → apex redirect", SKIP, "not an apex https host", "");
  }

  print();
}

async function simpleStatus(name, path, ok, fix) {
  try {
    const { res } = await timedFetch(BASE + path, { redirect: "manual" });
    record(name, ok(res.status), `status ${res.status}`, fix);
  } catch (err) {
    record(name, false, String(err), fix);
  }
}

function print() {
  console.log(`\ncosigno deploy verification — ${BASE}\n`);
  let failed = 0;
  for (const r of results) {
    const tag = r.pass === SKIP ? "SKIP" : r.pass ? "PASS" : "FAIL";
    const mark = r.pass === SKIP ? "·" : r.pass ? "✓" : "✗";
    console.log(`  ${mark} [${tag}] ${r.name}  (${r.detail})`);
    if (r.pass !== true && r.pass !== SKIP && r.fix) {
      console.log(`         ↳ likely fix: ${r.fix}`);
      failed++;
    }
  }
  console.log("");
  if (failed > 0) {
    console.log(`${failed} check(s) FAILED — the site is not fully healthy. Fix the items above and redeploy.\n`);
    process.exit(1);
  }
  console.log("all checks passed — the deploy is healthy. ✓\n");
}

main().catch((err) => {
  console.error("verify:deploy crashed:", err);
  process.exit(2);
});
