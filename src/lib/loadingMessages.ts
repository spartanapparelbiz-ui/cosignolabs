/**
 * What cosigno says while a page is on its way.
 *
 * The message is derived from the route being opened, never picked at random.
 * A random reassurance is worse than none: the same wait says something
 * different every time, which is exactly how a loading screen stops meaning
 * anything. Here, "Checking connected apps" appears if and only if you are
 * opening connections — so the words are information, not decoration.
 *
 * Pure and exported so the mapping is unit-tested rather than eyeballed.
 */

/** Longest-prefix first: /app/settings/rules must beat /app/settings. */
const ROUTE_MESSAGES: ReadonlyArray<readonly [string, string]> = [
  ["/app/missions", "Finding today's work"],
  ["/app/approvals", "Loading approvals"],
  ["/app/connections", "Checking connected apps"],
  ["/app/activity", "Gathering what's happened"],
  ["/app/mission-control", "Tuning in to live work"],
  ["/app/monitoring", "Reading the last few hours"],
  ["/app/templates", "Organizing missions"],
  ["/app/objectives", "Lining up your objectives"],
  ["/app/automations", "Checking what runs on its own"],
  ["/app/settings/rules", "Loading your rules"],
  ["/app/settings", "Opening your settings"],
  ["/app/account/plan", "Loading your plan"],
  ["/app/account", "Opening your account"],
  ["/app/trust", "Reviewing what cosigno may touch"],
  ["/app/files", "Collecting your files"],
  ["/app/memory", "Recalling what cosigno knows"],
  ["/app/team", "Gathering your team"],
  ["/app/workspace", "Preparing your workspace"],
  ["/app/skills", "Reviewing what cosigno can do"],
  ["/app/focus", "Clearing the room"],
  ["/app/browser", "Opening the live view"],
  ["/app/health", "Checking on the operator"],
  ["/app/decisions", "Loading your decisions"],
  ["/app/autopilot", "Reading the signals"],
  ["/app/simulation", "Setting up the dry run"],
  ["/app/watch", "Watching for changes"],
  ["/app", "Preparing your workspace"],
];

/** The line shown under the mark while `pathname` loads. */
export function loadingMessageFor(pathname: string): string {
  const path = normalize(pathname);
  for (const [prefix, message] of ROUTE_MESSAGES) {
    if (path === prefix || path.startsWith(`${prefix}/`)) return message;
  }
  return "One moment";
}

/** Trailing slashes and query strings are not part of the route's identity. */
function normalize(pathname: string): string {
  const path = (pathname || "/").split("?")[0].split("#")[0];
  return path.length > 1 && path.endsWith("/") ? path.slice(0, -1) : path;
}

/**
 * The title a route wears while it loads, so the heading is already correct
 * when the real page lands and nothing jumps. Empty means "no header yet".
 */
const ROUTE_TITLES: ReadonlyArray<readonly [string, string]> = [
  ["/app/missions", "delegations"],
  ["/app/approvals", "approvals"],
  ["/app/connections", "connections"],
  ["/app/activity", "activity"],
  ["/app/mission-control", "live work"],
  ["/app/monitoring", "monitoring"],
  ["/app/templates", "templates"],
  ["/app/settings/rules", "rules"],
  ["/app/account", "account"],
  ["/app/trust", "trust"],
  ["/app/files", "files"],
  ["/app/memory", "memory"],
  ["/app/team", "team"],
];

export function loadingTitleFor(pathname: string): string {
  const path = normalize(pathname);
  for (const [prefix, title] of ROUTE_TITLES) {
    if (path === prefix || path.startsWith(`${prefix}/`)) return title;
  }
  return "";
}
