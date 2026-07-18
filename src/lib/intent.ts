/**
 * Adaptive UI intent routing — the interface becomes the answer. The user
 * speaks to cosigno from anywhere (the Presence mark, ⌘K); this classifier
 * decides which environment the workspace should become. Deterministic and
 * pure: no model call stands between the user and their own workspace, so
 * routing is instant and testable. Anything that isn't a navigation intent
 * is a delegation — it flows to the normal understand→plan pipeline.
 */

export type IntentView =
  | "focus" // where am I needed → only the decisions
  | "completed" // what did you finish → today's completed work
  | "state" // what's happening → current state (home)
  | "blocked" // what's blocked → isolated blocked work
  | "missions" // show my missions
  | "environment" // show the launch → a specific mission's environment
  | "watch"
  | "activity"
  | "delegate"; // not navigation — hand the text to the operator

export interface Intent {
  view: IntentView;
  /** For environment: what to look for; for delegate: the raw objective. */
  query?: string;
}

const RULES: { re: RegExp; view: IntentView }[] = [
  // where the user is needed
  { re: /(what('s| is)?\s*)?(waiting|needs?)\s*(on|for)?\s*me\b|where am i needed|need(s)? (my|your)? ?(decision|approval|signature)|my decisions?\b/i, view: "focus" },
  // finished work
  { re: /what did (you|cosigno) (finish|complete|do|get done)|finished today|completed today|done today|show.*(finished|completed)/i, view: "completed" },
  // blocked work
  { re: /blocked|stuck|what('s| is) holding/i, view: "blocked" },
  // watches
  { re: /^(show |open )?(my )?watch(es)?\b|what are you watching|being watched/i, view: "watch" },
  // activity / history
  { re: /^(show |open )?activity\b|history|what happened yesterday|everything (you|cosigno) did/i, view: "activity" },
  // missions list
  { re: /^(show |open )?(my )?missions?$/i, view: "missions" },
  // a specific environment: "show me the launch", "open the summer launch",
  // "what's happening with the launch"
  { re: /^(show( me)?|open|go to) (the )?(?<q>.+)$/i, view: "environment" },
  { re: /what('s| is) happening with (the )?(?<q>.+)$/i, view: "environment" },
  // general state
  { re: /^what('s| is) happening\??$|^status\??$|current state|^state$|what changed/i, view: "state" },
];

/** Environment queries that are really the state/home ask, not a mission. */
const NOT_AN_ENVIRONMENT = /^(everything|state|home|around|up|new|going on)\b/i;

export function classifyIntent(input: string): Intent {
  const text = input.trim().replace(/[.!]+$/, "");
  if (!text) return { view: "state" };

  for (const rule of RULES) {
    const m = rule.re.exec(text);
    if (!m) continue;
    if (rule.view === "environment") {
      const q = m.groups?.q?.trim().replace(/[?]+$/, "") ?? "";
      if (!q || NOT_AN_ENVIRONMENT.test(q)) return { view: "state" };
      // "show my missions/watches/activity" already matched above; anything
      // else names a thing — take the user to it.
      return { view: "environment", query: q };
    }
    return { view: rule.view };
  }

  // Not a navigation ask — it's a delegation.
  return { view: "delegate", query: text };
}

/** Where each view lives in the fallback navigation. */
export function intentHref(intent: Intent): string {
  switch (intent.view) {
    case "focus":
      return "/app/focus";
    case "completed":
      return "/app/activity?status=executed&range=today";
    case "blocked":
      return "/app/missions?filter=blocked";
    case "missions":
      return "/app/missions";
    case "environment":
      return `/app/missions?q=${encodeURIComponent(intent.query ?? "")}`;
    case "watch":
      return "/app/watch";
    case "activity":
      return "/app/activity";
    case "delegate":
      return `/app?handle=${encodeURIComponent(intent.query ?? "")}`;
    case "state":
    default:
      return "/app";
  }
}
