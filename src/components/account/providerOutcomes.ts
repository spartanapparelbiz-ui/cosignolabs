/**
 * What connecting an app actually lets a person get done.
 *
 * A connector's capabilities are written for the planner: "search your inbox
 * and list matches (read-only)", "add a label to messages". That is the right
 * vocabulary for the engine and the wrong one for someone deciding whether to
 * hand over their mailbox. Reading a list of API operations feels like
 * evaluating a library; the question actually being asked is "what will this
 * do for me, and what will it never do without asking?"
 *
 * So every connector leads with jobs, and the operations stay one disclosure
 * away for anyone who wants them.
 *
 * Each line here is backed by a real capability the provider exposes — see the
 * provider modules under src/lib/integrations/providers. Nothing is aspirational.
 */

export interface ProviderOutcomes {
  /** One sentence: the job this app does once connected. */
  headline: string;
  /** At most four things a person would actually ask for. */
  can: string[];
  /** The line that buys trust: what it will never do on its own. */
  never: string;
}

export const OUTCOMES: Record<string, ProviderOutcomes> = {
  google: {
    headline: "Keep your inbox under control without losing anything.",
    can: [
      "Find what's waiting and summarise it",
      "Draft replies for you to review",
      "Send mail once you approve it",
      "Archive and label the clutter",
    ],
    never: "Never sends or deletes mail without your signature.",
  },
  outlook: {
    headline: "Keep your inbox under control without losing anything.",
    can: [
      "Find what's waiting and summarise it",
      "Draft replies for you to review",
      "Send mail once you approve it",
      "Mark messages read",
    ],
    never: "Never sends or deletes mail without your signature.",
  },
  "google-calendar": {
    headline: "Protect your time and prepare you for what's next.",
    can: [
      "See what's coming up",
      "Find genuinely free slots",
      "Add events you've approved",
      "Prepare briefs from your schedule",
    ],
    never: "Never adds or removes an event without asking.",
  },
  "google-drive": {
    headline: "Turn work into documents you can find later.",
    can: [
      "Save reports and notes to your Drive",
      "Update files it created earlier",
      "List what it has written for you",
    ],
    never: "Only ever touches files it created — never the rest of your Drive.",
  },
  github: {
    headline: "Stay on top of your repositories without opening them.",
    can: [
      "See your most recent repositories",
      "Review open issues",
      "Open an issue once you approve it",
    ],
    never: "Never writes code, merges, or deletes anything.",
  },
  slack: {
    headline: "Keep your team posted without you writing every message.",
    can: ["See your channels", "Draft an announcement", "Post it once you sign off"],
    never: "Never posts anything without your signature.",
  },
  notion: {
    headline: "Keep your notes and docs current as work happens.",
    can: [
      "Search the pages you've shared",
      "Create a page once you approve it",
      "Append notes to an existing page",
    ],
    never: "Only sees pages you explicitly share — never your whole workspace.",
  },
};

/** Fall back to something honest for a connector with no outcomes written yet. */
export const DEFAULT_OUTCOMES: ProviderOutcomes = {
  headline: "Let cosigno work in this app on your behalf.",
  can: [],
  never: "Anything that changes something waits for your approval.",
};

export function outcomesFor(key: string): ProviderOutcomes {
  return OUTCOMES[key] ?? DEFAULT_OUTCOMES;
}
