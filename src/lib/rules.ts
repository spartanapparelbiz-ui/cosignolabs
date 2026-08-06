import type {
  PermissionRuleRecord,
  RuleCondition,
  RuleRequirement,
  Tier,
} from "./types";

/**
 * Custom permission rules — a user's plain-language policy over what cosigno
 * may do across their tools, turned into VISIBLE, EDITABLE structured
 * constraints, and enforced at the one connector Boundary door.
 *
 * The hard guarantee: a rule can only ever make an action MORE restrictive
 * (raise its approval level, or forbid it entirely). It can never lower a
 * boundary — a rule that says "auto" leaves the server's floor untouched. So
 * feeding user text through this parser can never weaken a guarantee, only
 * strengthen it. Parsing is deterministic (no model): the same sentence always
 * yields the same structured rule, offline.
 */

/** The parsed shape (everything on a rule except the DB/ownership fields). */
export type ParsedRule = Pick<
  PermissionRuleRecord,
  "target" | "verb" | "condition" | "requirement" | "confidence"
>;

/** How strict each requirement is — higher wins when several rules match. */
const REQUIREMENT_RANK: Record<RuleRequirement, number> = {
  auto: 0,
  approve: 1,
  sign: 2,
  never: 3,
};

/**
 * Integration / category keywords → a normalized target token. Matching is
 * loose on purpose (an email rule should also govern a Gmail connection), so
 * the token is compared with `contains` at enforcement time.
 */
const TARGET_KEYWORDS: [RegExp, string][] = [
  [/\bgmail\b/, "gmail"],
  [/\boutlook\b/, "outlook"],
  [/\b(e-?mails?|inbox)\b/, "email"],
  [/\bslack\b/, "slack"],
  [/\bgithub\b/, "github"],
  [/\b(stripe|payments?|invoices?|refunds?|charges?|billing)\b/, "payment"],
  [/\b(calendar|meetings?|events?)\b/, "calendar"],
  [/\b(drive|dropbox|files?|folders?|documents?|docs?)\b/, "files"],
  [/\bnotion\b/, "notion"],
  [/\bhubspot\b/, "hubspot"],
  [/\bsalesforce\b/, "salesforce"],
  [/\blinear\b/, "linear"],
  [/\b(jira|asana|trello|clickup)\b/, "project"],
  [/\bshopify\b/, "shopify"],
  [/\b(quickbooks|xero)\b/, "accounting"],
  [/\b(crm|erp|internal|proprietary|private api|our api)\b/, "internal"],
];

/**
 * Action verbs cosigno might take — the primary one governs the rule. Patterns
 * tolerate common inflections (post/posts/posting/posted, move/moved…) so a
 * rule reads naturally in past or present tense.
 */
const VERB_KEYWORDS: [RegExp, string][] = [
  [/\brefund(s|ed|ing)?\b/, "refund"],
  [/\b(pay|pays|paid|paying|payments?|charges?|charged|wire[sd]?|transfers?|transferred)\b/, "payment"],
  [/\bpost(s|ed|ing)?\b/, "post"],
  [/\b(send|sends|sending|sent)\b/, "send"],
  [/\bdraft(s|ed|ing)?\b/, "draft"],
  [/\b(delete[sd]?|deleting|remove[sd]?|removing|destroy(s|ed|ing)?)\b/, "delete"],
  [/\bclos(e|es|ed|ing)\b/, "close"],
  [/\bmerg(e|es|ed|ing)\b/, "merge"],
  [/\bmov(e|es|ed|ing)\b/, "move"],
  [/\barchiv(e|es|ed|ing)\b/, "archive"],
  [/\bdeploy(s|ed|ing|ment)?\b/, "deploy"],
  [/\bcancel(s|ed|led|ing|ling)?\b/, "cancel"],
  [/\b(create[sd]?|creating|add|adds|added|adding)\b/, "create"],
  [/\b(update[sd]?|updating|edit(s|ed|ing)?|change[sd]?|changing)\b/, "update"],
];

/** Detect the requirement level from the sentence, most-specific first. */
function detectRequirement(t: string): { requirement: RuleRequirement; explicit: boolean } {
  const withoutSign = /\b(without|unless|before)\b[^.]*\b(sign|signature|signed|signing|sign[-\s]?off)\b/;
  const withoutApprove = /\b(without|unless|before)\b[^.]*\b(approv|ask|permission|ok|okay|confirm)/;
  const requiresSign = /\b(requires?|needs?|must have)\b[^.]*\b(sign|signature|signing)\b/;
  const signRequired = /\b(sign|signature)\b[^.]*\b(required|needed)\b/;
  const requiresApprove = /\b(requires?|needs?|must have)\b[^.]*\b(approv|permission)/;
  const forbid =
    /\b(never|cannot|can'?t|not allowed|forbidden|forbid|do not|don'?t|must not|block(ed|s)?|prevent|prohibit(ed|s)?|banned?|disallow(ed|s)?|off[-\s]?limits?|barred|deny|denied|refuse[sd]?)\b/;
  const auto = /\b(automatic(ally)?|without asking|on its own|by itself|no approval needed)\b/;

  if (withoutSign.test(t) || requiresSign.test(t) || signRequired.test(t)) {
    return { requirement: "sign", explicit: true };
  }
  if (withoutApprove.test(t) || requiresApprove.test(t)) {
    return { requirement: "approve", explicit: true };
  }
  // Bare "never / cannot / not allowed" with no softening clause = forbid.
  if (forbid.test(t)) return { requirement: "never", explicit: true };
  if (auto.test(t)) return { requirement: "auto", explicit: true };
  // No signal at all → require approval by default (the safe, non-silent bar).
  return { requirement: "approve", explicit: false };
}

function firstMatch(pairs: [RegExp, string][], t: string): string | null {
  for (const [re, token] of pairs) if (re.test(t)) return token;
  return null;
}

/** Comparator modifiers that qualify a threshold, and the op each implies. */
const AMOUNT_MODIFIER =
  /\b(more than|over|above|greater than|exceeds?|at least|under|below|less than|no more than|up to|at most)\b/;

function detectCondition(t: string): RuleCondition {
  // Extract the amount ANCHORED to a "$" / "dollars" / the modifier phrase —
  // never the first stray number in the sentence (an invoice/order id). Try, in
  // order: a $-prefixed number, a number followed by "dollars/usd", then a
  // number right after a comparator word.
  const amount =
    t.match(/\$\s?([\d][\d,]*(?:\.\d+)?)/) ??
    t.match(/([\d][\d,]*(?:\.\d+)?)\s*(?:dollars|usd|bucks)\b/) ??
    t.match(
      /\b(?:more than|over|above|greater than|exceeds?|at least|under|below|less than|no more than|up to|at most)\s+\$?\s?([\d][\d,]*(?:\.\d+)?)/
    );
  if (amount && AMOUNT_MODIFIER.test(t)) {
    const value = Number(amount[1].replace(/,/g, ""));
    if (Number.isFinite(value)) {
      let op: RuleCondition["op"] = ">";
      if (/\bat least\b/.test(t)) op = ">=";
      else if (/\b(no more than|up to|at most)\b/.test(t)) op = "<=";
      else if (/\b(under|below|less than)\b/.test(t)) op = "<";
      else op = ">"; // more than / over / above / greater than / exceeds
      return { kind: "amount", op, value };
    }
  }
  // Channel: "#announcements".
  const channel = t.match(/#([a-z0-9_-]+)/i);
  if (channel) return { kind: "channel", match: `#${channel[1]}` };
  // Label: "label X" / 'the "X" label'.
  const label = t.match(/\blabel(?:led|ed)?\s+["']?([a-z0-9 _-]{1,40}?)["']?(?:\s|$|\.)/i);
  if (label) return { kind: "label", match: label[1].trim() };
  return { kind: "none" };
}

/**
 * Parse one plain-language rule into a structured constraint. Deterministic —
 * no model call. `confidence` is "low" when nothing beyond the default could be
 * extracted, so the UI can flag it for the user to sharpen.
 */
export function parsePermissionRule(text: string): ParsedRule {
  const t = ` ${text.toLowerCase().trim()} `;
  const target = firstMatch(TARGET_KEYWORDS, t) ?? "any";
  const verb = firstMatch(VERB_KEYWORDS, t) ?? "any";
  const condition = detectCondition(t);
  const { requirement, explicit } = detectRequirement(t);

  // High confidence when we pinned any real structure; low when it all fell to
  // defaults (couldn't tell what tool/action/level the user meant).
  const gotStructure =
    explicit || target !== "any" || verb !== "any" || condition.kind !== "none";
  return {
    target,
    verb,
    condition,
    requirement,
    confidence: gotStructure ? "high" : "low",
  };
}

/** A one-line, plain-English rendering of a structured rule for the UI/audit. */
export function describeRule(r: ParsedRule): string {
  const scope =
    r.target === "any" && r.verb === "any"
      ? "any action"
      : `${r.verb === "any" ? "any" : r.verb} action${r.target === "any" ? "" : ` on ${r.target}`}`;
  let cond = "";
  if (r.condition.kind === "amount") cond = ` over $${r.condition.value}`.replace("over", r.condition.op === "<" ? "under" : "over");
  else if (r.condition.kind === "channel") cond = ` in ${r.condition.match}`;
  else if (r.condition.kind === "label") cond = ` labelled "${r.condition.match}"`;
  const need: Record<RuleRequirement, string> = {
    auto: "runs automatically",
    approve: "waits for your approval",
    sign: "requires your signature",
    never: "is never allowed",
  };
  return `${scope}${cond} — ${need[r.requirement]}.`;
}

/* ----------------------------------------------------- enforcement (tighten) */

/** The context an action carries when rules are checked at the Boundary door. */
export interface RuleContext {
  /** Connection provider key or kind (e.g. "stripe", "custom", "slack"). */
  target: string;
  /** A category the action falls under (e.g. "payment"), if known. */
  category?: string;
  /** Free text (the action summary) used for loose verb matching. */
  summary?: string;
  /** Amount involved, if the action's args carry one. */
  amount?: number;
  /** Channel involved (e.g. "#announcements"), if the args carry one. */
  channel?: string;
}

/**
 * A target token expands to related words so a rule about "payment" fires on a
 * Stripe connection whose action reads "issue refund", etc. Matching stays
 * loose but never matches "any" implicitly.
 */
const TARGET_SYNONYMS: Record<string, string[]> = {
  payment: ["payment", "refund", "pay", "charge", "invoice", "billing", "stripe", "transfer", "wire", "quickbooks", "xero"],
  // "send" was here and did not belong: a target names WHAT a rule governs,
  // not what is being done to it. It made every action whose summary contained
  // the word "send" look like an email action.
  email: ["email", "gmail", "outlook", "mail", "inbox"],
  gmail: ["gmail", "email", "mail", "inbox"],
  outlook: ["outlook", "email", "mail"],
  slack: ["slack", "channel", "message", "post"],
  github: ["github", "issue", "pull request", "pr", "repo", "commit"],
  calendar: ["calendar", "event", "meeting", "schedule"],
  files: ["file", "drive", "dropbox", "folder", "document", "doc"],
  notion: ["notion", "page"],
  hubspot: ["hubspot", "contact", "crm", "lead"],
  salesforce: ["salesforce", "crm", "lead", "opportunity"],
  linear: ["linear", "issue", "ticket"],
  project: ["jira", "asana", "trello", "clickup", "task", "ticket"],
  shopify: ["shopify", "order", "product", "cart"],
  accounting: ["quickbooks", "xero", "invoice", "ledger"],
  internal: ["internal", "crm", "erp", "custom", "private"],
};

/**
 * Match a synonym as a WORD — with its ordinary inflections, and nothing else.
 *
 * Plain `includes` made "senders" match "send", so a rule about SENDING email
 * fired on "scan your inbox for promotional senders", which only reads it. A
 * rule that stops the wrong things is worse than no rule at all: people stop
 * believing the ones that are right.
 *
 * The allowed endings are named explicitly rather than "any few letters",
 * because "any few letters" is what let "senders" through in the first place.
 * A needle ending in `e` also matches its e-dropped forms, so "delete" still
 * covers "deleting" and "deleted".
 */
const INFLECTIONS = "(?:s|es|d|ed|ing)?";

function containsWord(hay: string, needle: string): boolean {
  const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const forms = [`${esc(needle)}${INFLECTIONS}`];
  if (needle.endsWith("e")) forms.push(`${esc(needle.slice(0, -1))}(?:ing|ed)`);
  return new RegExp(`\\b(?:${forms.join("|")})\\b`).test(hay);
}

function targetMatches(rule: PermissionRuleRecord, ctx: RuleContext): boolean {
  if (rule.target === "any") return true;
  const hay = `${ctx.target} ${ctx.category ?? ""} ${ctx.summary ?? ""}`.toLowerCase();
  const needles = TARGET_SYNONYMS[rule.target] ?? [rule.target];
  return needles.some((n) => containsWord(hay, n));
}

/**
 * A canonical verb token expands back to its synonyms so a rule about
 * "payment" (which the parser collapses pay/charge/wire/transfer into) also
 * matches an action summarized "create transfer" or "issue charge". Without
 * this reverse expansion a block/approval rule silently fails to fire on any
 * action worded with a synonym rather than the canonical word.
 */
const VERB_SYNONYMS: Record<string, string[]> = {
  refund: ["refund"],
  payment: ["payment", "pay", "charge", "wire", "transfer", "remit", "disburse", "invoice"],
  post: ["post", "publish", "announce", "message", "comment"],
  send: ["send", "sent", "email", "deliver", "dispatch", "mail"],
  draft: ["draft", "compose", "prepare"],
  delete: ["delete", "remove", "destroy", "purge", "erase", "drop", "wipe", "trash"],
  close: ["close", "resolve"],
  merge: ["merge"],
  move: ["move", "reschedule", "relocate"],
  archive: ["archive"],
  deploy: ["deploy", "release", "ship", "promote", "rollout"],
  cancel: ["cancel", "void", "revoke", "abort"],
  create: ["create", "add", "new", "open", "issue"],
  update: ["update", "edit", "change", "modify", "patch", "set"],
};

function verbMatches(rule: PermissionRuleRecord, ctx: RuleContext): boolean {
  if (rule.verb === "any") return true;
  const hay = `${ctx.summary ?? ""}`.toLowerCase();
  const needles = VERB_SYNONYMS[rule.verb] ?? [rule.verb];
  return needles.some((n) => containsWord(hay, n));
}

function conditionMatches(rule: PermissionRuleRecord, ctx: RuleContext): boolean {
  const c = rule.condition;
  if (c.kind === "none") return true;
  if (c.kind === "amount") {
    // Conservative + predictable: a value-conditioned rule only fires when the
    // action actually carries a comparable amount. It never blocks on unknowns.
    if (typeof ctx.amount !== "number" || typeof c.value !== "number") return false;
    switch (c.op) {
      case ">":
        return ctx.amount > c.value;
      case ">=":
        return ctx.amount >= c.value;
      case "<":
        return ctx.amount < c.value;
      case "<=":
        return ctx.amount <= c.value;
      default:
        return false;
    }
  }
  if (c.kind === "channel") {
    if (!ctx.channel || !c.match) return false;
    return ctx.channel.toLowerCase() === c.match.toLowerCase();
  }
  if (c.kind === "label") {
    if (!ctx.summary || !c.match) return false;
    return ctx.summary.toLowerCase().includes(c.match.toLowerCase());
  }
  return false;
}

export interface RuleDecision {
  /** The most restrictive requirement any matching enabled rule imposes. */
  requirement: RuleRequirement | null;
  /** The rule that set it (for the audit note), if any. */
  rule: PermissionRuleRecord | null;
}

/**
 * The single most restrictive requirement across all enabled, matching rules.
 * Returns `{requirement:null}` when no rule applies (behavior unchanged).
 */
export function applyRules(rules: PermissionRuleRecord[], ctx: RuleContext): RuleDecision {
  let best: RuleDecision = { requirement: null, rule: null };
  for (const rule of rules) {
    if (!rule.enabled) continue;
    if (!targetMatches(rule, ctx)) continue;
    if (!verbMatches(rule, ctx)) continue;
    if (!conditionMatches(rule, ctx)) continue;
    if (best.requirement === null || REQUIREMENT_RANK[rule.requirement] > REQUIREMENT_RANK[best.requirement]) {
      best = { requirement: rule.requirement, rule };
    }
  }
  return best;
}

/**
 * Fold a rule requirement into a base tier — ONLY EVER TIGHTENING. "never"
 * blocks the action; "sign"/"approve" raise the tier to at least 2 (which
 * requires a signature for outward actions); "auto" leaves the server floor
 * exactly as-is (it can never lower it). This is what makes rule enforcement
 * provably safe to run on arbitrary user text.
 */
export function applyRequirementToTier(
  baseTier: Tier,
  requirement: RuleRequirement | null
): { tier: Tier; blocked: boolean } {
  switch (requirement) {
    case "never":
      return { tier: baseTier, blocked: true };
    case "sign":
    case "approve":
      return { tier: (Math.max(baseTier, 2) as Tier), blocked: false };
    case "auto":
    case null:
    default:
      return { tier: baseTier, blocked: false };
  }
}
