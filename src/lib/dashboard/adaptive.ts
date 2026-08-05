import { getStore } from "../store";
import { getProvider, listProviderMeta } from "../integrations/registry";
import { describeConnection } from "../integrations/engine/describe";
import type { DiscoveredFact } from "../integrations/types";
import type { MissionRecord } from "../types";
import { toProgressive } from "../missions/narrate";

/**
 * A dashboard built from what a company actually connected.
 *
 * No fixed widget list. An engineering shop that connected GitHub sees
 * repositories and open issues; a company that connected nothing sees
 * invitations explaining what each app would show them. The layout is a
 * consequence of reality rather than a template reality has to fit.
 *
 * The rule that shapes everything here: an unconnected app produces an
 * INVITATION, never a metric. "Revenue $0" reads as a measurement of an empty
 * business — it answers a question nobody asked with a number that isn't true.
 * "Connect Stripe to track revenue here" answers the real question, which is
 * why the number is missing.
 */

export interface DashboardPanel {
  key: string;
  name: string;
  /** Connector key for the logo. */
  providerKey: string | null;
  /** Measured facts. Empty when this connection can't be inventoried. */
  facts: DiscoveredFact[];
  /** Why there are no facts, in plain language. Never shown alongside facts. */
  note: string | null;
  /**
   * What is happening in this app right now, and where to go look.
   *
   * An app panel that only shows counts answers "how much is in here" and
   * leaves "what is going on in here" — the question someone actually opens
   * the page with — unanswered. Absent when nothing is running, rather than
   * filled with "idle": a panel that says idle while a mission is quietly
   * waiting on a decision is worse than one that says nothing.
   */
  activity?: { text: string; href: string };
}

export interface DashboardInvitation {
  providerKey: string;
  name: string;
  /** "revenue, refunds and customer payments" */
  tracks: string;
  /** False when the deployment has no credentials for it — it can't be connected yet. */
  available: boolean;
}

export interface AdaptiveDashboard {
  panels: DashboardPanel[];
  invitations: DashboardInvitation[];
  /** Plain-English sentences. Never a score. */
  health: string[];
}

/** "a, b and c" — the way a person lists things. */
function sentenceList(items: string[]): string {
  if (items.length === 0) return "";
  if (items.length === 1) return items[0];
  return `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`;
}

/**
 * How the business is doing, as sentences.
 *
 * Deliberately not a score. A number out of 100 implies a measurement nobody
 * took, and invites the reader to watch it instead of reading what it says.
 * Every line here is a statement about something real: a connection that
 * stopped working, a decision that is blocking work, an app that needs
 * re-authorising.
 */
function healthLines(
  panels: DashboardPanel[],
  broken: Array<{ name: string; status: string }>,
  waitingCount: number
): string[] {
  const lines: string[] = [];

  for (const b of broken) {
    lines.push(
      b.status === "needs_reauth"
        ? `${b.name} needs reconnecting — cosigno can't use it until you do.`
        : `${b.name} isn't responding. cosigno will keep trying.`
    );
  }

  if (waitingCount > 0) {
    lines.push(
      waitingCount === 1
        ? "1 decision is waiting on you before work can continue."
        : `${waitingCount} decisions are waiting on you before work can continue.`
    );
  }

  // Only claim everything is fine when there is something to be fine ABOUT.
  // "Everything looks healthy" on a workspace with nothing connected is a
  // reassuring sentence about nothing.
  if (lines.length === 0 && panels.length > 0) {
    lines.push("Everything looks healthy.");
  }

  return lines;
}

const WAITING_STATES = new Set(["awaiting_approval", "awaiting_input", "blocked"]);
const RUNNING_STATES = new Set(["queued", "running", "retrying", "verifying"]);

/** Tool prefix → the connector it runs against, for matching work to a panel. */
const PROVIDER_FOR_TOOL_PREFIX: Record<string, string> = {
  github: "github",
  gmail: "google",
  inbox: "google",
  followup: "google",
  approval: "google",
  brief: "google",
  calendar: "google-calendar",
  drive: "google-drive",
};

export async function buildAdaptiveDashboard(userId: string): Promise<AdaptiveDashboard> {
  const store = getStore();
  const [connections, missions] = await Promise.all([
    store.listConnections(userId),
    store.listMissions(userId, 50).catch((): MissionRecord[] => []),
  ]);

  const live = connections.filter((c) => c.status !== "revoked");

  // Describe every live connection through the one connector engine, so a
  // custom API or MCP server appears here exactly like a built-in.
  const described = await Promise.all(
    live.map((c) => describeConnection(userId, c.id).catch(() => null))
  );

  // What each app is busy with, from live missions. Built once, then matched
  // to panels by provider key.
  const activityByProvider = new Map<string, { text: string; href: string }>();
  const liveMissions = missions.filter(
    (m) => RUNNING_STATES.has(m.state) || WAITING_STATES.has(m.state)
  );
  for (const m of liveMissions.slice(0, 10)) {
    const steps = await store.listMissionSteps(userId, m.id).catch(() => []);
    for (const step of steps) {
      const busy = ["running", "verifying", "retrying"].includes(step.state);
      const waiting = ["awaiting_approval", "awaiting_input"].includes(step.state);
      if (!busy && !waiting) continue;
      const key = PROVIDER_FOR_TOOL_PREFIX[step.tool.split(".")[0]];
      if (!key || activityByProvider.has(key)) continue;
      activityByProvider.set(key, {
        text: waiting ? "waiting on your decision" : toProgressive(step.purpose),
        href: `/app/missions/${m.id}`,
      });
    }
  }

  const panels: DashboardPanel[] = [];
  for (const model of described) {
    if (!model) continue;
    panels.push({
      key: model.connectionId,
      name: model.name,
      providerKey: model.source === "custom" || model.source === "mcp" ? null : model.source,
      facts: model.facts,
      // A panel shows facts OR a reason, never both and never neither.
      note: model.facts.length > 0 ? null : (model.discoveryError ?? model.limitations[0] ?? null),
      ...(activityByProvider.get(model.source)
        ? { activity: activityByProvider.get(model.source)! }
        : {}),
    });
  }

  // Apps not connected become invitations naming what they would show.
  const connectedKeys = new Set(live.map((c) => c.provider_key));
  const invitations: DashboardInvitation[] = [];
  for (const meta of listProviderMeta()) {
    if (connectedKeys.has(meta.key)) continue;
    const provider = getProvider(meta.key);
    const tracks = provider?.tracks ?? [];
    // Nothing to promise → no invitation. An invitation that can't say what it
    // would give you is just an advert.
    if (tracks.length === 0) continue;
    invitations.push({
      providerKey: meta.key,
      name: meta.name,
      tracks: sentenceList(tracks),
      available: meta.configured,
    });
  }

  const broken = live
    .filter((c) => c.status === "needs_reauth" || c.status === "error")
    .map((c) => ({ name: c.display_name, status: c.status }));

  const waitingCount = missions.filter((m) => WAITING_STATES.has(m.state)).length;

  return { panels, invitations, health: healthLines(panels, broken, waitingCount) };
}
