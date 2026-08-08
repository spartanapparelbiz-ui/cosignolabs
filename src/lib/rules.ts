import { CATEGORIES } from "./types";
import type {
  ActionCategory,
  PermissionRuleRecord,
  RuleCondition,
  RuleRequirement,
  Tier,
} from "./types";
import {
  isOperation,
  providerForKey,
  normalizeAction,
  operationCovers,
  scopeCovers,
  scopeLabel,
  OPERATION_LABEL,
  SCOPES,
  type NormalizedAction,
  type Operation,
} from "./ruleIntents";

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

/**
 * Rules whose target begins with this prefix are CATEGORY rules: they name an
 * engine action category outright (`category:delete`) rather than a tool or a
 * word in a summary. The Trust Center writes them when someone chooses "never".
 *
 * They are deliberately invisible to the text matcher below — matching
 * "category:delete" against an action summary would be a coincidence, not an
 * enforcement. They are enforced at `proposeAction`, where the category is a
 * known fact rather than a guess, so a forbidden capability cannot be proposed
 * at all, from any code path.
 */
export const CATEGORY_TARGET_PREFIX = "category:";

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
 * Words that name a SCOPE — which system the rule governs. Each resolves to a
 * scope token from `SCOPES`, and from there to an explicit set of providers.
 * Nothing downstream re-reads the sentence; the token is all that survives.
 *
 * Order matters: the most specific name wins, so "gmail" beats the generic
 * "email" and a rule about one provider is never widened to its whole family.
 */
const SCOPE_KEYWORDS: [RegExp, string][] = [
  [/\bgmail\b/, "gmail"],
  [/\boutlook\b/, "outlook"],
  [/\bslack\b/, "slack"],
  [/\bgithub\b/, "github"],
  [/\bnotion\b/, "notion"],
  [/\bstripe\b/, "stripe"],
  [/\bdropbox\b/, "dropbox"],
  [/\bgoogle drive\b|\bdrive\b/, "google-drive"],
  [/\bgoogle calendar\b/, "google-calendar"],
  [/\b(e-?mails?|inbox|mailbox)\b/, "email"],
  [/\b(calendar|meetings?|events?)\b/, "calendar"],
  [/\b(files?|folders?|documents?|docs?)\b/, "files"],
  [/\b(payments?|invoices?|refunds?|charges?|billing)\b/, "payment"],
  [/\b(repos?|repositor(y|ies)|pull requests?|prs?|issues?|branch(es)?|code)\b/, "code"],
  [/\b(channels?|messages?)\b/, "chat"],
  [/\b(pages?|notes?|wiki)\b/, "docs"],
];

/**
 * Words that name an OPERATION — the one thing the rule governs. Each resolves
 * to a member of the closed `Operation` set, and the operation id is the only
 * thing enforcement ever compares.
 *
 * Ordered most-specific first, because English overlaps: "send a payment" is a
 * payment, not a send, and "delete" beats "archive" in "delete archived files".
 * Every pattern is anchored with word boundaries and spells out its own
 * inflections — no open-ended stem, which is what let "senders" read as "send".
 */
const OPERATION_KEYWORDS: [RegExp, string][] = [
  [/\brefunds?\b|\brefund(ed|ing)\b/, "refund"],
  [
    /\b(pay|pays|paid|paying|payments?|charges?|charged|charging|wire|wires|wired|transfers?|transferred|spend|spends|spending|spent)\b/,
    "payment",
  ],
  [/\bdeploys?\b|\bdeploy(ed|ing|ment|ments)\b|\brelease[sd]?\b|\breleasing\b/, "deploy"],
  [/\bdeletes?\b|\bdeleted\b|\bdeleting\b|\bremoves?\b|\bremoved\b|\bremoving\b|\bdestroys?\b|\bdestroyed\b|\bdestroying\b|\bpurges?\b|\btrash(es|ed|ing)?\b|\bwipes?\b|\bwiped\b/, "delete"],
  [/\barchives?\b|\barchived\b|\barchiving\b/, "archive"],
  [/\bpublish(es|ed|ing)?\b/, "publish"],
  [/\bdrafts?\b|\bdrafted\b|\bdrafting\b|\bcomposes?\b|\bcomposed\b|\bcomposing\b/, "draft"],
  // "email" as a bare word is the NOUN far more often than the verb, and it is
  // already how a person names the scope. Only its unambiguous verb forms
  // count, so "delete email" is a delete and not a send.
  [/\bsends?\b|\bsent\b|\bsending\b|\bemailed\b|\bemailing\b|\bforwards?\b|\bforwarded\b|\bforwarding\b|\breplies\b|\breply\b|\breplied\b|\breplying\b/, "send"],
  [/\bposts?\b|\bposted\b|\bposting\b|\bannounces?\b|\bannounced\b|\bannouncing\b/, "post"],
  [/\bmerges?\b|\bmerged\b|\bmerging\b/, "merge"],
  [/\bcloses?\b|\bclosed\b|\bclosing\b|\bresolves?\b|\bresolved\b|\bresolving\b/, "close"],
  [/\bcancels?\b|\bcancell?ed\b|\bcancell?ing\b|\bvoids?\b|\bvoided\b|\brevokes?\b|\brevoked\b/, "cancel"],
  [/\brenames?\b|\brenamed\b|\brenaming\b/, "rename"],
  [/\bmoves?\b|\bmoved\b|\bmoving\b|\breschedules?\b|\brescheduled\b|\brescheduling\b/, "move"],
  [/\bcreates?\b|\bcreated\b|\bcreating\b|\badds?\b|\badded\b|\badding\b|\bopens?\b|\bopened\b|\bopening\b/, "create"],
  [/\bupdates?\b|\bupdated\b|\bupdating\b|\bedits?\b|\bedited\b|\bediting\b|\bchanges?\b|\bchanged\b|\bchanging\b|\blabels?\b|\blabell?ed\b|\bmodif(y|ies|ied|ying)\b/, "update"],
  [/\breads?\b|\breading\b|\bviews?\b|\bviewed\b|\bviewing\b|\bsearch(es|ed|ing)?\b|\bscans?\b|\bscanned\b|\bscanning\b|\blists?\b|\blisted\b|\blisting\b|\bbrowse[sd]?\b|\bbrowsing\b/, "read"],
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

/**
 * Words that introduce the constraint. Whatever the rule restricts comes after
 * one of these.
 */
const CONSTRAINT_TRIGGER =
  /\b(never|cannot|can'?t|not allowed|forbid|forbidden|do not|don'?t|must not|before|without|unless|require[sd]?|requiring|needs?|always ask|ask before|block|prevent|prohibit)\b/;

/**
 * Which operation does the rule actually govern?
 *
 * A sentence can name several — "draft Slack messages but never post in
 * #announcements" names both drafting and posting, and only one of them is
 * being restricted. Table order alone gets this wrong, so the operation
 * governed is the FIRST one appearing after the word that introduces the
 * constraint ("never", "before", "without"…). Deterministic, and it matches
 * how the sentence reads aloud.
 *
 * With no trigger word, or nothing after it, table order decides.
 */
function detectOperation(t: string): string | null {
  const hits: { token: string; at: number }[] = [];
  for (const [re, token] of OPERATION_KEYWORDS) {
    /**
     * EVERY occurrence, not just the first. "post updates but never post in
     * #announcements" says post twice; recording only the first pins it before
     * the trigger, the after-trigger filter drops it, and table order picks
     * "update" — governing an operation the sentence never restricted.
     */
    const all = new RegExp(re.source, re.flags.includes("g") ? re.flags : `${re.flags}g`);
    for (const m of t.matchAll(all)) hits.push({ token, at: m.index });
  }
  if (hits.length === 0) return null;
  if (new Set(hits.map((h) => h.token)).size === 1) return hits[0].token;

  const trigger = CONSTRAINT_TRIGGER.exec(t);
  if (trigger) {
    const after = hits
      .filter((h) => h.at > trigger.index)
      .sort((a, b) => a.at - b.at);
    if (after.length > 0) return after[0].token;
  }
  // No trigger to disambiguate: fall back to table order (most specific first).
  for (const [, token] of OPERATION_KEYWORDS) {
    if (hits.some((h) => h.token === token)) return token;
  }
  return hits[0].token;
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
  const target = firstMatch(SCOPE_KEYWORDS, t) ?? "any";
  const verb = detectOperation(t) ?? "any";
  const condition = detectCondition(t);
  const { requirement } = detectRequirement(t);

  /**
   * Confidence is now about PRECISION, not about whether anything at all was
   * extracted. A rule that names one operation is exact; a rule that names
   * none governs every operation in its scope, which is a far larger claim
   * than most people mean to make and has to be shown to them before it binds.
   */
  const confidence: "high" | "low" = verb === "any" ? "low" : "high";

  return { target, verb, condition, requirement, confidence };
}

/**
 * What cosigno understood, in the three terms that decide everything: the
 * operation, what it demands, and how far it reaches. This is the same data
 * enforcement uses — not a description generated alongside it — so a person
 * reading this panel is reading the rule that will actually run.
 */
export interface RuleReading {
  /** e.g. "Send" — the one operation governed, or every one in scope. */
  action: string;
  /** e.g. "Approval required". */
  requirement: string;
  /** e.g. "Gmail and Outlook". */
  scope: string;
  /** Present when the rule only applies above/below a value, or to a channel. */
  qualifier?: string;
  /** True when the rule names no operation and therefore governs all of them. */
  broad: boolean;
}

const REQUIREMENT_READING: Record<RuleRequirement, string> = {
  auto: "No change — runs as it already did",
  approve: "Approval required",
  sign: "Your signature required",
  never: "Never allowed",
};

export function readRule(r: ParsedRule): RuleReading {
  const broad = r.verb === "any";
  const c = r.condition;
  let qualifier: string | undefined;
  if (c.kind === "amount" && typeof c.value === "number") {
    const word = c.op === "<" || c.op === "<=" ? "under" : "over";
    qualifier = `Only ${word} $${c.value.toLocaleString()}`;
  } else if (c.kind === "channel" && c.match) {
    qualifier = `Only in ${c.match}`;
  } else if (c.kind === "label" && c.match) {
    qualifier = `Only when labelled "${c.match}"`;
  }

  return {
    action: broad ? "Every action" : OPERATION_LABEL[r.verb as Operation] ?? r.verb,
    requirement: REQUIREMENT_READING[r.requirement],
    scope: scopeLabel(r.target),
    qualifier,
    broad,
  };
}

/** A one-line, plain-English rendering of a structured rule for the UI/audit. */
export function describeRule(r: ParsedRule): string {
  if (r.target.startsWith(CATEGORY_TARGET_PREFIX)) {
    const cat = r.target.slice(CATEGORY_TARGET_PREFIX.length) as ActionCategory;
    const label = CATEGORIES[cat]?.label.toLowerCase() ?? cat;
    return `${label} — ${REQUIREMENT_SENTENCE[r.requirement]}.`;
  }
  const scope =
    r.target === "any" && r.verb === "any"
      ? "any action"
      : `${r.verb === "any" ? "any" : r.verb} action${r.target === "any" ? "" : ` on ${r.target}`}`;
  let cond = "";
  if (r.condition.kind === "amount") cond = ` over $${r.condition.value}`.replace("over", r.condition.op === "<" ? "under" : "over");
  else if (r.condition.kind === "channel") cond = ` in ${r.condition.match}`;
  else if (r.condition.kind === "label") cond = ` labelled "${r.condition.match}"`;
  return `${scope}${cond} — ${REQUIREMENT_SENTENCE[r.requirement]}.`;
}

const REQUIREMENT_SENTENCE: Record<RuleRequirement, string> = {
  auto: "runs automatically",
  approve: "waits for your approval",
  sign: "requires your signature",
  never: "is never allowed",
};

/* ----------------------------------------------------- enforcement (tighten) */

/**
 * What an action declares about itself at the Boundary door.
 *
 * `providerKey` + `actionId` (or `category`) are normalized into exactly one
 * (provider, operation) pair before any rule is consulted. `summary` is
 * carried for logs and for label conditions only — it is NEVER used to decide
 * whether a rule applies, which is the whole point of this module.
 */
export interface RuleContext {
  /** Connection provider key (e.g. "gmail", "stripe"), when there is one. */
  target?: string;
  /** The connector action id (e.g. "send_message"), when there is one. */
  actionId?: string;
  /** Cosigno's own action category (e.g. "send_email"), when there is one. */
  category?: string;
  /** The capability's declared risk, used only for tools with no table entry. */
  risk?: "read" | "write" | "destructive";
  /** The server's resolved tier — recovers the risk class when none was declared. */
  tier?: Tier;
  /** Human summary — for label conditions and audit text, never for matching. */
  summary?: string;
  /** Amount involved, if the action's args carry one. */
  amount?: number;
  /** Channel involved (e.g. "#announcements"), if the args carry one. */
  channel?: string;
}

/**
 * Resolve an action to its normalized identity — the single place a
 * RuleContext becomes a (provider, operation) pair, so every caller of
 * `applyRules` is judged by exactly the same reading.
 */
export function normalizeContext(ctx: RuleContext): NormalizedAction {
  return normalizeAction({
    category: ctx.category,
    providerKey: ctx.target,
    actionId: ctx.actionId,
    risk: ctx.risk,
    tier: ctx.tier,
  });
}

/**
 * Whether a rule governs a given app, for display grouping ("the rules that
 * affect GitHub").
 *
 * Uses the SAME normalized scope test enforcement uses, not a second
 * substring pass — a display filter that disagreed with enforcement would be
 * a quiet lie, listing rules under an app they cannot fire on (or hiding ones
 * that can).
 */
export function ruleAppliesToApp(
  rule: Pick<PermissionRuleRecord, "target" | "enabled">,
  providerKey: string,
  providerName: string
): boolean {
  if (!rule.enabled) return false;
  if (rule.target === "any") return true;
  // Category rules are enforced at the action door on the real category, never
  // by reading an app name. They belong to no single app.
  if (rule.target.startsWith(CATEGORY_TARGET_PREFIX)) return false;
  const provider = providerForKey(providerKey) ?? providerForKey(providerName);
  return provider ? scopeCovers(rule.target, provider) : false;
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

/**
 * Bring a stored rule into the current vocabulary before it is judged.
 *
 * Rules are persisted as `target` + `verb` strings, parsed by whatever version
 * of the parser was running when they were saved. The vocabulary has since
 * become a closed set, and older tokens are not in it — a rule saved as
 * `target: "hubspot"` now matches `SCOPES` nowhere, so `scopeCovers` returns
 * false and the rule SILENTLY STOPS PROTECTING. No error, no warning; the
 * person who wrote it still sees it listed as enabled.
 *
 * The original sentence is kept verbatim precisely so this is recoverable:
 * when a stored token is outside the current vocabulary, the rule is re-parsed
 * from its own text. Re-parsing can only widen or keep the scope, never
 * narrow it, and a rule may only ever tighten what cosigno does — so the
 * conservative direction is preserved either way.
 */
export function normalizeStoredRule(rule: PermissionRuleRecord): PermissionRuleRecord {
  /* A category rule names an engine category outright and is enforced at
     proposeAction, where the category is a known fact. Its target is
     deliberately NOT a scope, so the backfill below would "repair" it by
     re-parsing the text — turning an inert marker into a live text-matched
     rule that enforces a second time, differently. Leave it alone. */
  if (rule.target.startsWith(CATEGORY_TARGET_PREFIX)) return rule;
  const scopeKnown = rule.target === "any" || rule.target in SCOPES;
  const verbKnown = rule.verb === "any" || isOperation(rule.verb);
  if (scopeKnown && verbKnown) return rule;

  const reparsed = parsePermissionRule(rule.text);
  return {
    ...rule,
    target: scopeKnown ? rule.target : reparsed.target,
    verb: verbKnown ? rule.verb : reparsed.verb,
  };
}

export interface RuleDecision {
  /** The most restrictive requirement any matching enabled rule imposes. */
  requirement: RuleRequirement | null;
  /** The rule that set it (for the audit note), if any. */
  rule: PermissionRuleRecord | null;
}

/**
 * The single most restrictive requirement across all enabled, matching rules.
 * Returns `{requirement:null}` when no rule applies.
 *
 * THE one place a rule is judged against an action, for previews and for live
 * execution alike. The action is normalized once, then every test is set
 * membership over closed vocabularies: does the rule's scope cover this
 * provider, and is the rule's operation this operation. No sentence is read,
 * so no rule can fire on a word that merely appears in a summary.
 */
export function applyRules(rules: PermissionRuleRecord[], ctx: RuleContext): RuleDecision {
  const action = normalizeContext(ctx);
  let best: RuleDecision = { requirement: null, rule: null };
  for (const stored of rules) {
    if (!stored.enabled) continue;
    const rule = normalizeStoredRule(stored);
    if (!scopeCovers(rule.target, action.provider)) continue;
    if (!operationCovers(rule.verb, action.operation)) continue;
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
