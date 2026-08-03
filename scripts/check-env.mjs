#!/usr/bin/env node
/**
 * `npm run check:env` — prints a table of every environment service, whether
 * it's present, and what breaks without it. Runs locally and at build time on
 * Netlify (the table lands in the build log). VALUES ARE NEVER PRINTED — only
 * variable names + presence, so this is safe to leave in public logs.
 *
 * Never exits nonzero: missing optional keys are fine, and even missing app
 * keys only mean /app serves a branded 503 (the build still succeeds).
 */
import { SERVICES, serviceStatus, appGated } from "./env-services.mjs";

const prod = process.env.NODE_ENV === "production";
const status = serviceStatus();

const pad = (s, n) => String(s).padEnd(n);
const rows = status.flatMap((s) =>
  s.vars.map((v, i) => ({
    service: i === 0 ? s.name : "",
    variable: v,
    present: process.env[v] ? "✓" : s.legacyFilled ? "~legacy" : "—",
    note: i === 0 ? (s.gatesApp ? "required for /app" : "optional") : "",
  }))
);

const w = {
  service: Math.max(8, ...rows.map((r) => r.service.length)),
  variable: Math.max(8, ...rows.map((r) => r.variable.length)),
};

console.log("\n[cosigno] environment check (names only — no values printed)\n");
console.log(
  `  ${pad("SERVICE", w.service)}  ${pad("VARIABLE", w.variable)}  PRESENT  NOTE`
);
console.log(`  ${"-".repeat(w.service)}  ${"-".repeat(w.variable)}  -------  ----`);
for (const r of rows) {
  console.log(
    `  ${pad(r.service, w.service)}  ${pad(r.variable, w.variable)}  ${pad(r.present, 7)}  ${r.note}`
  );
}

console.log("");
for (const s of status) {
  if (!s.present) console.log(`  [cosigno] ${s.name} absent — ${s.breaks}.`);
}

if (prod && appGated()) {
  console.log(
    "\n  [cosigno] NOTE: in production /app + real API routes will serve a branded 503\n" +
      "  until PLANNER and SUPABASE are all set. Marketing pages (/, /pricing,\n" +
      "  the live preview) work regardless.\n"
  );
} else if (prod) {
  console.log("\n  [cosigno] all app-gating services present — full app enabled.\n");
} else {
  console.log("\n  [cosigno] development — demo mode; missing keys are fine.\n");
}
