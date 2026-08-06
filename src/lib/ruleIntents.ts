import type { ActionCategory } from "./types";

/**
 * The normalized vocabulary every safety rule and every action resolve to.
 *
 * Rules used to be matched by looking for their words inside an action's
 * summary sentence. That is not a rule engine, it is a search box: "scan your
 * inbox for promotional senders" contains "send", so a rule about SENDING mail
 * stopped a read. A safety rule that stops the wrong action is worse than no
 * rule, because the next correct one is not believed either.
 *
 * So nothing here reads prose. An action declares what it is — a provider and
 * one operation from a closed set — and a rule declares what it governs, in
 * the same two terms. Matching is set membership. Two actions with the same
 * (provider, operation) are treated identically no matter how they are worded,
 * and no action can be caught by a rule that did not name its operation.
 */

/* ------------------------------------------------------------ operations -- */

/**
 * Every operation cosigno can perform, as a closed set. New connector actions
 * MUST map to one of these — the mapping is a table below, never a guess, so
 * an unmapped action is a visible gap rather than a silent mismatch.
 */
export const OPERATIONS = [
  "read",
  "draft",
  "send",
  "post",
  "publish",
  "create",
  "update",
  "archive",
  "move",
  "rename",
  "close",
  "merge",
  "cancel",
  "delete",
  "refund",
  "payment",
  "deploy",
  "webhook",
] as const;

export type Operation = (typeof OPERATIONS)[number];

export function isOperation(v: string): v is Operation {
  return (OPERATIONS as readonly string[]).includes(v);
}

/** How each operation reads to a person, for "what cosigno understood". */
export const OPERATION_LABEL: Record<Operation, string> = {
  read: "Read",
  draft: "Draft",
  send: "Send",
  post: "Post",
  publish: "Publish",
  create: "Create",
  update: "Update",
  archive: "Archive",
  move: "Move",
  rename: "Rename",
  close: "Close",
  merge: "Merge",
  cancel: "Cancel",
  delete: "Delete",
  refund: "Refund",
  payment: "Send payment",
  deploy: "Deploy",
  webhook: "Call a webhook",
};

/* ------------------------------------------------------------- providers -- */

/** Concrete connectable systems, plus the two non-provider sources. */
export const PROVIDERS = [
  "gmail",
  "outlook",
  "slack",
  "notion",
  "github",
  "google-drive",
  "google-calendar",
  "dropbox",
  "stripe",
  /** A user-added API tool or MCP server. */
  "custom",
  /** Work cosigno did itself, not through a connected app. */
  "internal",
] as const;

export type Provider = (typeof PROVIDERS)[number];

export function isProvider(v: string): v is Provider {
  return (PROVIDERS as readonly string[]).includes(v);
}

export const PROVIDER_LABEL: Record<Provider, string> = {
  gmail: "Gmail",
  outlook: "Outlook",
  slack: "Slack",
  notion: "Notion",
  github: "GitHub",
  "google-drive": "Google Drive",
  "google-calendar": "Google Calendar",
  dropbox: "Dropbox",
  stripe: "Stripe",
  custom: "your custom tools",
  internal: "cosigno's own work",
};

/**
 * The families a rule may name. "email" has to mean Gmail AND Outlook, or a
 * rule protects only whichever one the person happened to think of.
 *
 * Every concrete provider is also a scope of itself (added below), so
 * "never post to Slack" and "always ask before sending email" are expressed in
 * exactly the same way.
 */
const FAMILIES: Record<string, Provider[]> = {
  email: ["gmail", "outlook"],
  files: ["google-drive", "dropbox"],
  calendar: ["google-calendar"],
  chat: ["slack"],
  docs: ["notion"],
  code: ["github"],
  payment: ["stripe"],
};

/** scope token → the providers it covers. "any" is handled by the caller. */
export const SCOPES: Record<string, Provider[]> = {
  ...FAMILIES,
  ...Object.fromEntries(PROVIDERS.map((p) => [p, [p]])),
};

/** How a scope reads to a person. */
export function scopeLabel(scope: string): string {
  if (scope === "any") return "Everything cosigno can do";
  const family = FAMILIES[scope];
  if (family) return family.map((p) => PROVIDER_LABEL[p]).join(" and ");
  return PROVIDER_LABEL[scope as Provider] ?? scope;
}

/* ---------------------------------------------------- normalized actions -- */

export interface NormalizedAction {
  provider: Provider;
  operation: Operation;
}

/**
 * Connector action id → operation, per provider. Exhaustive over every action
 * the built-in providers expose.
 *
 * This table is the reason a rule can be precise. `search_messages` is a read
 * and `send_message` is a send, stated once, here — not inferred from the two
 * sentences describing them, which share most of their words.
 */
export const PROVIDER_ACTION_OPERATION: Record<string, Record<string, Operation>> = {
  // Keyed by the REGISTRY key, so the table can be checked against the live
  // provider list rather than a parallel spelling of it. Gmail's registry key
  // is "google" for historical reasons; `normalizeProviderKey` maps it on.
  google: {
    search_messages: "read",
    read_message: "read",
    create_draft: "draft",
    send_message: "send",
    archive: "archive",
    label: "update",
    mark_read: "update",
    trash: "delete",
  },
  outlook: {
    search_messages: "read",
    read_message: "read",
    create_draft: "draft",
    send_message: "send",
    mark_read: "update",
    trash: "delete",
  },
  github: {
    whoami: "read",
    list_repos: "read",
    list_issues: "read",
    create_issue: "create",
  },
  "google-calendar": {
    list_events: "read",
    find_free_slots: "read",
    create_event: "create",
    delete_event: "delete",
  },
  "google-drive": {
    list_files: "read",
    create_text_file: "create",
    update_text_file: "update",
    trash_file: "delete",
  },
  slack: {
    list_channels: "read",
    post_message: "post",
  },
  notion: {
    search_pages: "read",
    create_page: "create",
    append_note: "update",
  },
};

/**
 * A custom API tool or MCP server names its own actions, so there is no table
 * for them. They still declare a risk class, which IS a normalized statement
 * about what the action does — so it is used directly rather than reading the
 * action's name. Unknown risk resolves to the strictest reading.
 */
export function operationForRisk(risk: "read" | "write" | "destructive" | undefined): Operation {
  if (risk === "read") return "read";
  if (risk === "destructive") return "delete";
  return "update";
}

/**
 * The server's resolved tier is its own authoritative reading of how dangerous
 * an action is (read→1, write→2, destructive→3), so it recovers the risk class
 * when a connector did not declare one. Used only for tools with no table
 * entry; a built-in provider action never reaches this.
 */
export function riskForTier(tier: number | undefined): "read" | "write" | "destructive" | undefined {
  if (tier === 1) return "read";
  if (tier === 2) return "write";
  if (tier === 3) return "destructive";
  return undefined;
}

/** Cosigno's own action categories → the same closed operation set. */
const CATEGORY_OPERATION: Record<ActionCategory, Operation> = {
  search: "read",
  summarize: "read",
  draft: "draft",
  send_email: "send",
  post_content: "post",
  update_record: "update",
  spend: "payment",
  webhook: "webhook",
  delete: "delete",
  refund: "refund",
  payment: "payment",
  connection_call: "update",
};

/**
 * Which system a category acts on, when the category itself implies one.
 * `send_email` is email wherever it runs; `search` could be anything, so it
 * stays unattributed rather than being guessed into a provider.
 */
const CATEGORY_PROVIDER: Partial<Record<ActionCategory, Provider>> = {
  send_email: "gmail",
  refund: "stripe",
  payment: "stripe",
  spend: "stripe",
};

/**
 * Normalize one of cosigno's own actions. `providerKey`/`actionId` are passed
 * when the action came from a connector, in which case the provider table wins
 * — it is more specific than the category.
 */
export function normalizeAction(input: {
  category?: ActionCategory | string;
  providerKey?: string;
  actionId?: string;
  risk?: "read" | "write" | "destructive";
  /** The server's resolved approval tier, when the caller knows it. */
  tier?: number;
}): NormalizedAction {
  const provider = resolveProvider(input.providerKey, input.category);
  /**
   * A user-added tool names its own actions, and reading those names is the
   * guessing this module exists to remove. So it is classified by what it
   * DECLARED — its risk class, or the tier the server resolved from it —
   * which is coarser (read / update / delete) but never wrong.
   */
  const declared = () => operationForRisk(input.risk ?? riskForTier(input.tier));

  if (input.providerKey && input.actionId) {
    // The table is keyed by registry key; try that first, then the alias, so
    // both "google" (what the registry calls Gmail) and "gmail" resolve.
    const raw = input.providerKey.trim().toLowerCase();
    const table =
      PROVIDER_ACTION_OPERATION[raw] ?? PROVIDER_ACTION_OPERATION[normalizeProviderKey(raw)];
    const mapped = table?.[input.actionId];
    if (mapped) return { provider, operation: mapped };
    return { provider, operation: declared() };
  }

  const category = input.category as ActionCategory | undefined;
  const operation = (category && CATEGORY_OPERATION[category]) ?? declared();
  return { provider, operation };
}

/** Provider keys arrive in a few spellings across the codebase. */
export function normalizeProviderKey(key: string): string {
  const k = key.trim().toLowerCase();
  const ALIAS: Record<string, string> = {
    google: "gmail",
    googlecalendar: "google-calendar",
    google_calendar: "google-calendar",
    googledrive: "google-drive",
    google_drive: "google-drive",
    drive: "google-drive",
    calendar: "google-calendar",
    mcp: "custom",
  };
  return ALIAS[k] ?? k;
}

function resolveProvider(providerKey?: string, category?: ActionCategory | string): Provider {
  if (providerKey) {
    const k = normalizeProviderKey(providerKey);
    if (isProvider(k)) return k;
    return "custom";
  }
  const fromCategory = CATEGORY_PROVIDER[category as ActionCategory];
  return fromCategory ?? "internal";
}

/* ------------------------------------------------------------- matching --- */

/** Does a rule's scope token cover this action's provider? */
export function scopeCovers(scope: string, provider: Provider): boolean {
  if (scope === "any") return true;
  const covered = SCOPES[scope];
  if (!covered) return false;
  return covered.includes(provider);
}

/**
 * Does a rule's operation govern this action's operation?
 *
 * Exact identity, or "any". There is deliberately no hierarchy — "update" does
 * not imply "delete", "send" does not imply "post". Every widening has to be
 * written down in the rule itself, where the person can see it.
 */
export function operationCovers(ruleVerb: string, operation: Operation): boolean {
  return ruleVerb === "any" || ruleVerb === operation;
}
