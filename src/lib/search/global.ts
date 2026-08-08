import { getStore } from "../store";
import { getProvider } from "../integrations/registry";
import { heroResult } from "../missions/today";

/**
 * One search across everything cosigno actually holds.
 *
 * Deliberately limited to what is real and already authorised: missions,
 * decisions waiting on you, connected apps, and files cosigno produced. It does
 * NOT reach into connected systems to search customers or invoices — doing that
 * would fire live API calls on every keystroke, and offering "Customers" to
 * someone with no CRM connected promises a category the product can't deliver.
 *
 * Results carry where they go and why they matched, so nothing in the list is
 * a dead end.
 */

export type ResultKind = "mission" | "decision" | "app" | "file" | "page";

export interface SearchResult {
  kind: ResultKind;
  /** What a person reads. */
  title: string;
  /** One line of context. */
  subtitle?: string;
  href: string;
  /** Connector key for a logo, when there is one. */
  providerKey?: string;
}

/** The fixed places in the workspace. Always searchable, never a dead end. */
const PAGES: Array<{ title: string; subtitle: string; href: string; terms: string }> = [
  { title: "Home", subtitle: "today's work", href: "/app", terms: "home dashboard today start" },
  { title: "Missions", subtitle: "everything cosigno is working on", href: "/app/missions", terms: "missions work jobs tasks" },
  { title: "Approvals", subtitle: "decisions waiting on you", href: "/app/approvals", terms: "approvals decisions sign waiting" },
  { title: "Activity", subtitle: "everything that has happened", href: "/app/activity", terms: "activity history log ledger audit" },
  { title: "Connections", subtitle: "the apps cosigno can work with", href: "/app/connections", terms: "connections apps integrations connect" },
  { title: "Files", subtitle: "what cosigno produced", href: "/app/files", terms: "files documents deliverables" },
  { title: "Monitoring", subtitle: "what is running right now", href: "/app/monitoring", terms: "monitoring live running" },
  { title: "Settings", subtitle: "your workspace", href: "/app/settings", terms: "settings account preferences" },
  {
    title: "What cosigno may do",
    subtitle: "permissions, limits, and what always needs you",
    href: "/app/trust",
    terms: "trust permissions security safety allow block never approve limit budget",
  },
];

/**
 * The four places worth offering before anyone has typed anything. Pinned, in
 * the sense that they never change and never need to be searched for — the
 * daily loop, one keystroke from anywhere.
 */
export const PINNED_PAGES: ReadonlyArray<{ title: string; subtitle: string; href: string }> = [
  { title: "Home", subtitle: "today's work", href: "/app" },
  { title: "Missions", subtitle: "everything cosigno is working on", href: "/app/missions" },
  { title: "Approvals", subtitle: "decisions waiting on you", href: "/app/approvals" },
  { title: "Connections", subtitle: "the apps cosigno can work with", href: "/app/connections" },
];

function matches(haystack: string, needle: string): boolean {
  return haystack.toLowerCase().includes(needle);
}

const WAITING = new Set(["awaiting_approval", "awaiting_input", "blocked"]);

export async function globalSearch(userId: string, rawQuery: string, limit = 12): Promise<SearchResult[]> {
  const q = rawQuery.trim().toLowerCase();
  if (!q) return [];

  const store = getStore();
  const [missions, actions, connections, files] = await Promise.all([
    store.listMissions(userId, 60).catch(() => []),
    store.listActions(userId, { status: "proposed", limit: 40 }).catch(() => []),
    store.listConnections(userId).catch(() => []),
    store.listFiles(userId).catch(() => []),
  ]);

  const results: SearchResult[] = [];

  // Decisions first: they are the only results that cost the reader something
  // by being missed.
  for (const a of actions) {
    if (!matches(a.summary, q)) continue;
    results.push({
      kind: "decision",
      title: a.summary,
      subtitle: "waiting for your approval",
      href: "/app/approvals",
    });
  }

  for (const m of missions) {
    // Match the goal OR what it actually achieved — people remember the
    // outcome ("issue #7") far more often than the words they typed.
    const hero = heroResult(m, undefined);
    if (!matches(m.goal, q) && !(hero && matches(hero, q))) continue;
    results.push({
      kind: "mission",
      title: hero ?? m.goal,
      subtitle: WAITING.has(m.state) ? "waiting on you" : hero ? m.goal : undefined,
      href: `/app/missions/${m.id}`,
    });
  }

  for (const c of connections) {
    if (c.status === "revoked") continue;
    if (!matches(c.display_name, q) && !matches(c.provider_key, q)) continue;
    results.push({
      kind: "app",
      title: c.display_name,
      subtitle:
        c.status === "connected"
          ? "connected"
          : c.status === "needs_reauth"
            ? "needs reconnecting"
            : "not responding",
      href: "/app/connections",
      ...(getProvider(c.provider_key) ? { providerKey: c.provider_key } : {}),
    });
  }

  for (const f of files) {
    if (!matches(f.name, q)) continue;
    results.push({ kind: "file", title: f.name, subtitle: "file cosigno produced", href: "/app/files" });
  }

  for (const p of PAGES) {
    if (!matches(p.title, q) && !matches(p.terms, q)) continue;
    results.push({ kind: "page", title: p.title, subtitle: p.subtitle, href: p.href });
  }

  return results.slice(0, limit);
}

/**
 * What the command bar offers before a single key is pressed: the decisions
 * waiting on you, then the missions you touched most recently.
 *
 * An empty search box is the most common state a command bar is ever in, so it
 * has to earn its screen. Showing what is already in front of you turns the
 * blank moment into the fastest path back to work — and everything here is a
 * real record, never a suggestion of something that doesn't exist.
 */
export async function recentResults(userId: string, limit = 7): Promise<SearchResult[]> {
  const store = getStore();
  const [missions, actions] = await Promise.all([
    store.listMissions(userId, 12).catch(() => []),
    store.listActions(userId, { status: "proposed", limit: 5 }).catch(() => []),
  ]);

  const results: SearchResult[] = actions.map((a) => ({
    kind: "decision" as const,
    title: a.summary,
    subtitle: "waiting for your approval",
    href: "/app/approvals",
  }));

  for (const m of missions) {
    if (results.length >= limit) break;
    const hero = heroResult(m, undefined);
    results.push({
      kind: "mission",
      title: hero ?? m.goal,
      subtitle: WAITING.has(m.state) ? "waiting on you" : hero ? m.goal : undefined,
      href: `/app/missions/${m.id}`,
    });
  }

  return results.slice(0, limit);
}
