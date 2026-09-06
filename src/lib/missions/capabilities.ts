import { getStore } from "../store";
import { TOOLS } from "./tools";
import { OPERATOR_PROFILES } from "./operators";
import { isLiveBrowser } from "../browser";
import { plannerConfigured } from "../agent/provider";

/**
 * The capability manifest — the single source of truth the compiler plans
 * against. It describes exactly what Cosigno can actually do right now:
 * which tools exist, which operators may run them, whether the browser is
 * live or sandbox, which connections are healthy, and which steps are
 * consequential + verifiable. A compiled plan may reference ONLY what appears
 * here; anything else is rejected as unsupported. This is how honesty is
 * enforced structurally — the model cannot invent a tool it doesn't have.
 */

export interface ToolCapability {
  id: string;
  operator: string;
  /** Does running it change the outside world? */
  consequential: boolean;
  /** Is there a verification method after it executes? */
  verifiable: boolean;
  /** Live (real connection/browser) vs sandbox (labeled fixtures). */
  live: boolean;
  summary: string;
}

export interface ConnectionCapability {
  provider_key: string;
  name: string;
  healthy: boolean;
}

export interface CapabilityManifest {
  tools: ToolCapability[];
  operators: { key: string; name: string; tools: string[] }[];
  connections: ConnectionCapability[];
  browser: { available: boolean; live: boolean };
  planner: boolean;
  limits: { maxToolCalls: number; maxBrowserActions: number; defaultBudgetCents: number };
}

/** One-line summaries for the registered tools (kept next to the registry). */
const TOOL_SUMMARY: Record<string, string> = {
  "calendar.find_event": "find an upcoming calendar event",
  "gmail.search_related": "search Gmail for related messages (read-only)",
  "drive.search_files": "search Drive for related files (read-only)",
  "analyze.extract": "extract commitments/decisions/questions from gathered material",
  "deliverable.brief": "write a meeting brief as a versioned file",
  "deliverable.agenda": "draft an agenda as a versioned file",
  "deliverable.followup": "draft a follow-up email as a versioned file (never sent)",
  "approval.offer_send": "offer a follow-up email for approval, then verify the send",
  "mission.receipt": "write the mission receipt",
  "browser.research": "research public pages through the browser (read-only)",
  "web.research": "research any subject on the open web — works out what to search for from the goal, opens the results, and records only what the pages showed (read-only)",
  "analyze.compare": "rank what the research found against the criteria in the goal",
  "deliverable.report": "write the findings up as a versioned report titled from the goal",
  "deliverable.write": "write a document from what this mission gathered and what you attached",
  "files.organize": "rename the workspace files so they read consistently (approval-gated; contents untouched)",
  "deliverable.comparison": "write a comparison deliverable as a versioned file",
  "browser.prepare_purchase": "prepare (never complete) a purchase for approval, then verify the stage",
  "laptop.confirm": "confirm the budget, requirements, and country",
  "laptop.search": "search allowed retailer sites for suitable products (read-only)",
  "laptop.review": "open one product page and record only what it actually shows",
  "laptop.compare": "compare the collected products against the requirements",
  "laptop.recommend": "pick the data-supported option and open its page (never buys)",
  "laptop.report": "save the versioned comparison report",
  "inbox.scan": "scan the inbox for newsletter clutter and waiting threads (read-only)",
  "inbox.summarize": "summarize the scan into what actually matters",
  "inbox.draft_replies": "draft replies for waiting threads (drafts never send)",
  "inbox.propose_cleanup": "offer the newsletter archive for approval, then verify by read-back",
  "followup.find": "find threads waiting on a response (read-only)",
  "followup.draft": "draft follow-ups and propose a conflict-checked send time (drafts never send)",
  "followup.offer_send": "offer a follow-up email for approval, send it, then verify in Sent Mail",
  "calendar.propose_reminder": "offer a calendar reminder for approval, then verify by read-back",
  "brief.calendar": "read the upcoming calendar (read-only)",
  "brief.signals": "read the overnight inbox signals (read-only)",
  "deliverable.daily_brief": "write the morning operator brief as a versioned file",
  "github.list_repos": "read your most recently pushed repositories (read-only)",
  "github.list_issues": "read open issues in a repository you name (read-only)",
  "github.propose_issue": "offer a new issue for approval, open it, then read it back",
};

/** Tools whose execution changes the outside world (need an approval gate). */
/**
 * Tools whose execution changes the outside world. The single source of truth
 * for "does this need a human decision" — the approval gate and the scope
 * contract both read it, so a tool can never be consequential to one and not
 * the other.
 */
const CONSEQUENTIAL_TOOLS = new Set([
  "files.organize",
  "github.propose_issue",
  "approval.offer_send",
  "browser.prepare_purchase",
  "inbox.propose_cleanup",
  "followup.offer_send",
  "calendar.propose_reminder",
]);
/** Tools with a post-execution verification hook. */
const VERIFIABLE_TOOLS = new Set([
  "files.organize",
  "github.propose_issue",
  "approval.offer_send",
  "browser.prepare_purchase",
  "inbox.propose_cleanup",
  "followup.offer_send",
  "calendar.propose_reminder",
]);
/** Tools that touch a real external provider when its connection is live. */
const PROVIDER_TOOL: Record<string, string> = {
  "calendar.find_event": "google-calendar",
  "gmail.search_related": "google",
  "drive.search_files": "google-drive",
  "inbox.scan": "google",
  "inbox.draft_replies": "google",
  "inbox.propose_cleanup": "google",
  "followup.find": "google",
  "followup.draft": "google",
  "followup.offer_send": "google",
  "brief.signals": "google",
  "brief.calendar": "google-calendar",
  "calendar.propose_reminder": "google-calendar",
  "github.list_repos": "github",
  "github.list_issues": "github",
  "github.propose_issue": "github",
};
/** Tools that use the browser service. */
const BROWSER_TOOLS = new Set([
  "browser.research",
  "web.research",
  "browser.prepare_purchase",
  "laptop.search",
  "laptop.review",
  "laptop.recommend",
]);

function operatorOfTool(toolId: string): string {
  for (const [key, p] of Object.entries(OPERATOR_PROFILES)) {
    if (p.tools.includes(toolId)) return key;
  }
  return "chief";
}

export async function buildCapabilityManifest(userId: string): Promise<CapabilityManifest> {
  let connections: ConnectionCapability[] = [];
  try {
    const conns = await getStore().listConnections(userId);
    connections = conns
      .filter((c) => c.kind === "app")
      .map((c) => ({
        provider_key: c.provider_key,
        name: c.display_name,
        healthy: c.status === "connected",
      }));
  } catch {
    connections = [];
  }

  const healthy = new Set(connections.filter((c) => c.healthy).map((c) => c.provider_key));
  const browserLive = isLiveBrowser();

  /**
   * Tools that need the AI operator to do their job at all.
   *
   * Withheld from the manifest — not merely marked unavailable — when no
   * planner is configured, because the manifest is what the compiler plans
   * against and what `validatePlan` checks. A tool that isn't here cannot be
   * planned, so a deployment without a planner can never produce a mission
   * step that would have had to invent its own output to complete. The goal
   * is refused up front with a reason instead.
   */
  const NEEDS_PLANNER = new Set(["deliverable.write"]);
  const plannerReady = plannerConfigured();

  const tools: ToolCapability[] = Object.keys(TOOLS)
    .filter((id) => plannerReady || !NEEDS_PLANNER.has(id))
    .map((id) => {
      const providerKey = PROVIDER_TOOL[id];
      const usesBrowser = BROWSER_TOOLS.has(id);
      const live = providerKey ? healthy.has(providerKey) : usesBrowser ? browserLive : true;
      return {
        id,
        operator: operatorOfTool(id),
        consequential: CONSEQUENTIAL_TOOLS.has(id),
        verifiable: VERIFIABLE_TOOLS.has(id),
        live,
        summary: TOOL_SUMMARY[id] ?? id,
      };
    });

  return {
    tools,
    operators: Object.values(OPERATOR_PROFILES).map((p) => ({
      key: p.key,
      name: p.name,
      tools: p.tools,
    })),
    connections,
    browser: { available: true, live: browserLive },
    planner: plannerConfigured(),
    limits: { maxToolCalls: 40, maxBrowserActions: 30, defaultBudgetCents: 200 },
  };
}

/** Does running this tool change something outside cosigno? */
export function isConsequentialTool(toolId: string): boolean {
  return CONSEQUENTIAL_TOOLS.has(toolId);
}
