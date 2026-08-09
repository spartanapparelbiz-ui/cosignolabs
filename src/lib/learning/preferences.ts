import { CATEGORIES, type ActionCategory } from "../types";
import { detectInjection } from "../agent/untrusted";

/**
 * What cosigno has learned about this user FROM THIS USER'S OWN DECISIONS.
 *
 * Every approval, every payload edit made at the approval door, and every veto
 * is already recorded — and until now all of it was thrown away the moment the
 * card resolved. The operator opened every session as a stranger, and the user
 * paid for that by correcting the same thing forever.
 *
 * This module turns that decision history into typed, weighted preferences.
 * Three properties matter more than the feature itself:
 *
 *  1. DERIVED, NEVER INVENTED. Nothing here calls a model. A preference is a
 *     counting result over decisions the user made and can see in Activity;
 *     each one carries the evidence that produced it. If the user disagrees
 *     with a preference, they can check the arithmetic.
 *
 *  2. SLOW TO CONCLUDE, FAST TO FORGET. A preference needs repetition AND
 *     dominance before it is stated (see THRESHOLDS). One veto is not a law.
 *     Because derivation reads a recent window rather than a stored verdict,
 *     a user who changes their mind stops seeing the old preference — there is
 *     no accumulated file that outlives the behaviour behind it.
 *
 *  3. NEVER AUTHORITY. A preference can only change WHAT gets proposed. It
 *     cannot raise a tier, grant permission, skip an approval, or widen a
 *     rule — those come from the server and the user, and nothing in this file
 *     is an input to them. `trusted` in particular means "propose this kind of
 *     work confidently", never "this may run unapproved".
 */

export type LearnedKind = "avoid" | "revise" | "trusted" | "constraint";

export interface LearnedPreference {
  /**
   * Stable identity across derivations — the same behaviour derives the same
   * key next week. Mutes address this, so a muted preference stays muted.
   */
  key: string;
  kind: LearnedKind;
  /** The action category this concerns, when it concerns exactly one. */
  category: ActionCategory | null;
  /** One plain sentence, written for the user and reused verbatim by the planner. */
  statement: string;
  /** The decisions that support this preference. */
  weight: number;
  /** Comparable decisions seen — weight / observed is the dominance. */
  observed: number;
  /** ISO timestamp of the most recent supporting decision. */
  last_seen: string;
}

/** One resolved decision, flattened from an action plus its event trail. */
export interface Decision {
  id: string;
  category: ActionCategory;
  outcome: "approved" | "edited" | "vetoed";
  /** The user's own words when they turned it down. */
  reason: string | null;
  /** When the user decided, falling back to when the card was put to them. */
  at: string;
}

/**
 * How much repetition earns a stated preference.
 *
 * These are deliberately conservative. The cost of a missed preference is that
 * the user corrects cosigno one more time; the cost of a wrong one is that
 * cosigno confidently does the wrong thing and cites the user as the reason.
 * The second is much worse, so the bar sits above what a casual glance at the
 * data would suggest.
 */
export const THRESHOLDS = {
  /** Decisions in a category before it can say anything about that category. */
  minObservations: 3,
  /** Share of those decisions that must agree, for `avoid` and `revise`. */
  dominance: 0.6,
  /** `trusted` shapes confidence, so it needs more evidence and near-unanimity. */
  trustedMinObservations: 4,
  trustedDominance: 0.8,
  /** Distinct vetoes a word must appear in before it reads as a standing limit. */
  constraintMinVetoes: 2,
} as const;

/** Preferences handed to the planner at once — a prompt section, not a dossier. */
export const MAX_PREFERENCES = 8;

/** Longest quoted fragment of a user's own veto reason. */
const MAX_REASON_CHARS = 120;

/**
 * A veto reason is the user's text, but it is not necessarily the user's
 * words: people paste the sentence that annoyed them, and that sentence can
 * come from an email written by someone else. Reasons are therefore flattened
 * to a single bounded line and dropped outright if they read as instructions —
 * a quoted reason must never be able to act as one.
 */
export function sanitizeReason(reason: string | null | undefined): string | null {
  if (!reason) return null;
  const flat = Array.from(reason)
    .map((c) => (c.charCodeAt(0) < 32 || c.charCodeAt(0) === 127 ? " " : c))
    .join("")
    .replace(/\s+/g, " ")
    .trim();
  if (!flat || flat.toLowerCase() === "no reason given") return null;
  if (detectInjection(flat)) return null;
  return flat.length > MAX_REASON_CHARS
    ? `${flat.slice(0, MAX_REASON_CHARS - 1)}…`
    : flat;
}

/**
 * Words that carry no signal about what the user wants. Kept small and
 * obvious: an aggressive list would silently swallow the domain words
 * ("refund", "invoice", "weekend") that make a constraint worth stating.
 */
const STOPWORDS = new Set([
  "about", "after", "again", "against", "because", "before", "being", "between",
  "could", "didn", "does", "doesn", "doing", "done", "dont", "down",
  "each", "even", "ever", "every", "from", "have", "here", "into", "just",
  "like", "make", "many", "more", "most", "much", "must", "need", "only",
  "other", "over", "same", "should", "since", "some", "such", "than", "that",
  "them", "then", "there", "these", "they", "thing", "this", "those", "through",
  "under", "until", "very", "want", "wasn", "were", "what", "when", "where",
  "which", "while", "will", "with", "would", "your", "yours", "really", "quite",
  "actually", "maybe", "please", "thanks", "wrong", "right", "good", "better",
]);

function contentWords(reason: string): string[] {
  const seen = new Set<string>();
  for (const raw of reason.toLowerCase().split(/[^a-z0-9']+/)) {
    const word = raw.replace(/^'+|'+$/g, "");
    if (word.length < 4 || STOPWORDS.has(word)) continue;
    seen.add(word);
  }
  return [...seen];
}

function label(category: ActionCategory): string {
  return (CATEGORIES[category]?.label ?? category).toLowerCase();
}

function plural(n: number, word: string): string {
  return `${n} ${word}${n === 1 ? "" : "s"}`;
}

interface Tally {
  approved: number;
  edited: number;
  vetoed: number;
  total: number;
  lastApproved: string | null;
  lastEdited: string | null;
  lastVetoed: string | null;
}

function tally(decisions: Decision[]): Map<ActionCategory, Tally> {
  const byCategory = new Map<ActionCategory, Tally>();
  for (const d of decisions) {
    const t = byCategory.get(d.category) ?? {
      approved: 0,
      edited: 0,
      vetoed: 0,
      total: 0,
      lastApproved: null,
      lastEdited: null,
      lastVetoed: null,
    };
    t[d.outcome] += 1;
    t.total += 1;
    const field =
      d.outcome === "approved"
        ? "lastApproved"
        : d.outcome === "edited"
          ? "lastEdited"
          : "lastVetoed";
    if (!t[field] || d.at > (t[field] as string)) t[field] = d.at;
    byCategory.set(d.category, t);
  }
  return byCategory;
}

/**
 * Recurring language across DISTINCT vetoes. A word the user reached for once
 * is a mood; a word they reached for while turning down two separate proposals
 * is a limit they keep having to restate — which is exactly the thing worth
 * carrying forward.
 */
function constraintsFrom(decisions: Decision[]): LearnedPreference[] {
  const hits = new Map<string, { count: number; last: string }>();
  for (const d of decisions) {
    if (d.outcome !== "vetoed") continue;
    const reason = sanitizeReason(d.reason);
    if (!reason) continue;
    for (const word of contentWords(reason)) {
      const prev = hits.get(word);
      hits.set(word, {
        count: (prev?.count ?? 0) + 1,
        last: prev && prev.last > d.at ? prev.last : d.at,
      });
    }
  }

  const out: LearnedPreference[] = [];
  for (const [word, hit] of hits) {
    if (hit.count < THRESHOLDS.constraintMinVetoes) continue;
    out.push({
      key: `constraint:${word}`,
      kind: "constraint",
      category: null,
      statement: `they have turned down ${plural(hit.count, "proposal")} mentioning "${word}" — treat it as a limit unless this command says otherwise.`,
      weight: hit.count,
      observed: hit.count,
      last_seen: hit.last,
    });
  }
  return out;
}

/**
 * decisions → stated preferences. Pure and total: same input, same output, no
 * clock, no I/O, no model. Ordered strongest-first with the key as a
 * tiebreaker so the prompt (and the UI) is stable between identical reads.
 */
export function derivePreferences(decisions: Decision[]): LearnedPreference[] {
  const out: LearnedPreference[] = [];

  for (const [category, t] of tally(decisions)) {
    if (t.total < THRESHOLDS.minObservations) continue;

    if (t.vetoed / t.total >= THRESHOLDS.dominance) {
      out.push({
        key: `avoid:${category}`,
        kind: "avoid",
        category,
        statement: `they turn down "${label(category)}" work — ${t.vetoed} of the last ${t.total} were vetoed. propose it only when this command clearly asks for it, and say why.`,
        weight: t.vetoed,
        observed: t.total,
        last_seen: t.lastVetoed ?? t.lastEdited ?? t.lastApproved ?? "",
      });
      // A category the user rejects has nothing useful to say about revision
      // or trust — one verdict per category keeps the prompt readable.
      continue;
    }

    if (t.edited / t.total >= THRESHOLDS.dominance) {
      out.push({
        key: `revise:${category}`,
        kind: "revise",
        category,
        statement: `they rewrite "${label(category)}" proposals before approving — ${t.edited} of the last ${t.total} needed an edit. the default draft is not landing; be more specific and state your assumptions.`,
        weight: t.edited,
        observed: t.total,
        last_seen: t.lastEdited ?? "",
      });
      continue;
    }

    if (
      t.total >= THRESHOLDS.trustedMinObservations &&
      t.approved / t.total >= THRESHOLDS.trustedDominance
    ) {
      out.push({
        key: `trusted:${category}`,
        kind: "trusted",
        category,
        statement: `"${label(category)}" proposals land as written — ${t.approved} of the last ${t.total} were approved unchanged. keep proposing them at this level of detail. (this is not permission: the approval still happens.)`,
        weight: t.approved,
        observed: t.total,
        last_seen: t.lastApproved ?? "",
      });
    }
  }

  out.push(...constraintsFrom(decisions));

  return out.sort((a, b) => b.weight - a.weight || a.key.localeCompare(b.key));
}

/**
 * The planner-facing rendering. Separated from `derivePreferences` so the UI
 * and the prompt read the same list and cannot drift: what the user is shown
 * on the memory page is what the operator was actually told.
 */
export function renderPreferences(preferences: LearnedPreference[]): string {
  return preferences
    .slice(0, MAX_PREFERENCES)
    .map((p) => `- ${p.statement}`)
    .join("\n");
}
