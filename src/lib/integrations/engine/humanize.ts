/**
 * Action generation: technical identifiers → business language.
 *
 *   POST /v1/orders        → Create Order
 *   PATCH /users/{id}      → Update User
 *   DELETE /files/{id}     → Delete File
 *   create_issue           → Create Issue
 *   list_repos             → List Repositories
 *
 * Entirely deterministic — no model call. A label is what a person reads before
 * approving something, so it has to be reproducible and reviewable: the same
 * endpoint must always render the same words, and those words must never be
 * softer than the operation. A generated "Update Order" in front of a DELETE
 * is a label that gets things approved that shouldn't be.
 */

/** Common API abbreviations that read badly when naively title-cased. */
const EXPAND: Record<string, string> = {
  repo: "Repository",
  repos: "Repositories",
  org: "Organization",
  orgs: "Organizations",
  msg: "Message",
  msgs: "Messages",
  pr: "Pull Request",
  prs: "Pull Requests",
  db: "Database",
  cfg: "Configuration",
  auth: "Authentication",
  acct: "Account",
  txn: "Transaction",
  inv: "Invoice",
  sub: "Subscription",
  attr: "Attribute",
  id: "ID",
  api: "API",
  url: "URL",
  sms: "SMS",
};

/** Verb stems → the word a person would use. Order matters: see verbFor. */
const VERBS: Array<[RegExp, string]> = [
  // Destructive first. "delete_draft" contains both stems, and a label that
  // reads softer than the operation is the dangerous direction to be wrong in.
  [/^(delete|destroy|remove|purge|drop)/, "Delete"],
  [/^(archive|trash)/, "Archive"],
  [/^(refund)/, "Refund"],
  [/^(cancel|void)/, "Cancel"],
  [/^(merge)/, "Merge"],
  [/^(send|email|notify)/, "Send"],
  [/^(post|publish)/, "Publish"],
  [/^(create|add|new|open|make|insert)/, "Create"],
  [/^(update|edit|patch|modify|set|rename|change)/, "Update"],
  [/^(upsert|replace)/, "Replace"],
  [/^(list|index|all)/, "List"],
  [/^(search|query|find|lookup)/, "Search"],
  [/^(get|read|show|fetch|view|describe)/, "View"],
  [/^(download)/, "Download"],
  [/^(upload)/, "Upload"],
];

const HTTP_VERB: Record<string, string> = {
  GET: "View",
  POST: "Create",
  PUT: "Replace",
  PATCH: "Update",
  DELETE: "Delete",
};

function titleWord(w: string): string {
  const lower = w.toLowerCase();
  if (EXPAND[lower]) return EXPAND[lower];
  return lower.charAt(0).toUpperCase() + lower.slice(1);
}

/** Split snake_case / kebab-case / camelCase into lowercase words. */
export function words(input: string): string[] {
  return input
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .split(/[^A-Za-z0-9]+/)
    .filter(Boolean)
    .map((w) => w.toLowerCase());
}

/** The verb a leading token implies, or null when it isn't a known verb. */
function verbFor(token: string): string | null {
  for (const [re, verb] of VERBS) if (re.test(token)) return verb;
  return null;
}

/**
 * A path's resource: the last segment that isn't a parameter or a version.
 * `/v1/customer/{id}/refund` → "refund"; `/repos/{owner}/{repo}/issues` →
 * "issues".
 */
export function resourceFromPath(path: string): string | null {
  const segments = path
    .split("/")
    .map((s) => s.trim())
    .filter(Boolean)
    // Drop path parameters in every common notation, and version prefixes.
    .filter((s) => !/^[{:<]/.test(s) && !/^v\d+$/i.test(s) && !/^\d+$/.test(s));
  const last = segments.pop();
  return last ? last.replace(/[}>].*$/, "") : null;
}

/** Rough singular, only for the shapes real APIs actually use. */
function singular(word: string): string {
  if (/ies$/i.test(word)) return word.replace(/ies$/i, "y");
  if (/(s|sh|ch|x|z)es$/i.test(word)) return word.replace(/es$/i, "");
  if (/ss$/i.test(word)) return word;
  if (/s$/i.test(word)) return word.replace(/s$/i, "");
  return word;
}

/**
 * Label for an action identified by name alone (a provider action id, an MCP
 * tool name). Falls back to title-casing the whole thing rather than inventing
 * a verb it can't see.
 */
export function humanizeActionId(id: string): string {
  const parts = words(id);
  // Never render an empty label. A blank row in an approval list is worse than
  // an ugly one — there is nothing to read before deciding.
  if (parts.length === 0) return id.trim() || "Unnamed action";

  const verb = verbFor(parts[0]);
  if (!verb) return parts.map(titleWord).join(" ");

  const rest = parts.slice(1);
  if (rest.length === 0) return verb;

  // "list_repos" keeps the plural; "create_issue" stays singular. The verb
  // tells us which reads correctly.
  const plural = verb === "List" || verb === "Search";
  const noun = rest.map((w, i) => (i === rest.length - 1 && !plural ? titleWord(singular(w)) : titleWord(w)));
  return `${verb} ${noun.join(" ")}`;
}

/**
 * Label for an HTTP endpoint. The method decides the verb — it is what the
 * server will actually do, and it cannot be talked out of it by a friendly
 * path name.
 */
export function humanizeEndpoint(method: string, path: string): string {
  const verb = HTTP_VERB[method.toUpperCase()] ?? titleWord(method);
  const resource = resourceFromPath(path);
  if (!resource) return verb;

  const parts = words(resource);
  if (parts.length === 0) return verb;

  // A trailing verb-ish segment IS the action: /customer/{id}/refund is a
  // refund, not a "Create Refund".
  const trailingVerb = verbFor(parts[0]);
  if (trailingVerb && parts.length === 1 && method.toUpperCase() === "POST") return trailingVerb;

  const plural = verb === "View" && /s$/i.test(resource) && !/ss$/i.test(resource);
  const noun = parts.map((w, i) =>
    i === parts.length - 1 && !plural ? titleWord(singular(w)) : titleWord(w)
  );
  return `${plural ? "List" : verb} ${noun.join(" ")}`;
}
