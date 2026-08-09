// Unused-asset sweep over public/.
//
// A static file nobody references is dead weight in the deploy and one more
// thing to keep in sync with the brand. This looks for each asset by full
// path, by basename, and by the stem used in template literals (`/logos/
// ${key}.svg`), so dynamically-built paths still count as references.
//
//   node scripts/check-unused-assets.mjs           # report
//   node scripts/check-unused-assets.mjs --strict  # exit non-zero if any found
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, basename, extname } from "node:path";

const ROOT = process.cwd();
const PUBLIC = join(ROOT, "public");
const STRICT = process.argv.includes("--strict");

/** Files served from their own URL by convention, never imported by name. */
const CONVENTION = new Set([
  "favicon.ico",
  "favicon.svg",
  "robots.txt",
  "sitemap.xml",
  "manifest.webmanifest",
]);

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else out.push(p);
  }
  return out;
}

const SEARCH_DIRS = ["src", "scripts", "netlify", "tests"].filter((d) => {
  try {
    return statSync(join(ROOT, d)).isDirectory();
  } catch {
    return false;
  }
});

const haystack = SEARCH_DIRS.flatMap((d) => walk(join(ROOT, d)))
  .filter((f) => /\.(ts|tsx|mjs|js|json|css|md)$/.test(f))
  .map((f) => readFileSync(f, "utf8"))
  .join("\n");

const unused = [];
for (const file of walk(PUBLIC)) {
  const rel = relative(PUBLIC, file);
  const base = basename(file);
  if (CONVENTION.has(base)) continue;
  const stem = base.slice(0, base.length - extname(base).length);
  // Referenced by URL, by filename, or by the stem a template literal builds
  // the filename from (`/logos/${key}.svg`).
  const referenced =
    haystack.includes("/" + rel) ||
    haystack.includes(base) ||
    haystack.includes(`"${stem}"`) ||
    haystack.includes(`'${stem}'`);
  if (!referenced) unused.push("public/" + rel);
}

if (unused.length === 0) {
  console.log("Unused-asset sweep passed (every file in public/ is referenced).");
} else {
  console.log(`${unused.length} unreferenced asset(s) in public/:`);
  for (const u of unused.sort()) console.log("  " + u);
  if (STRICT) process.exit(1);
}
