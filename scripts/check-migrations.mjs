#!/usr/bin/env node
/**
 * Migration validation gate. Enforces the repo's non-negotiable rules on the
 * SQL migrations so a schema change can't silently ship an unsafe pattern:
 *
 *   1. Sequentially numbered, unique migration prefixes (0001, 0002, …).
 *   2. Every migration that CREATES a table also enables Row Level Security
 *      on it (RLS is deny-by-default, so a forgotten `enable row level
 *      security` is a real exposure).
 *   3. No destructive statements against existing production tables
 *      (`drop table` without `if exists` on a non-same-migration table,
 *      `truncate`, `drop column` outside an explicit, commented down-block).
 *
 * This is a static lint, not a DB connection — it runs in CI with no secrets.
 */
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const DIR = join(process.cwd(), "supabase", "migrations");
let failed = false;
const fail = (m) => {
  console.error(`FAIL: ${m}`);
  failed = true;
};

const files = readdirSync(DIR)
  .filter((f) => f.endsWith(".sql"))
  .sort();

if (files.length === 0) {
  console.error("FAIL: no migrations found");
  process.exit(1);
}

// 1. Sequential, unique numeric prefixes.
const seen = new Set();
let expected = 1;
for (const f of files) {
  const m = /^(\d{4})_/.exec(f);
  if (!m) {
    fail(`migration '${f}' doesn't start with a 4-digit prefix`);
    continue;
  }
  const n = Number(m[1]);
  if (seen.has(n)) fail(`duplicate migration number ${m[1]} (${f})`);
  seen.add(n);
  if (n !== expected) fail(`migration numbering gap/order: expected ${String(expected).padStart(4, "0")}, saw ${m[1]}`);
  expected = n + 1;
}

// 2/3. Per-file content checks.
for (const f of files) {
  const sql = readFileSync(join(DIR, f), "utf8");
  const lower = sql.toLowerCase();

  // Tables created in THIS migration.
  const created = [...lower.matchAll(/create table (?:if not exists )?([a-z0-9_]+)/g)].map((x) => x[1]);
  const rlsEnabled = new Set(
    [...lower.matchAll(/alter table ([a-z0-9_]+)\s+enable row level security/g)].map((x) => x[1])
  );
  for (const t of created) {
    if (!rlsEnabled.has(t)) {
      fail(`${f}: table '${t}' is created but never gets 'enable row level security'`);
    }
  }

  // Destructive statements. `drop ... if exists` inside a commented down-block
  // is allowed (lines starting with --); flag only uncommented ones.
  const lines = sql.split("\n");
  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i];
    const line = raw.trim().toLowerCase();
    if (line.startsWith("--")) continue; // commented (down-migration guidance)
    // A TRUNCATE *statement* (not a `revoke ... truncate ...` privilege grant).
    if (/^truncate\b/.test(line) || /\btruncate\s+table\b/.test(line)) {
      fail(`${f}:${i + 1}: TRUNCATE is not allowed in a migration`);
    }
    // drop table on a table NOT created in this same migration is destructive.
    const dropT = /drop table (?:if exists )?([a-z0-9_]+)/.exec(line);
    if (dropT && !created.includes(dropT[1])) {
      fail(`${f}:${i + 1}: drops pre-existing table '${dropT[1]}' (destructive)`);
    }
    const dropC = /alter table [a-z0-9_]+ drop column/.exec(line);
    if (dropC) fail(`${f}:${i + 1}: DROP COLUMN outside a commented down-block is destructive`);
  }
}

if (failed) {
  console.error("\nMigration validation FAILED.");
  process.exit(1);
}
console.log(`Migration validation passed (${files.length} migrations, RLS + non-destructive checks).`);
