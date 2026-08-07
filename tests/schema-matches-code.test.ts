import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

/**
 * The schema must accept every value the code writes.
 *
 * `connections.kind` was constrained to ('app', 'mcp') while the app wrote a
 * third kind, 'custom', for user-added API tools. Every attempt to add one
 * failed in production and succeeded locally, because the in-memory store has
 * no constraints — so the tests passed, the developer saw it work, and only a
 * real customer ever hit it.
 *
 * That asymmetry is the actual defect: it will happen again with the next
 * enum-ish column. These tests read the CHECK constraints out of the migrations
 * and compare them against the literals the code actually writes, so a value
 * the database would reject fails here first.
 */

const MIGRATIONS = "supabase/migrations";

function allMigrationSql(): string {
  return readdirSync(MIGRATIONS)
    .filter((f) => f.endsWith(".sql"))
    .sort()
    .map((f) => readFileSync(join(MIGRATIONS, f), "utf8"))
    .join("\n");
}

/**
 * Every statement that defines or alters ONE table. Without this the parser
 * happily reads `objectives.status` when asked about `connections.status` —
 * a false pass or a false failure, both worse than no test.
 */
function statementsFor(sql: string, table: string): string {
  const create = new RegExp(`create table[^;]*\\b${table}\\s*\\([\\s\\S]*?\\n\\);`, "gi");
  const alter = new RegExp(`alter table[^;]*\\b${table}\\b[^;]*;`, "gi");
  return [...(sql.match(create) ?? []), ...(sql.match(alter) ?? [])].join("\n");
}

/**
 * The values a column's CHECK allows, taking the LAST definition in migration
 * order — a later `add constraint` supersedes an earlier one.
 */
function allowedValues(sql: string, table: string, column: string): string[] {
  const scoped = statementsFor(sql, table);
  const re = new RegExp(`check\\s*\\(\\s*${column}\\s+in\\s*\\(([^)]*)\\)`, "gi");
  let last: string[] | null = null;
  for (const m of scoped.matchAll(re)) {
    last = [...m[1].matchAll(/'([^']+)'/g)].map((x) => x[1]);
  }
  return last ?? [];
}

/** Every `kind: "…"` / `auth_type: "…"` literal handed to createConnection. */
function writtenLiterals(field: string): string[] {
  const found = new Set<string>();
  function walk(dir: string) {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(full);
        continue;
      }
      if (!entry.name.endsWith(".ts") && !entry.name.endsWith(".tsx")) continue;
      const src = readFileSync(full, "utf8");
      // Only where a connection is being built — not every object in the app.
      if (!/createConnection\(/.test(src)) continue;
      for (const m of src.matchAll(new RegExp(`${field}:\\s*"([a-z_0-9]+)"`, "g"))) {
        found.add(m[1]);
      }
    }
  }
  walk("src");
  return [...found];
}

describe("connections schema accepts what the code writes", () => {
  const sql = allMigrationSql();

  it("reads the constraints (a broken parse would pass everything)", () => {
    expect(allowedValues(sql, "connections", "kind").length).toBeGreaterThan(1);
    expect(allowedValues(sql, "connections", "auth_type").length).toBeGreaterThan(1);
  });

  it("every connection kind the code writes is allowed by the database", () => {
    const allowed = allowedValues(sql, "connections", "kind");
    const written = writtenLiterals("kind");
    expect(written.length, "expected to find kinds written in src").toBeGreaterThan(0);
    for (const kind of written) {
      expect(
        allowed,
        `code writes connections.kind = "${kind}", which the CHECK constraint rejects`
      ).toContain(kind);
    }
  });

  it("every auth_type the code writes is allowed by the database", () => {
    const allowed = allowedValues(sql, "connections", "auth_type");
    for (const authType of writtenLiterals("auth_type")) {
      expect(
        allowed,
        `code writes connections.auth_type = "${authType}", which the CHECK constraint rejects`
      ).toContain(authType);
    }
  });

  it("every connection status the code writes is allowed by the database", () => {
    const allowed = allowedValues(sql, "connections", "status");
    // Statuses the app sets on a connection, from ConnectionRecord's union.
    for (const status of ["connected", "needs_reauth", "error", "revoked"]) {
      expect(allowed, `connections.status "${status}" is not allowed`).toContain(status);
    }
  });
});
