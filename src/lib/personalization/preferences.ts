import { CATEGORIES, type ActionCategory, type ActionRecord, type MissionRecord } from "../types";

/**
 * WHAT COSIGNO HAS LEARNED ABOUT HOW YOU WORK.
 *
 * The difference between a product that stores memories and one that is
 * actually personalized is whether the memories change what happens next.
 * A note in a database that never reaches a decision is a diary, not a
 * preference — and it is the failure mode this module exists to avoid.
 *
 * Everything here is DERIVED FROM DECISIONS THE USER ALREADY MADE. Nobody is
 * asked to fill in a preferences form (a form measures what people say they
 * want; their vetoes measure what they actually want, and the two disagree
 * constantly). The inputs are:
 *
 *   · vetoes            — what they consistently refuse
 *   · approvals         — what they consistently wave through
 *   · the words they use — "keep it short", "in detail", "simpler"
 *   · which apps their work actually touches
 *
 * Three rules keep this from becoming surveillance:
 *
 * 1. EVIDENCE OR IT DOESN'T EXIST. Every preference carries the count it was
 *    derived from and the total it was counted against, and is shown to the
 *    user with that evidence. There is no hidden profile.
 * 2. A PATTERN, NOT AN INCIDENT. Nothing is learned from one event. The
 *    thresholds below are deliberately dull; a single unusual day should not
 *    change how cosigno behaves for a month.
 * 3. NEVER A LOOSENING. A learned preference can make cosigno more careful,
 *    more concise, or more specific. It can never lower a permission boundary
 *    or grant itself approval — those live in the rules engine, are set by the
 *    user explicitly, and are not inferred from anything.
 *
 * Pure functions over records, so the phrasing and the thresholds can be
 * tested rather than eyeballed.
 */

export type PreferenceKind = "style" | "caution" | "trust" | "focus";

export interface LearnedPreference {
  /** Stable across recomputes, so the UI can remember what it has shown. */
  id: string;
  kind: PreferenceKind;
  /** First person, from cosigno, one line: "You prefer short updates." */
  statement: string;
  /** What cosigno will DO differently. This is the part that must be real. */
  behavior: string;
  /** The evidence, in the user's terms. */
  because: string;
  /** How sure, from how much evidence. Only "high" is ever acted on silently. */
  confidence: "high" | "medium";
}

/** Everything the derivation looks at. All optional — missing data is fine. */
export interface PreferenceInputs {
  actions?: ActionRecord[];
  missions?: MissionRecord[];
  /** What the user typed, most recent first. */
  commands?: string[];
}

/* --------------------------------------------------------------- limits */

/** Below this many decisions in a category, a pattern is a coincidence. */
const MIN_DECISIONS = 4;
/** Share of decisions that must agree before it counts as a preference. */
const STRONG = 0.75;
/** How many times a phrasing habit must recur before it is a habit. */
const MIN_PHRASE_HITS = 3;
/** Never overwhelm the planner (or the user) with a personality profile. */
export const MAX_PREFERENCES = 6;

/* ---------------------------------------------------------------- style */

/**
 * Habits of phrasing, each with the behavior it implies. Matched against what
 * the user actually typed — the most reliable preference signal there is,
 * because they wrote it down.
 */
const STYLE_PATTERNS: {
  id: string;
  re: RegExp;
  statement: string;
  behavior: string;
}[] = [
  {
    id: "style_brief",
    re: /\b(keep it (short|brief)|be brief|concise|short(er)? version|tl;?dr|just the|summari[sz]e|one (line|paragraph)|bullet points?)\b/i,
    statement: "You prefer short answers.",
    behavior: "Lead with the outcome and keep updates to a few lines unless you ask for more.",
  },
  {
    id: "style_detail",
    re: /\b(in detail|thorough(ly)?|comprehensive|deep dive|full (analysis|breakdown)|explain why|show your (work|reasoning))\b/i,
    statement: "You want the reasoning, not just the result.",
    behavior: "Include the evidence and the trade-offs behind a recommendation.",
  },
  {
    id: "style_simple",
    re: /\b(simpler|simplify|make it simple|plain english|less complicated|too complicated|no jargon)\b/i,
    statement: "You want things simpler.",
    behavior: "Prefer the plainest version that is still accurate, and cut optional detail.",
  },
  {
    id: "style_fast",
    re: /\b(quick(ly)?|asap|right now|urgent|don'?t overthink|fastest)\b/i,
    statement: "You usually want the fast path.",
    behavior: "Choose the shortest route to a usable result and flag anything skipped.",
  },
];

function styleFromCommands(commands: string[]): LearnedPreference[] {
  const out: LearnedPreference[] = [];
  for (const p of STYLE_PATTERNS) {
    const hits = commands.filter((c) => p.re.test(c)).length;
    if (hits < MIN_PHRASE_HITS) continue;
    out.push({
      id: p.id,
      kind: "style",
      statement: p.statement,
      behavior: p.behavior,
      because: `You've asked for this ${hits} times.`,
      confidence: hits >= MIN_PHRASE_HITS + 2 ? "high" : "medium",
    });
  }
  return out;
}

/* -------------------------------------------------------------- caution */

/** Human label for a category, from the one place categories are defined. */
function categoryLabel(c: ActionCategory): string {
  return (CATEGORIES[c]?.label ?? c).toLowerCase();
}

/**
 * Categories the user keeps refusing, and categories they keep approving.
 *
 * The refusal side changes behavior: cosigno stops proposing that kind of
 * thing unprompted and says why instead. The approval side deliberately does
 * NOT lower any boundary — it only tells cosigno it can propose that work
 * without hedging, because the permission itself is the user's to set.
 */
function fromDecisions(actions: ActionRecord[]): LearnedPreference[] {
  const decided = actions.filter((a) => a.status === "vetoed" || a.status === "executed");
  const byCategory = new Map<ActionCategory, { vetoed: number; total: number }>();
  for (const a of decided) {
    const slot = byCategory.get(a.category) ?? { vetoed: 0, total: 0 };
    slot.total += 1;
    if (a.status === "vetoed") slot.vetoed += 1;
    byCategory.set(a.category, slot);
  }

  const out: LearnedPreference[] = [];
  for (const [category, { vetoed, total }] of byCategory) {
    if (total < MIN_DECISIONS) continue;
    const rate = vetoed / total;
    if (rate >= STRONG) {
      out.push({
        id: `caution_${category}`,
        kind: "caution",
        statement: `You almost always decline ${categoryLabel(category)} actions.`,
        behavior: `Stop proposing ${categoryLabel(category)} work on your behalf — raise it as a suggestion instead.`,
        because: `You declined ${vetoed} of the last ${total}.`,
        confidence: total >= MIN_DECISIONS * 2 ? "high" : "medium",
      });
    } else if (rate === 0) {
      out.push({
        id: `trust_${category}`,
        kind: "trust",
        statement: `You've approved every ${categoryLabel(category)} action so far.`,
        behavior: `Propose ${categoryLabel(category)} work directly instead of asking whether to draft it. Your approval is still required for each one.`,
        because: `${total} approved, none declined.`,
        confidence: total >= MIN_DECISIONS * 2 ? "high" : "medium",
      });
    }
  }
  return out;
}

/* ---------------------------------------------------------------- focus */

/** The kind of work this person actually delegates, from their own goals. */
const FOCUS_PATTERNS: { id: string; re: RegExp; label: string }[] = [
  { id: "focus_inbox", re: /\b(inbox|email|e-?mails?|reply|replies|follow[- ]?ups?)\b/i, label: "your inbox" },
  { id: "focus_schedule", re: /\b(calendar|meeting|schedule|agenda|brief)\b/i, label: "your schedule" },
  { id: "focus_research", re: /\b(research|compare|find out|investigate|analy[sz]e|options?)\b/i, label: "research" },
  { id: "focus_code", re: /\b(repo|repositor|issue|pull request|deploy|bug|code)\b/i, label: "your code" },
  { id: "focus_growth", re: /\b(sales|revenue|customers?|growth|marketing|campaign|conversion)\b/i, label: "growth" },
];

function focusFromGoals(goals: string[]): LearnedPreference[] {
  if (goals.length < MIN_DECISIONS) return [];
  const counts = FOCUS_PATTERNS.map((p) => ({
    p,
    n: goals.filter((g) => p.re.test(g)).length,
  })).sort((a, b) => b.n - a.n);
  const top = counts[0];
  if (!top || top.n < MIN_DECISIONS || top.n / goals.length < 0.5) return [];
  return [
    {
      id: top.p.id,
      kind: "focus",
      statement: `Most of what you delegate is about ${top.p.label}.`,
      behavior: `Assume ${top.p.label} is the context when a request is ambiguous.`,
      because: `${top.n} of your last ${goals.length} requests.`,
      confidence: top.n >= MIN_DECISIONS * 2 ? "high" : "medium",
    },
  ];
}

/* ------------------------------------------------------------- assembly */

/**
 * Everything cosigno has learned, strongest evidence first, capped.
 *
 * Ordering puts caution ahead of convenience on purpose: knowing what someone
 * refuses is worth more than knowing what they like, and if only one
 * preference can be shown it should be the one that prevents an unwanted
 * action rather than the one that shortens a paragraph.
 */
export function derivePreferences(inputs: PreferenceInputs): LearnedPreference[] {
  const actions = inputs.actions ?? [];
  const commands = inputs.commands ?? [];
  const goals = (inputs.missions ?? []).map((m) => m.goal);

  const all = [
    ...fromDecisions(actions),
    ...styleFromCommands([...commands, ...goals]),
    ...focusFromGoals(goals),
  ];

  const rank: Record<PreferenceKind, number> = { caution: 0, style: 1, focus: 2, trust: 3 };
  return all
    .sort((a, b) => {
      if (a.confidence !== b.confidence) return a.confidence === "high" ? -1 : 1;
      return rank[a.kind] - rank[b.kind];
    })
    .slice(0, MAX_PREFERENCES);
}

/**
 * The learned preferences as planner context.
 *
 * Deliberately phrased as behavior instructions rather than facts about the
 * person: "keep updates short" is actionable, "the user is a concise
 * communicator" is a character sketch the planner will improvise around.
 *
 * Returns "" when nothing has been learned, so the caller can skip the whole
 * section rather than telling the planner about an empty profile.
 */
export function preferencesPrompt(prefs: LearnedPreference[]): string {
  if (prefs.length === 0) return "";
  return prefs.map((p) => `- ${p.behavior} (${p.because})`).join("\n");
}

/**
 * The ONE preference worth mentioning in the interface right now.
 *
 * Personalization has to be visible or it feels like nothing, and it has to
 * be rare or it feels like being watched. One line, only from high-confidence
 * evidence, and only ever about behavior the user can see for themselves.
 */
export function visibleNote(prefs: LearnedPreference[]): LearnedPreference | null {
  return prefs.find((p) => p.confidence === "high") ?? null;
}
