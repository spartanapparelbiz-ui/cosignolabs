/**
 * Canonical objects — the one vocabulary every connector is translated into.
 *
 * A connector speaks its own dialect: Stripe says `customer`, Salesforce says
 * `account`, an internal CRM says `cust`. The Workspace Model normalizes all of
 * them onto ONE object type so the graph can link them, the query language can
 * find them, and the permission model can govern them identically.
 *
 * Two rules hold everywhere in this file:
 *   1. Mapping is DETERMINISTIC — no model call. The same resource name always
 *      normalizes to the same canonical type, so a plan is replayable and a
 *      permission is explainable.
 *   2. Unrecognized is not invented. A resource we can't classify becomes a
 *      `generic` object that keeps its original name, rather than being forced
 *      into a domain it doesn't belong to.
 */

import type { Mutation } from "@/lib/twin/model";

export type CanonicalDomain =
  | "finance"
  | "crm"
  | "code"
  | "comms"
  | "storage"
  | "productivity"
  | "identity"
  | "generic";

export interface CanonicalType {
  /** Stable canonical id, e.g. "customer". */
  type: string;
  label: string;
  domain: CanonicalDomain;
}

/**
 * Resource-name patterns → canonical type. Ordered: the FIRST match wins, so
 * more specific patterns must come first (`payment_method` before `payment`).
 */
const PATTERNS: { re: RegExp; type: string; label: string; domain: CanonicalDomain }[] = [
  // finance
  { re: /payment_?method|card|bank_?account/, type: "payment_method", label: "Payment method", domain: "finance" },
  { re: /refund/, type: "refund", label: "Refund", domain: "finance" },
  { re: /invoice|bill/, type: "invoice", label: "Invoice", domain: "finance" },
  { re: /subscription|plan_?item/, type: "subscription", label: "Subscription", domain: "finance" },
  { re: /price|pricing/, type: "price", label: "Price", domain: "finance" },
  { re: /product|sku|item_?catalog/, type: "product", label: "Product", domain: "finance" },
  { re: /balance|payout|transfer|ledger/, type: "balance", label: "Balance", domain: "finance" },
  { re: /charge|payment|transaction/, type: "payment", label: "Payment", domain: "finance" },
  // crm
  { re: /customer|cust\b|client/, type: "customer", label: "Customer", domain: "crm" },
  { re: /account|acct|org(anization)?_?record/, type: "account", label: "Account", domain: "crm" },
  { re: /contact|person/, type: "contact", label: "Contact", domain: "crm" },
  { re: /lead/, type: "lead", label: "Lead", domain: "crm" },
  { re: /opportunity|deal/, type: "opportunity", label: "Opportunity", domain: "crm" },
  { re: /campaign/, type: "campaign", label: "Campaign", domain: "crm" },
  { re: /case|ticket|support/, type: "ticket", label: "Support ticket", domain: "crm" },
  // code
  { re: /pull_?request|merge_?request/, type: "pull_request", label: "Pull request", domain: "code" },
  { re: /repositor|repo\b/, type: "repository", label: "Repository", domain: "code" },
  { re: /branch|ref\b/, type: "branch", label: "Branch", domain: "code" },
  { re: /commit/, type: "commit", label: "Commit", domain: "code" },
  { re: /workflow|action_?run|pipeline|job/, type: "workflow", label: "Workflow", domain: "code" },
  { re: /deployment|release/, type: "deployment", label: "Deployment", domain: "code" },
  { re: /issue/, type: "issue", label: "Issue", domain: "code" },
  // identity / access
  { re: /secret|credential|api_?key|token/, type: "secret", label: "Secret", domain: "identity" },
  { re: /permission|role|scope|grant/, type: "permission", label: "Permission", domain: "identity" },
  { re: /user|member|contributor|collaborator|team/, type: "user", label: "User", domain: "identity" },
  // comms
  { re: /message|mail|email|thread|chat/, type: "message", label: "Message", domain: "comms" },
  { re: /channel|conversation/, type: "channel", label: "Channel", domain: "comms" },
  { re: /notification|alert/, type: "notification", label: "Notification", domain: "comms" },
  // storage / productivity
  { re: /file|document|attachment|blob|object_?store/, type: "file", label: "File", domain: "storage" },
  { re: /folder|directory|bucket/, type: "folder", label: "Folder", domain: "storage" },
  { re: /database|table|row|record_?set|collection/, type: "table", label: "Table", domain: "storage" },
  { re: /page|note|doc\b/, type: "page", label: "Page", domain: "productivity" },
  { re: /event|calendar|meeting/, type: "event", label: "Calendar event", domain: "productivity" },
  { re: /task|todo/, type: "task", label: "Task", domain: "productivity" },
];

/** Title-case a snake/kebab resource name for display. */
function titleize(name: string): string {
  const words = name.replace(/[_-]+/g, " ").trim();
  return words.charAt(0).toUpperCase() + words.slice(1);
}

/**
 * Normalize a connector's resource name onto a canonical type. An unmatched
 * name keeps its own identity in the `generic` domain — the model would rather
 * say "I don't know what this is" than file it under the wrong one.
 */
export function canonicalize(resource: string): CanonicalType {
  // A trailing `_id` names the same object as the object itself ("acct_id" is
  // an account), so it is normalized away before matching.
  const key = resource.toLowerCase().replace(/[\s-]+/g, "_").replace(/_id$/, "");
  for (const p of PATTERNS) {
    if (p.re.test(key)) return { type: p.type, label: p.label, domain: p.domain };
  }
  return { type: key, label: titleize(key), domain: "generic" };
}

/* -------------------------------------------------------------------------- */
/* schema mapper                                                               */
/* -------------------------------------------------------------------------- */

/**
 * Canonical field → the external names known to mean it. Used by the schema
 * mapper so `cust_name`, `customerName`, and `name` all land on one field.
 */
const FIELD_ALIASES: Record<string, string[]> = {
  id: ["id", "uid", "uuid", "identifier", "object_id", "external_id", "key"],
  name: ["name", "title", "display_name", "full_name", "label", "cust_name", "customer_name"],
  email: ["email", "email_address", "mail", "contact_email"],
  account_id: ["account_id", "acct_id", "account", "acct", "org_id", "owner_id", "customer_id", "cust_id"],
  amount_cents: ["amount_cents", "amount", "total", "invoice_total", "value", "price", "subtotal"],
  currency: ["currency", "curr", "iso_currency", "currency_code"],
  status: ["status", "state", "stage", "phase"],
  created_at: ["created_at", "created", "create_time", "created_on", "date_created", "inserted_at"],
  updated_at: ["updated_at", "updated", "modified", "last_modified", "update_time"],
  description: ["description", "body", "summary", "notes", "detail", "text"],
  url: ["url", "link", "href", "permalink", "web_url"],
};

/** Canonical field names, exposed so the connector builder can offer them. */
export const CANONICAL_FIELDS = Object.keys(FIELD_ALIASES);

const ALIAS_TO_FIELD = new Map<string, string>();
for (const [field, aliases] of Object.entries(FIELD_ALIASES)) {
  for (const a of aliases) ALIAS_TO_FIELD.set(a, field);
}

export interface FieldMapping {
  /** The name the external system used. */
  external: string;
  /** The canonical field it maps to, or null when nothing matched. */
  canonical: string | null;
}

export interface SchemaMapping {
  mappings: FieldMapping[];
  /** External fields that could not be classified — surfaced, never dropped. */
  unmapped: string[];
}

function normalizeKey(k: string): string {
  return k
    .replace(/([a-z0-9])([A-Z])/g, "$1_$2")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

/**
 * Map an external object's field names onto canonical fields. Unknown fields
 * are reported as unmapped rather than guessed at: a wrong mapping silently
 * corrupts every downstream plan, whereas an unmapped field is merely a
 * question the user can answer in the connector builder.
 */
export function mapSchema(externalFields: string[]): SchemaMapping {
  const mappings: FieldMapping[] = externalFields.map((external) => ({
    external,
    canonical: ALIAS_TO_FIELD.get(normalizeKey(external)) ?? null,
  }));
  return { mappings, unmapped: mappings.filter((m) => !m.canonical).map((m) => m.external) };
}

/** Apply a mapping to a record, returning the canonical projection. */
export function applyMapping(
  record: Record<string, unknown>,
  mapping: SchemaMapping
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const m of mapping.mappings) {
    if (m.canonical && record[m.external] !== undefined) out[m.canonical] = record[m.external];
  }
  return out;
}

/* -------------------------------------------------------------------------- */
/* permission mapping                                                          */
/* -------------------------------------------------------------------------- */

/**
 * Every connector's own permission vocabulary collapses into ONE cosigno
 * permission string: `Domain.Object.Verb` (with a few named finance
 * permissions the product already speaks, like `Finance.Refund`).
 *
 * This is what makes "which AI can modify production databases?" answerable
 * across seven vendors at once — the question is asked in one vocabulary.
 */
const DOMAIN_LABEL: Record<CanonicalDomain, string> = {
  finance: "Finance",
  crm: "CRM",
  code: "Repository",
  comms: "Comms",
  storage: "Storage",
  productivity: "Workspace",
  identity: "Identity",
  generic: "Connector",
};

const VERB: Record<Mutation, "Read" | "Write" | "Delete"> = {
  read: "Read",
  create: "Write",
  update: "Write",
  delete: "Delete",
};

function pascal(s: string): string {
  return s
    .split(/[_\s-]+/)
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join("");
}

/**
 * The cosigno permission a canonical object + mutation requires. Money is
 * special-cased to the names the product already uses for it, so a refund
 * mapped from Stripe and a refund mapped from a homegrown billing API demand
 * the exact same grant.
 */
export function permissionFor(canonical: CanonicalType, mutation: Mutation): string {
  if (canonical.type === "refund" && mutation !== "read") return "Finance.Refund";
  if (canonical.type === "payment" && mutation !== "read") return "Finance.Payment";
  if (canonical.type === "secret" && mutation !== "read") return "Identity.Secret.Write";
  return `${DOMAIN_LABEL[canonical.domain]}.${pascal(canonical.type)}.${VERB[mutation]}`;
}

/**
 * Translate an EXTERNAL permission name (a GitHub role, a Salesforce profile
 * permission, a Stripe capability) into the cosigno permission model.
 * Unrecognized names are returned under the connector's own namespace and
 * flagged, so an unmapped grant is visible rather than silently ignored.
 */
export interface MappedPermission {
  external: string;
  cosigno: string;
  /** False when we fell back to a namespaced passthrough. */
  recognized: boolean;
}

const EXTERNAL_PERMISSIONS: { re: RegExp; cosigno: string }[] = [
  { re: /^admin$|repo(sitory)?[_ .]?admin|full[_ ]control/i, cosigno: "Repository.Write" },
  { re: /repo(sitory)?[_ .]?write|push|maintain/i, cosigno: "Repository.Write" },
  { re: /repo(sitory)?[_ .]?read|pull\b/i, cosigno: "Repository.Read" },
  { re: /modify[_ ]?(all[_ ])?account/i, cosigno: "CRM.Account.Write" },
  { re: /view[_ ]?(all[_ ])?(account|record)/i, cosigno: "CRM.Account.Read" },
  { re: /refund/i, cosigno: "Finance.Refund" },
  { re: /charge|payment[_ ]?write/i, cosigno: "Finance.Payment" },
  { re: /invoice[_ ]?write/i, cosigno: "Finance.Invoice.Write" },
  { re: /mail\.send|send[_ ]?mail|gmail\.send/i, cosigno: "Comms.Message.Write" },
  { re: /mail\.read|gmail\.readonly|imap/i, cosigno: "Comms.Message.Read" },
  { re: /files?\.(write|readwrite)|drive\.file/i, cosigno: "Storage.File.Write" },
  { re: /files?\.read|drive\.readonly/i, cosigno: "Storage.File.Read" },
  { re: /secret|credential/i, cosigno: "Identity.Secret.Write" },
];

export function mapExternalPermission(connectorKey: string, external: string): MappedPermission {
  for (const p of EXTERNAL_PERMISSIONS) {
    if (p.re.test(external)) return { external, cosigno: p.cosigno, recognized: true };
  }
  return {
    external,
    cosigno: `Connector.${pascal(connectorKey)}.${pascal(external).slice(0, 40)}`,
    recognized: false,
  };
}

/* -------------------------------------------------------------------------- */
/* action mapping                                                              */
/* -------------------------------------------------------------------------- */

