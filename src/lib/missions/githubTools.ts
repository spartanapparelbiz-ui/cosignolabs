import { getStore } from "../store";
import { runProviderAction } from "../integrations/runtime/connections";
import { detectInjection } from "../agent/untrusted";
import type { ActionRecord } from "../types";
import type { MissionTool, ToolContext, ToolResult } from "./tools";

/**
 * GitHub mission tools.
 *
 * The GitHub connector could be connected but never USED: the mission engine
 * had no `github.*` tool at all, so a goal naming GitHub fell through the
 * compiler's classifier to the generic research shape and was answered by the
 * browser operator — which, with no browser provider configured, read a
 * labeled sandbox storefront. Asking for repositories and receiving example
 * laptop listings is the exact failure mode the honesty rules exist to
 * prevent, so the routing is real now rather than approximated.
 *
 * Same contract as every other connector-backed tool here:
 *
 *  · A tool runs against a REAL connection or it fails saying so. There is no
 *    GitHub sandbox — inventing repository names would be worse than an error.
 *  · Reads run automatically. `create_issue` mutates a system outside cosigno,
 *    so it is only ever PROPOSED: the real call happens in verify(), after the
 *    card was approved, and the result is read back as evidence.
 *  · Repository names, issue titles, and issue bodies are UNTRUSTED text.
 *    They are carried as data and scanned for injection; they can never
 *    authorize a tool.
 */

const TIMEOUT_MS = 20_000;

async function githubConnection(userId: string) {
  const connections = await getStore().listConnections(userId);
  return (
    connections.find(
      (c) => c.kind === "app" && c.provider_key === "github" && c.status === "connected"
    ) ?? null
  );
}

/**
 * Every GitHub tool needs a live connection. Failing loudly here is the whole
 * point: the alternative — substituting fixtures — is what produced the
 * sandbox-storefront bug.
 */
function notConnected(): never {
  throw new Error(
    "GitHub isn't connected. Open connections and connect it, then run this again. Nothing was read or changed."
  );
}

/** owner/name, the only shape the GitHub API routes accept. */
const REPO_RE = /^[\w.-]+\/[\w.-]+$/;

/**
 * Pull a repository out of the goal text. Deliberately strict: a wrong guess
 * would send an issue to somebody else's project, so an unparseable goal asks
 * the operator rather than picking a repository on their behalf.
 */
export function repoFromGoal(goal: string): string | null {
  // A github.com link is an unambiguous statement of intent, so read it first
  // and take owner/repo from the PATH — a bare word-boundary match on the raw
  // text would happily return "github.com/owner" instead.
  const link = /https?:\/\/(?:www\.)?github\.com\/([\w.-]+)\/([\w.-]+)/i.exec(goal);
  if (link) return `${link[1]}/${link[2].replace(/\.git$/i, "")}`;

  // Otherwise strip every URL before matching. Without this, "read
  // https://example.com/page" yields "example.com/page", because \b sits
  // between "//" and "example" and hides the scheme from any later check.
  const withoutUrls = goal.replace(/https?:\/\/\S+|\bwww\.\S+/gi, " ");

  const match = /\b([\w.-]+\/[\w.-]+)\b/.exec(withoutUrls);
  if (!match) return null;
  const candidate = match[1];
  if (!REPO_RE.test(candidate)) return null;
  return candidate;
}

/**
 * Ask the operator which repository, rather than guessing. Naming a repository
 * on someone's behalf could file an issue on a stranger's project.
 */
function askForRepo(why: string): ToolResult {
  return {
    kind: "question",
    question: {
      question: "Which repository? give it as owner/name.",
      why,
      options: [],
      effect: "Cosigno will use exactly the repository you name, and no other.",
    },
  };
}

/** Title for a proposed issue, from the goal's quoted text when present. */
export function titleFromGoal(goal: string): string | null {
  const quoted = /["“”'']([^"“”'']{3,120})["“”'']/.exec(goal);
  if (quoted) return quoted[1].trim();
  const titled = /\btitled?\s+(.{3,120})$/i.exec(goal.trim());
  if (titled) return titled[1].trim().replace(/[.]+$/, "");
  return null;
}

/** github.list_repos — read-only, runs automatically. */
const listRepos: MissionTool = {
  id: "github.list_repos",
  timeoutMs: TIMEOUT_MS,
  async run(ctx: ToolContext): Promise<ToolResult> {
    const conn = await githubConnection(ctx.userId);
    if (!conn) notConnected();

    const res = await runProviderAction(ctx.userId, conn.id, "list_repos", {});
    if (!res.ok) throw new Error(res.summary);

    const repos = Array.isArray(res.detail?.repos)
      ? (res.detail.repos as unknown[]).filter((r): r is string => typeof r === "string")
      : [];

    return {
      kind: "ok",
      // Name them. "read 5 repositories" answers a question nobody asked —
      // the goal was to SEE the list, and the names are already in hand.
      summary: repos.length
        ? `your ${repos.length} most recently pushed repositories: ${repos.join(", ")}.`
        : "Your GitHub account has no repositories cosigno can see.",
      output: { repos },
      sources: [
        {
          name: "GitHub",
          detail: `${String(conn.metadata?.account ?? "your account")} · most recently pushed repositories`,
          simulated: false,
        },
      ],
    };
  },
};

/** github.list_issues — read-only, runs automatically. */
const listIssues: MissionTool = {
  id: "github.list_issues",
  timeoutMs: TIMEOUT_MS,
  async run(ctx: ToolContext): Promise<ToolResult> {
    const conn = await githubConnection(ctx.userId);
    if (!conn) notConnected();

    const repo = repoFromGoal(ctx.mission.goal);
    if (!repo) return askForRepo("cosigno needs to know which repository to read.");

    const res = await runProviderAction(ctx.userId, conn.id, "list_issues", { repo });
    if (!res.ok) throw new Error(res.summary);

    const issues = Array.isArray(res.detail?.issues)
      ? (res.detail.issues as unknown[]).filter((i): i is string => typeof i === "string")
      : [];

    // Issue titles are attacker-writable on any public repository.
    const flagged = detectInjection(issues.join("\n"));

    return {
      kind: "ok",
      summary: issues.length
        ? `${issues.length} open issue${issues.length === 1 ? "" : "s"} in ${repo}: ${issues.join("; ")}.`
        : `${repo} has no open issues.`,
      output: { repo, issues, injection_flagged: flagged },
      sources: [{ name: "GitHub", detail: `${repo} · open issues`, simulated: false }],
    };
  },
};

/**
 * github.propose_issue — the one tool here that changes anything.
 *
 * run() only PROPOSES. Nothing reaches GitHub until the operator approves the
 * card; the real write happens in verify() and is read back for evidence.
 */
const proposeIssue: MissionTool = {
  id: "github.propose_issue",
  timeoutMs: TIMEOUT_MS,
  async run(ctx: ToolContext): Promise<ToolResult> {
    const conn = await githubConnection(ctx.userId);
    if (!conn) notConnected();

    const repo = repoFromGoal(ctx.mission.goal);
    if (!repo) return askForRepo("cosigno will not choose a repository to write to on your behalf.");

    const title = titleFromGoal(ctx.mission.goal);
    if (!title) {
      return {
        kind: "question",
        question: {
          question: "what should the issue be titled?",
          why: "The title is what everyone watching the repository will see.",
          options: [],
          effect: "Cosigno proposes an issue with exactly this title, for your approval.",
        },
      };
    }

    // `connection_call` is the ONE category that performs a real provider call
    // when the card is approved. The obvious-looking alternative, post_content,
    // executes as a sandbox simulation — the card would flip to "executed" and
    // the audit trail would record a publish that never happened, with the real
    // write smuggled into verify() afterwards. A receipt that precedes the act
    // is exactly the kind of lie this product exists to prevent.
    //
    // connection_call is `plannerSelectable: false`, which holds here: this
    // payload is built deterministically from the parsed goal and the user's
    // own connection, never chosen by a model.
    return {
      kind: "propose",
      category: "connection_call",
      summary: `Open issue “${title}” in ${repo}`,
      payload: {
        kind: "provider",
        connection_id: conn.id,
        action: "create_issue",
        args: { repo, title },
      },
    };
  },

  /**
   * The issue already exists by the time this runs — approval performed the
   * write. This is the read-back: independent confirmation from GitHub that
   * the issue is really there, rather than trusting the write's own response.
   */
  async verify(ctx: ToolContext, action: ActionRecord): Promise<Record<string, unknown>> {
    const payload = (action.payload ?? {}) as { args?: { repo?: string; title?: string } };
    const repo = String(payload.args?.repo ?? "");
    const title = String(payload.args?.title ?? "");
    if (!REPO_RE.test(repo) || !title) {
      return { verified: false, detail: "The approved card was missing a repository or title." };
    }

    const conn = await githubConnection(ctx.userId);
    if (!conn) {
      return { verified: false, detail: "GitHub was disconnected before the issue could be confirmed." };
    }

    const res = await runProviderAction(ctx.userId, conn.id, "list_issues", { repo });
    if (!res.ok) return { verified: false, detail: `couldn't read ${repo} back: ${res.summary}` };

    const issues = Array.isArray(res.detail?.issues)
      ? (res.detail.issues as unknown[]).filter((i): i is string => typeof i === "string")
      : [];
    const match = issues.find((i) => i.includes(title));

    return match
      ? { verified: true, detail: `confirmed on GitHub: ${match} in ${repo}.` }
      : {
          verified: false,
          detail: `the card executed, but no open issue titled “${title}” is visible in ${repo}.`,
        };
  },
};

export const GITHUB_TOOLS: Record<string, MissionTool> = {
  [listRepos.id]: listRepos,
  [listIssues.id]: listIssues,
  [proposeIssue.id]: proposeIssue,
};
