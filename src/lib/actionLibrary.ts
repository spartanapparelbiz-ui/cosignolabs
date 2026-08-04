import { canonicalize } from "./workspace-model/canonical";
import { mutationOf, singularize, splitActionId, type Mutation } from "./twin/model";

/**
 * The Action Library — every capability, named the way a person would say it.
 *
 * A connector speaks in endpoints (`POST /customers/refund`), ids
 * (`create_refund`), and verbs (`GET`). None of those are things an operations
 * manager should ever have to read to approve something. So every operation,
 * from every kind of connection, is rendered through ONE function into a
 * business action:
 *
 *     create_refund        → Refund customer
 *     merge_pull_request   → Merge pull request
 *     list_repositories    → View repositories
 *     POST /v1/widgets     → (never shown)
 *
 * Pure and client-safe: no provider, no network, no secrets. Deterministic, so
 * an action is called the same thing on the connections page, the approval
 * card, and the ledger — one name per capability, everywhere.
 */

export interface BusinessAction {
  /** What the action is called, in plain language. */
  name: string;
  /** The connector's own one-line description, when it adds anything. */
  detail: string;
  /** Read / create / update / delete, for tone and iconography. */
  mutation: Mutation;
}

/**
 * Verbs worth keeping as the user's own word. "Merge", "archive" and "invite"
 * say something "update" doesn't, so the library preserves them rather than
 * flattening every write into the same four CRUD words.
 */
const VERB_WORD: Record<string, string> = {
  list: "View",
  get: "View",
  read: "View",
  fetch: "View",
  search: "Search",
  find: "Search",
  create: "Create",
  add: "Add",
  open: "Open",
  post: "Post",
  send: "Send",
  upload: "Upload",
  invite: "Invite",
  update: "Update",
  edit: "Edit",
  set: "Set",
  move: "Move",
  label: "Label",
  assign: "Assign",
  merge: "Merge",
  close: "Close",
  archive: "Archive",
  comment: "Comment on",
  reply: "Reply to",
  run: "Run",
  trigger: "Trigger",
  deploy: "Deploy",
  delete: "Delete",
  remove: "Remove",
  revoke: "Revoke",
  cancel: "Cancel",
  refund: "Refund",
};

/**
 * Money and other cases where the literal verb+object reads wrong. These are
 * the names the product already uses out loud, so the library uses them too.
 */
const NAMED: Record<string, string> = {
  create_refund: "Refund customer",
  issue_refund: "Refund customer",
  refund_payment: "Refund payment",
  create_payment: "Send payment",
  create_charge: "Charge customer",
  create_invoice: "Create invoice",
  send_message: "Send message",
  send_email: "Send email",
  create_pull_request: "Open pull request",
};

function titleCase(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/** Verbs that act on the whole set, so the object reads as a plural. */
const PLURAL_VERBS = new Set(["list", "search", "find"]);

function pluralize(word: string): string {
  if (/(s|x|z|ch|sh)$/.test(word)) return `${word}es`;
  if (/[^aeiou]y$/.test(word)) return `${word.replace(/y$/, "ies")}`;
  return `${word}s`;
}

/** Words → a readable object phrase ("pull_request" → "pull request"). */
function objectPhrase(resource: string, verb: string): string {
  // Singularize FIRST: "list_opportunities" has to canonicalize to the same
  // object as "get_opportunity", and pluralizing an already-plural word gives
  // you "opportunitieses".
  const singular = singularize(resource);
  const canonical = canonicalize(singular);
  // A canonical label is the better noun when we recognize the object; an
  // unrecognized resource keeps the connector's own word rather than being
  // renamed into something it isn't.
  const label = canonical.domain === "generic" ? singular.replace(/_/g, " ") : canonical.label;
  const phrase = label.toLowerCase();
  // "View customers" reads right; "View customer" reads like a single record
  // the action doesn't actually target.
  return PLURAL_VERBS.has(verb) ? pluralize(phrase) : phrase;
}

/**
 * Name one operation. `summary` is the connector's own description and is kept
 * as supporting detail — never as the headline, because a connector can
 * describe itself however it likes and the headline has to be predictable.
 */
export function businessAction(operationId: string, summary = ""): BusinessAction {
  const { verb, resource } = splitActionId(operationId);
  const mutation = mutationOf(verb, verb !== "list" && verb !== "get" && verb !== "search");

  const named = NAMED[operationId.toLowerCase()];
  if (named) return { name: named, detail: cleanDetail(summary, named), mutation };

  const word = VERB_WORD[verb];
  // An id that doesn't follow verb_resource (a bare MCP tool name like
  // "summarize", or "doThing") is humanized whole rather than guessed at.
  const name = word
    ? `${word} ${objectPhrase(resource, verb)}`
    : titleCase(operationId.replace(/[_.]+/g, " ").replace(/([a-z0-9])([A-Z])/g, "$1 $2").toLowerCase());

  return { name: titleCase(name), detail: cleanDetail(summary, name), mutation };
}

/** Drop a summary that just repeats the name — one line, not two identical ones. */
function cleanDetail(summary: string, name: string): string {
  const s = summary.trim();
  if (!s) return "";
  const normalize = (v: string) => v.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  return normalize(s) === normalize(name) ? "" : s;
}

/**
 * Group a connection's operations for display: reads first (they're the safe
 * ones and they set context), then writes, then anything destructive last —
 * the order a person scans when deciding what to allow.
 */
const MUTATION_ORDER: Record<Mutation, number> = { read: 0, create: 1, update: 2, delete: 3 };

export function sortActions<T extends { id: string }>(actions: readonly T[]): T[] {
  return [...actions].sort((a, b) => {
    const ma = businessAction(a.id);
    const mb = businessAction(b.id);
    return MUTATION_ORDER[ma.mutation] - MUTATION_ORDER[mb.mutation] || ma.name.localeCompare(mb.name);
  });
}
