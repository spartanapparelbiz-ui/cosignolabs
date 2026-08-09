// Reachability sweep over src/.
//
// Walks the import graph outward from every real entry point Next.js can
// reach — route files, layouts, error boundaries, middleware, instrumentation
// — and reports any module under src/ that nothing leads to. A file that no
// entry point reaches is not shipped and not run; it is a maintenance cost
// with no reader.
//
//   node scripts/check-unreachable.mjs           # report
//   node scripts/check-unreachable.mjs --strict  # exit non-zero if any found
import { readFileSync, readdirSync, statSync, existsSync } from "node:fs";
import { join, dirname, resolve, relative } from "node:path";

const ROOT = process.cwd();
const SRC = join(ROOT, "src");
const STRICT = process.argv.includes("--strict");

/** Every file under a directory, recursively. */
function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.(ts|tsx)$/.test(name)) out.push(p);
  }
  return out;
}

const ALL = walk(SRC);

/**
 * Entry points: anything Next.js loads by convention, plus test-only helpers
 * are deliberately NOT entries — a module kept alive only by its own test is
 * still dead product code.
 */
const ENTRY = ALL.filter((f) => {
  const rel = relative(SRC, f);
  if (rel === "middleware.ts" || rel === "instrumentation.ts") return true;
  if (!rel.startsWith("app/")) return false;
  return /(^|\/)(page|layout|route|template|loading|error|global-error|not-found|default|robots|sitemap|manifest|opengraph-image|icon)\.tsx?$/.test(
    rel
  );
});

const EXTS = [".ts", ".tsx", "/index.ts", "/index.tsx"];

/** Resolve an import specifier to a file under src/, or null if it's external. */
function resolveSpec(spec, fromFile) {
  let base;
  if (spec.startsWith("@/")) base = join(SRC, spec.slice(2));
  else if (spec.startsWith(".")) base = resolve(dirname(fromFile), spec);
  else return null;
  if (existsSync(base) && statSync(base).isFile()) return base;
  for (const ext of EXTS) {
    const cand = base + ext;
    if (existsSync(cand) && statSync(cand).isFile()) return cand;
  }
  return null;
}

const IMPORT_RE =
  /(?:^|\s)(?:import|export)\s[\s\S]*?from\s*["']([^"']+)["']|import\s*\(\s*["']([^"']+)["']\s*\)|require\(\s*["']([^"']+)["']\s*\)/g;

function importsOf(file) {
  const src = readFileSync(file, "utf8");
  const found = new Set();
  for (const m of src.matchAll(IMPORT_RE)) {
    const spec = m[1] || m[2] || m[3];
    if (!spec) continue;
    const target = resolveSpec(spec, file);
    if (target) found.add(target);
  }
  return [...found];
}

const seen = new Set();
const queue = [...ENTRY];
while (queue.length) {
  const file = queue.pop();
  if (seen.has(file)) continue;
  seen.add(file);
  for (const dep of importsOf(file)) if (!seen.has(dep)) queue.push(dep);
}

const orphans = ALL.filter((f) => !seen.has(f)).map((f) => relative(ROOT, f)).sort();

if (orphans.length === 0) {
  console.log(`Reachability sweep passed (${seen.size} modules reachable, 0 orphans).`);
} else {
  console.log(`${orphans.length} unreachable module(s) under src/:`);
  for (const o of orphans) console.log("  " + o);
  if (STRICT) process.exit(1);
}
