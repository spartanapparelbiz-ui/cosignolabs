/**
 * Operator runtime profiles — REAL execution boundaries the mission engine
 * enforces, not presentation labels. A step may only run a tool its operator
 * profile lists; runtime is clamped to the profile's budget; retries follow
 * the profile's policy. Profiles never grant approval: any consequential
 * output still goes through the action-card door.
 */

export interface OperatorProfile {
  key: string;
  name: string;
  /** One plain sentence of responsibility. */
  responsibility: string;
  /** Tool ids this operator may run — the engine refuses anything else. */
  tools: string[];
  /** Hard per-step runtime clamp (ms). */
  maxRuntimeMs: number;
  /** Default retry allowance for this operator's steps. */
  maxRetries: number;
  /** What this operator can never do — shown in the UI, enforced by tools. */
  never: string;
}

export const OPERATOR_PROFILES: Record<string, OperatorProfile> = {
  calendar: {
    key: "calendar",
    name: "Calendar Operator",
    responsibility: "finds events, availability, and conflicts.",
    tools: ["calendar.find_event", "brief.calendar", "calendar.propose_reminder"],
    maxRuntimeMs: 20_000,
    maxRetries: 2,
    never: "creates, modifies, or cancels events without an approved card.",
  },
  communication: {
    key: "communication",
    name: "Communication Operator",
    responsibility: "reads permitted conversations and prepares messages.",
    tools: [
      "gmail.search_related",
      "deliverable.followup",
      "approval.offer_send",
      "inbox.scan",
      "inbox.draft_replies",
      "inbox.propose_cleanup",
      "followup.find",
      "followup.draft",
      "followup.offer_send",
      "brief.signals",
    ],
    maxRuntimeMs: 25_000,
    maxRetries: 2,
    never: "sends anything — sending always waits on an approved card.",
  },
  files: {
    key: "files",
    name: "File Operator",
    responsibility: "inspects approved files and writes mission deliverables.",
    tools: ["drive.search_files", "deliverable.brief", "deliverable.agenda", "deliverable.comparison", "deliverable.daily_brief", "deliverable.report", "laptop.report"],
    maxRuntimeMs: 25_000,
    maxRetries: 2,
    never: "deletes or shares externally without an approved card.",
  },
  browser: {
    key: "browser",
    name: "Browser Operator",
    responsibility: "researches public pages and prepares (never completes) web actions.",
    tools: ["browser.research", "web.research", "browser.prepare_purchase", "laptop.search", "laptop.review"],
    maxRuntimeMs: 60_000,
    maxRetries: 2,
    never: "submits forms, purchases, or changes account settings without an approved card.",
  },
  research: {
    key: "research",
    name: "Research Operator",
    responsibility: "compares evidence and produces structured findings with sources.",
    tools: ["analyze.extract", "analyze.compare", "inbox.summarize", "laptop.compare", "laptop.recommend"],
    maxRuntimeMs: 45_000,
    maxRetries: 1,
    never: "sends, purchases, publishes, or modifies external data.",
  },
  code: {
    key: "code",
    name: "Code Operator",
    responsibility: "reads repositories and issues, and prepares (never opens) new issues.",
    tools: ["github.list_repos", "github.list_issues", "github.propose_issue"],
    maxRuntimeMs: 25_000,
    maxRetries: 2,
    never: "opens issues, comments, or writes code without an approved card.",
  },
  chief: {
    key: "chief",
    name: "Chief Operator",
    responsibility: "sequences the work, detects blockers, and closes the mission.",
    tools: ["mission.receipt", "laptop.confirm"],
    maxRuntimeMs: 15_000,
    maxRetries: 1,
    never: "grants itself new permissions.",
  },
};

/** True when this operator profile permits this tool. */
export function operatorAllows(operator: string, tool: string): boolean {
  return OPERATOR_PROFILES[operator]?.tools.includes(tool) ?? false;
}
