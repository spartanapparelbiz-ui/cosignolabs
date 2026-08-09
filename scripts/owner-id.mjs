#!/usr/bin/env node
/**
 * Print a Supabase Auth user id, for pasting into OWNER_IDS.
 *
 * DEVELOPER TOOL. This is a local CLI. It is not imported by the app, has no
 * route, and ships nothing to production — deliberately, because an endpoint
 * whose only job is to expose identity information should not exist on a
 * deployment, however well authenticated it is.
 *
 * Two modes:
 *
 *   node scripts/owner-id.mjs
 *     Signs in as one account with its own email + password (the same
 *     signInWithPassword call the real /sign-in screen makes) and prints the
 *     id that session resolves to. That is byte-for-byte what getUserId()
 *     returns for that person, so it is the authoritative answer. Uses the
 *     ANON key only — no service-role key, no admin privileges.
 *
 *   node scripts/owner-id.mjs --list
 *     Lists every auth user as `id  email`, so several owner ids can be
 *     collected at once. Requires SUPABASE_SERVICE_ROLE_KEY, because listing
 *     users is an admin operation.
 *
 * Nothing is written to disk and no session is persisted; the password is read
 * without echo and the interactive session is signed out before exit. No key,
 * password, or token is ever printed — only user ids and the emails you
 * already typed or own.
 *
 * The Supabase Dashboard is an equally valid source and needs no tooling:
 *   Authentication → Users → the UID column
 *   or, in the SQL editor:  select id, email from auth.users order by created_at;
 */
import { createInterface } from "node:readline";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createClient } from "@supabase/supabase-js";

/**
 * Load .env.local then .env into process.env WITHOUT overriding anything
 * already set, mirroring how Next resolves them so the script sees the same
 * project as `npm run dev`. Values are used, never printed.
 */
function loadEnvFiles() {
  for (const file of [".env.local", ".env"]) {
    let raw;
    try {
      raw = readFileSync(join(process.cwd(), file), "utf8");
    } catch {
      continue; // absent is normal
    }
    for (const line of raw.split("\n")) {
      const m = /^\s*(?:export\s+)?([A-Z0-9_]+)\s*=\s*(.*)$/.exec(line);
      if (!m) continue;
      const key = m[1];
      if (process.env[key] !== undefined) continue;
      process.env[key] = m[2].trim().replace(/^["'](.*)["']$/, "$1");
    }
  }
}

const interactive = process.stdin.isTTY === true;

/**
 * Non-TTY input (a pipe, a heredoc, CI) is drained ONCE and served from a
 * queue. Asking readline for a second line from a pipe does not work: both
 * lines arrive in the same chunk, the first question consumes one, and the
 * rest is gone by the time the second question registers — which hangs the
 * script on a prompt that can never be answered.
 */
let piped = null;
function nextPipedLine() {
  if (piped === null) {
    let raw = "";
    try {
      raw = readFileSync(0, "utf8");
    } catch {
      raw = ""; // no stdin at all
    }
    piped = raw.split("\n");
  }
  return piped.shift() ?? "";
}

/**
 * ONE readline interface for the whole run — a second one over the same stdin
 * would fight the first for input.
 */
let rl = null;
function reader() {
  if (!rl) {
    rl = createInterface({ input: process.stdin, output: process.stdout, terminal: true });
  }
  return rl;
}

function ask(question) {
  if (!interactive) {
    const answer = nextPipedLine().trim();
    process.stdout.write(`${question}${answer}\n`);
    return Promise.resolve(answer);
  }
  return new Promise((resolve) => reader().question(question, (a) => resolve(a.trim())));
}

/**
 * Read a line without echoing it.
 *
 * readline writes both the prompt and every keystroke through _writeToOutput,
 * so overriding it to emit the prompt once and swallow the rest keeps the
 * password off the screen (and out of any scrollback or screen share).
 *
 * With piped input there is no terminal to hide from and no echo to suppress,
 * so the override is skipped — hiding is a property of the TTY, and pretending
 * otherwise is how the prompt used to hang.
 */
function askHidden(question) {
  if (!interactive) {
    // No terminal, so nothing to hide from — and the answer is never echoed.
    process.stdout.write(`${question}\n`);
    return Promise.resolve(nextPipedLine());
  }
  return new Promise((resolve) => {
    const input = reader();
    const restore = input._writeToOutput;
    input._writeToOutput = (chunk) => {
      if (chunk.includes(question)) process.stdout.write(question);
      // every other write is a keystroke echo — drop it
    };
    input.question(question, (answer) => {
      input._writeToOutput = restore;
      process.stdout.write("\n");
      resolve(answer);
    });
  });
}

function fail(message) {
  console.error(`\n  ${message}\n`);
  process.exit(1);
}

loadEnvFiles();

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
if (!url) {
  fail(
    "The Supabase project URL is not set for this shell.\n" +
      "  Add it to .env.local (see .env.example), or read the ids straight from\n" +
      "  the Supabase Dashboard: Authentication -> Users -> the UID column."
  );
}

if (process.argv.includes("--list")) {
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceKey) {
    fail(
      "Listing every user is an admin operation and needs the service-role key\n" +
        "  in this shell. Either set it, run without --list to sign in as one\n" +
        "  account, or use the Supabase Dashboard: Authentication -> Users."
    );
  }
  const admin = createClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { data, error } = await admin.auth.admin.listUsers({ perPage: 200 });
  if (error) fail(`Could not list users: ${error.message}`);
  if (!data.users.length) fail("This project has no auth users yet.");

  console.log("\n  Supabase Auth users — copy the ids you want as owners:\n");
  for (const u of data.users) {
    console.log(`  ${u.id}  ${u.email ?? "(no email)"}`);
  }
  const sample = data.users.slice(0, 2).map((u) => u.id).join(",");
  console.log(`\n  Set them as a comma-separated list, e.g.\n    OWNER_IDS=${sample}\n`);
  process.exit(0);
}

const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
if (!anonKey) {
  fail(
    "The Supabase anon key is not set for this shell.\n" +
      "  Add it to .env.local (see .env.example), or read the ids straight from\n" +
      "  the Supabase Dashboard: Authentication -> Users -> the UID column."
  );
}

console.log(
  "\n  Sign in as the account you want to make an owner.\n" +
    "  This is the same sign-in the app performs; the id printed is exactly\n" +
    "  what the server resolves for that session.\n"
);

const email = await ask("  email: ");
if (!email) fail("No email given.");
const password = await askHidden("  password: ");
if (!password) fail("No password given.");

const supabase = createClient(url, anonKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});
const { data, error } = await supabase.auth.signInWithPassword({ email, password });
if (interactive) reader().close();
if (error) fail(`Sign-in failed: ${error.message}`);
if (!data.user) fail("Sign-in returned no user.");

console.log(`\n  user id:  ${data.user.id}\n`);
console.log("  Add it to OWNER_IDS (comma-separated for more than one):\n");
console.log(`    OWNER_IDS=${data.user.id}\n`);

// Revoke the session we just created — this script leaves nothing behind.
await supabase.auth.signOut();
