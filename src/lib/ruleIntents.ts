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
 * action's name. A declared read stays a read and a declared destructive
 * action is a delete; everything else — including an undeclared risk — is
 * treated as an update.
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

/**
 * A connector key or display name → the normalized provider it names, or null
 * when it names nothing this vocabulary knows.
 *
 * Distinct from resolveProvider, which falls back to "custom" because an
 * ACTION always has to resolve to something. A caller asking "which provider
 * is this?" for display needs to be told "none of them" rather than handed a
 * bucket that a `custom`-scoped rule would then appear to match.
 */
export function providerForKey(key: string | undefined): Provider | null {
  if (!key) return null;
  const k = normalizeProviderKey(key);
  return isProvider(k) ? k : null;
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

/* ----------------------------------------------------------- reachability - */

/**
 * Provider → the key its connector is registered under, when one exists at
 * all. A provider absent from this map is one cosigno can name but cannot
 * currently act through: a rule about it is valid and stored, and it protects
 * nothing today. The product has to say that rather than let the rule sit
 * there looking like a guard.
 */
export const PROVIDER_REGISTRY_KEY: Partial<Record<Provider, string>> = {
  gmail: "google",
  outlook: "outlook",
  slack: "slack",
  notion: "notion",
  github: "github",
  "google-drive": "google-drive",
  "google-calendar": "google-calendar",
};

/**
 * Systems a person can name in a rule that cosigno has NO connector for.
 *
 * Derived from the tables above rather than listed by hand, so it cannot
 * drift: the day a Stripe connector is registered, it stops being reported as
 * unavailable everywhere at once. The connections screen shows this list
 * explicitly — omitting it would be the quiet kind of dishonesty, where a
 * person assumes anything not mentioned must be handled.
 */
export function providersWithoutConnector(): { provider: Provider; label: string }[] {
  return PROVIDERS.filter(
    (p) => p !== "custom" && p !== "internal" && !PROVIDER_REGISTRY_KEY[p]
  ).map((provider) => ({ provider, label: PROVIDER_LABEL[provider] }));
}

/**
 * Every normalized action cosigno can perform WITHOUT a connector — its own
 * categories, resolved through the same normalizer everything else uses so
 * there is no second opinion about what a category means.
 */
const OWN_WORK_ACTIONS: NormalizedAction[] = (
  Object.keys(CATEGORY_OPERATION) as ActionCategory[]
).map((category) => normalizeAction({ category }));

export interface RuleCoverage {
  /** Providers with a real capability this rule would govern. */
  covered: { provider: Provider; label: string; capabilities: number }[];
  /**
   * Providers the rule names that cosigno has no connector for at all. Named
   * so the UI can say which ones, rather than a vague "some tools".
   */
  noConnector: { provider: Provider; label: string }[];
  /**
   * Providers with a connector that simply has no capability of this
   * operation — e.g. GitHub cannot delete, so a delete rule about GitHub
   * cannot fire even though GitHub is fully supported.
   */
  noSuchCapability: { provider: Provider; label: string }[];
  /** True when cosigno's own (connector-free) work can trigger this rule. */
  viaOwnWork: boolean;
  /** True when nothing, anywhere, can trigger this rule today. */
  unreachable: boolean;
}

/**
 * What can this rule actually govern right now?
 *
 * A rule that no capability can trigger is not protection, however correct it
 * is. Answering this honestly is the difference between "you are covered" and
 * "you will be covered if we ever build it".
 */
export function coverageFor(scope: string, operation: string): RuleCoverage {
  const providers: Provider[] =
    scope === "any" ? [...PROVIDERS] : (SCOPES[scope] ?? []);

  const covered: RuleCoverage["covered"] = [];
  const noConnector: RuleCoverage["noConnector"] = [];
  const noSuchCapability: RuleCoverage["noSuchCapability"] = [];

  for (const provider of providers) {
    if (provider === "internal" || provider === "custom") continue;
    const registryKey = PROVIDER_REGISTRY_KEY[provider];
    if (!registryKey) {
      noConnector.push({ provider, label: PROVIDER_LABEL[provider] });
      continue;
    }
    const table = PROVIDER_ACTION_OPERATION[registryKey] ?? {};
    const capabilities = Object.values(table).filter(
      (op) => operation === "any" || op === operation
    ).length;
    if (capabilities > 0) {
      covered.push({ provider, label: PROVIDER_LABEL[provider], capabilities });
    } else {
      noSuchCapability.push({ provider, label: PROVIDER_LABEL[provider] });
    }
  }

  // Judged with the SAME two predicates enforcement uses, so "can this rule
  // ever fire" and "does this rule fire" can never disagree.
  const viaOwnWork = OWN_WORK_ACTIONS.some(
    (a) => scopeCovers(scope, a.provider) && operationCovers(operation, a.operation)
  );

  return {
    covered,
    noConnector,
    noSuchCapability,
    viaOwnWork,
    unreachable: covered.length === 0 && !viaOwnWork,
  };
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
