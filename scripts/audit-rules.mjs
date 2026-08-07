// Adversarial audit of the safety-rule engine, printed as a matrix.
//
// Builds one rule per operation per provider, then fires it at EVERY
// capability of EVERY built-in connector and reports any match that is not the
// operation the rule names. A single ✗ means a rule would stop something its
// author did not ask it to stop, which is the failure this engine exists to
// prevent — so the script exits non-zero on one.
//
//   node scripts/audit-rules.mjs
import { spawnSync } from "node:child_process";
import { writeFileSync, rmSync } from "node:fs";

// The engine is TypeScript; run the audit through vitest, which already has
// the transform configured, rather than maintaining a second build path.
const SPEC = `
import { describe, it } from "vitest";
import { applyRules, parsePermissionRule, readRule } from "../src/lib/rules";
import { PROVIDER_ACTION_OPERATION } from "../src/lib/ruleIntents";

const ALL = Object.entries(PROVIDER_ACTION_OPERATION).flatMap(([provider, actions]) =>
  Object.entries(actions).map(([actionId, operation]) => ({ provider, actionId, operation }))
);

const SCOPE_WORD = {
  google: "gmail",
  outlook: "outlook",
  github: "github",
  slack: "slack",
  notion: "notion",
  "google-drive": "google drive",
  "google-calendar": "google calendar",
};

const PHRASE = {
  read: (s) => \`always ask before reading \${s}\`,
  draft: (s) => \`always ask before drafting in \${s}\`,
  send: (s) => \`always ask before sending in \${s}\`,
  post: (s) => \`always ask before posting in \${s}\`,
  create: (s) => \`always ask before creating in \${s}\`,
  update: (s) => \`always ask before updating in \${s}\`,
  archive: (s) => \`always ask before archiving in \${s}\`,
  delete: (s) => \`always ask before deleting in \${s}\`,
};

function rec(text) {
  return { id: text, user_id: "audit", text, enabled: true, created_at: "", updated_at: "", ...parsePermissionRule(text) };
}

describe("audit", () => {
  it("prints the matrix", () => {
    let checks = 0, wrong = 0, rules = 0;
    const lines = [];
    for (const [provider, word] of Object.entries(SCOPE_WORD)) {
      lines.push("");
      lines.push(\`\${provider}\`);
      for (const [op, build] of Object.entries(PHRASE)) {
        const text = build(word);
        const parsed = parsePermissionRule(text);
        const r = [rec(text)];
        rules++;
        const fired = ALL.filter((a) => applyRules(r, { target: a.provider, actionId: a.actionId }).requirement !== null);
        const bad = fired.filter((a) => a.operation !== parsed.verb);
        checks += ALL.length;
        wrong += bad.length;
        const reading = readRule(parsed);
        const mark = bad.length === 0 && parsed.verb === op ? "ok " : "BAD";
        lines.push(
          \`  [\${mark}] "\${text}"\`.padEnd(58) +
            \`understood: \${reading.action} / \${reading.scope}\`.padEnd(44) +
            \`fires on \${fired.length}\` +
            (bad.length ? \`  WRONG: \${bad.map((b) => b.provider + "." + b.actionId + "(" + b.operation + ")").join(", ")}\` : "")
        );
      }
    }
    lines.push("");
    lines.push(\`\${rules} rules x \${ALL.length} capabilities = \${checks} checks — \${wrong} wrong match\${wrong === 1 ? "" : "es"}\`);
    console.log(lines.join("\\n"));
    if (wrong > 0) throw new Error(\`\${wrong} wrong matches\`);
  });
});
`;

const path = "tests/__audit.tmp.test.ts";
writeFileSync(path, SPEC);
let res;
try {
  res = spawnSync("npx", ["vitest", "run", path, "--reporter=basic"], {
    stdio: "inherit",
    shell: false,
  });
} finally {
  // A leftover spec matches the default Vitest glob, so the next ordinary
  // `npm test` would pick up this audit and fail for unrelated reasons.
  rmSync(path, { force: true });
}
process.exit(res?.status ?? 1);
