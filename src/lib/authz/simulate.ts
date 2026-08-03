import { AUTHORITY_LADDER, maxAuthority, type Authority } from "./blastRadius";
import type { DecisionRecord } from "./store";

/**
 * Policy simulation — "what would this rule have done?"
 *
 * A policy is never enabled blind. A draft rule is replayed against the REAL
 * decisions already on the ledger, and the result reports exactly which past
 * actions it would have caught, which it would have blocked outright, and
 * which it would not have touched.
 *
 * The invariant from the decision engine holds here too, by construction: a
 * rule may only ever RAISE the required authority. `applyRule` takes the max
 * over the authority ladder, so a simulation can never show a rule making the
 * system more permissive — because a rule cannot.
 */

export type Requirement = Authority; // "auto" | "approve" | "sign" | "deny"

export interface DraftRule {
  /** Human sentence this rule came from, kept verbatim for the report. */
  text?: string;
  /** Match an action id exactly, or "*" / undefined for any. */
  action?: string;
  /** Match an actor exactly, or "*" / undefined for any. */
  actor?: string;
  /** Only applies at or above this amount (cents). */
  min_amount_cents?: number;
  /** Only applies at or above this blast level. */
  min_blast_level?: "minimal" | "low" | "moderate" | "high" | "severe";
  /** What the rule demands when it matches. */
  requirement: Requirement;
}

export interface SimulatedDecision {
  decision_id: string;
  actor: string;
  action: string;
  resource: string;
  before: Authority;
  after: Authority;
  changed: boolean;
  /** True when the rule newly stops something that previously auto-cleared. */
  newly_held: boolean;
  /** True when the rule would have blocked it outright. */
  newly_blocked: boolean;
  /** True when this action already executed under the old policy. */
  already_executed: boolean;
  reason: string;
}

export interface SimulationResult {
  rule: DraftRule;
  evaluated: number;
  matched: number;
  unchanged: number;
  /** Every decision the rule raised, at any step of the ladder. */
  tightened: number;
  newly_held: number;
  newly_blocked: number;
  /** Actions that ALREADY RAN and would have been stopped — the headline. */
  would_have_stopped: SimulatedDecision[];
  decisions: SimulatedDecision[];
}

const BLAST_ORDER = ["minimal", "low", "moderate", "high", "severe"];

/** Does this historical decision fall under the draft rule? */
export function ruleMatches(rule: DraftRule, d: DecisionRecord): boolean {
  if (rule.action && rule.action !== "*" && rule.action !== d.action) return false;
  if (rule.actor && rule.actor !== "*" && rule.actor !== d.actor) return false;
  if (rule.min_blast_level) {
    const need = BLAST_ORDER.indexOf(rule.min_blast_level);
    const have = BLAST_ORDER.indexOf(d.blast_level);
    if (have < need) return false;
  }
  // Amount lives in the decision's blast dimensions; a rule that filters on
  // amount cannot match a decision with no financial dimension recorded.
  if (typeof rule.min_amount_cents === "number") {
    const cents = amountOf(d);
    if (cents === null || cents < rule.min_amount_cents) return false;
  }
  return true;
}

/** Recover the financial magnitude the engine scored, if it recorded one. */
function amountOf(d: DecisionRecord): number | null {
  const fin = d.policy_trace.find((s) => s.rule === "blast_radius");
  if (!fin) return null;
  const m = /\$([\d,]+(?:\.\d+)?)/.exec(fin.detail);
  if (!m) return null;
  return Math.round(parseFloat(m[1].replace(/,/g, "")) * 100);
}

/** A rule can only tighten. Never returns a weaker authority than `current`. */
export function applyRule(current: Authority, requirement: Requirement): Authority {
  return maxAuthority(current, requirement);
}

export function simulate(rule: DraftRule, history: DecisionRecord[]): SimulationResult {
  const decisions: SimulatedDecision[] = history.map((d) => {
    const before = d.authority as Authority;
    const matched = ruleMatches(rule, d);
    const after = matched ? applyRule(before, rule.requirement) : before;
    const changed = after !== before;

    return {
      decision_id: d.id,
      actor: d.actor,
      action: d.action,
      resource: d.resource,
      before,
      after,
      changed,
      newly_held: changed && before === "auto" && after !== "deny",
      newly_blocked: changed && after === "deny",
      already_executed: Boolean(d.executed_at),
      reason: !matched
        ? "outside this rule's scope"
        : changed
          ? `raised from ${before} to ${after}`
          : `already required ${before} — rule adds nothing`,
    };
  });

  const matchedList = decisions.filter((x) => x.reason !== "outside this rule's scope");

  return {
    rule,
    evaluated: decisions.length,
    matched: matchedList.length,
    unchanged: matchedList.filter((x) => !x.changed).length,
    tightened: decisions.filter((x) => x.changed).length,
    newly_held: decisions.filter((x) => x.newly_held).length,
    newly_blocked: decisions.filter((x) => x.newly_blocked).length,
    // The number that sells the rule: things that ALREADY happened which this
    // rule would have caught first.
    would_have_stopped: decisions.filter((x) => x.changed && x.already_executed),
    decisions,
  };
}

/**
 * Parse a plain-English rule into a structured draft.
 *
 * Deliberately conservative and DETERMINISTIC — no model call. When a clause
 * isn't confidently understood the rule is left broader-but-stricter (it asks
 * for approval rather than silently narrowing scope), and `confidence` is
 * reported so the UI can require review before saving. A policy compiler that
 * guesses is worse than one that admits it didn't parse.
 */
export function parseRule(text: string): { rule: DraftRule; confidence: "high" | "low" } {
  const t = text.toLowerCase();
  const rule: DraftRule = { text, requirement: "approve" };
  let confidence: "high" | "low" = "high";

  if (/\bnever\b|\bnot allowed\b|\bforbid|\bblock\b|\bdeny\b|\bprohibit/.test(t)) {
    rule.requirement = "deny";
  } else if (/\bsign\b|\bsignature\b|\btyped confirmation\b|\btwo approval|\bcfo\b|\bapprover\b/.test(t)) {
    rule.requirement = "sign";
  } else if (/\bapprov|\breview\b|\bask me\b|\bcheck with\b/.test(t)) {
    rule.requirement = "approve";
  } else {
    confidence = "low";
  }

  const amount = /\$\s?([\d,]+(?:\.\d+)?)\s*(k\b)?/.exec(t);
  if (amount) {
    const base = parseFloat(amount[1].replace(/,/g, ""));
    rule.min_amount_cents = Math.round(base * (amount[2] ? 1000 : 1) * 100);
  }

  // Known action vocabulary — only set when unambiguous.
  const ACTIONS: [RegExp, string][] = [
    // Stems, not exact words: "deleting"/"deletion" must match as surely as
    // "delete", or a forbid rule silently loses its scope and applies to
    // nothing. Narrowing by accident is the dangerous failure here.
    [/\brefund/, "refund.issue"],
    [/\bpayment|\bpay\b|\bpaying\b|\btransfer/, "payment.send"],
    [/\bdeploy/, "infra.deploy"],
    [/\bdelet|\bdrop\b|\bremov|\bpurge|\bwipe/, "record.delete"],
    [/\bemail|\bmail\b/, "email.send"],
    [/\bpublish|\bpost\b|\bposting\b|\bcampaign/, "content.post"],
  ];
  for (const [re, id] of ACTIONS) {
    if (re.test(t)) {
      rule.action = id;
      break;
    }
  }
  if (!rule.action) confidence = "low";

  const actor = /\b(finance|marketing|engineering|support|legal|security|hr|sales)\b/.exec(t);
  if (actor) rule.actor = `agent:${actor[1]}`;

  return { rule, confidence };
}

/** Ordered ladder, exported so the UI can render the delta consistently. */
export const LADDER = AUTHORITY_LADDER;
