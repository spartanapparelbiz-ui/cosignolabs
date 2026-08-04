import { beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryStore } from "../src/lib/store/memory";
import { compileMission } from "../src/lib/missions/compiler";
import { repoFromGoal, titleFromGoal } from "../src/lib/missions/githubTools";
import { TOOLS } from "../src/lib/missions/tools";
import { OPERATOR_PROFILES, operatorAllows } from "../src/lib/missions/operators";

/**
 * Regression cover for a real production failure: "list my github repositories"
 * compiled to the generic research shape, which handed the goal to the browser
 * operator, which — with no browser provider configured — answered with a
 * labeled sandbox storefront. The user asked for their repositories and was
 * shown example laptop listings.
 *
 * The GitHub connector was fine. It simply had no mission tool, so nothing
 * could ever route to it. These tests pin the routing and the boundary that
 * keeps reads automatic and writes gated.
 */

vi.mock("@/lib/auth", () => ({
  authConfigured: () => true,
  DEMO_USER_ID: "demo-user",
  getUserId: vi.fn(async () => "user-a"),
}));

beforeEach(() => {
  (globalThis as Record<string, unknown>).__cosignoStore = new MemoryStore();
});

describe("github goals route to the github connector, not the browser", () => {
  it("the exact goal that failed in production no longer reaches a browser tool", async () => {
    const r = await compileMission("user-a", "list my github repositories");

    expect(r.shape).toBe("github");
    const tools = r.plan.steps.map((s) => s.tool);
    expect(tools).toContain("github.list_repos");
    // The specific bug: any browser/laptop tool here means the sandbox
    // storefront is back.
    expect(tools.some((t) => t.startsWith("browser.") || t.startsWith("laptop."))).toBe(false);
  });

  it.each([
    "list my github repositories",
    "show me my repos",
    "what repositories do i have",
    "check open issues in owner/name",
    "review the issues on my repo",
  ])("routes %j to the github shape", async (goal) => {
    const r = await compileMission("user-a", goal);
    expect(r.shape).toBe("github");
  });

  it("does not hijack goals that merely mention unrelated work", async () => {
    expect((await compileMission("user-a", "compare the best laptops under $1,000")).shape).toBe(
      "product_compare"
    );
    expect((await compileMission("user-a", "prepare for my meeting tomorrow")).shape).toBe(
      "meeting_prep"
    );
  });
});

describe("reads stay automatic; the one write is gated", () => {
  it("listing repositories needs no approval — an approval gate on a read teaches click-through", async () => {
    const r = await compileMission("user-a", "list my github repositories");
    expect(r.plan.approvalCheckpoints).toHaveLength(0);
    expect(r.plan.riskSummary).toMatch(/read-only/i);
  });

  it("opening an issue is approval-gated and verified", async () => {
    const r = await compileMission("user-a", 'open an issue in owner/name titled "cosigno test"');

    expect(r.shape).toBe("github");
    expect(r.plan.steps.map((s) => s.tool)).toContain("github.propose_issue");
    expect(r.plan.approvalCheckpoints.join(" ")).toMatch(/approval/i);
    expect(r.plan.verificationRequirements.join(" ")).toMatch(/github\.propose_issue/);
  });

  it("the write tool only proposes — it exposes a verify hook for the post-approval read-back", () => {
    const tool = TOOLS["github.propose_issue"];
    expect(tool).toBeDefined();
    expect(typeof tool.verify).toBe("function");
  });

  it("proposes a connection_call, so approving it really opens the issue", async () => {
    const store = new MemoryStore();
    (globalThis as Record<string, unknown>).__cosignoStore = store;
    await store.createConnection({
      user_id: "user-a",
      kind: "app",
      provider_key: "github",
      display_name: "GitHub",
      status: "connected",
      auth_type: "oauth2",
      metadata: { account: "user-a" },
    } as never);

    const result = await TOOLS["github.propose_issue"].run({
      userId: "user-a",
      mission: { goal: 'open an issue in owner/name titled "cosigno test"' },
      steps: [],
      step: {},
    } as never);

    expect(result.kind).toBe("propose");
    if (result.kind !== "propose") throw new Error("expected a proposal");

    // post_content would execute as a sandbox simulation: the card flips to
    // "executed" and the audit trail records a publish that never happened.
    // connection_call is the only category that performs the real call.
    expect(result.category).toBe("connection_call");
    expect(result.category).not.toBe("post_content");
    expect(result.payload).toMatchObject({
      action: "create_issue",
      args: { repo: "owner/name", title: "cosigno test" },
    });
  });

  it("read tools have no verify hook, because they change nothing to verify", () => {
    expect(TOOLS["github.list_repos"].verify).toBeUndefined();
    expect(TOOLS["github.list_issues"].verify).toBeUndefined();
  });
});

describe("the code operator's boundary", () => {
  it("owns exactly the github tools and nothing else", () => {
    expect(OPERATOR_PROFILES.code.tools).toEqual([
      "github.list_repos",
      "github.list_issues",
      "github.propose_issue",
    ]);
  });

  it("cannot run browser or mail tools", () => {
    expect(operatorAllows("code", "browser.research")).toBe(false);
    expect(operatorAllows("code", "approval.offer_send")).toBe(false);
  });

  it("no other operator may run a github tool", () => {
    for (const [key, profile] of Object.entries(OPERATOR_PROFILES)) {
      if (key === "code") continue;
      expect(profile.tools.some((t) => t.startsWith("github."))).toBe(false);
    }
  });
});

describe("repoFromGoal — strict, because a wrong guess writes to a stranger's project", () => {
  it("extracts an owner/name pair", () => {
    expect(repoFromGoal("open an issue in spartanapparelbiz-ui/cosignolabs")).toBe(
      "spartanapparelbiz-ui/cosignolabs"
    );
    expect(repoFromGoal("check issues in foo.bar/baz-qux please")).toBe("foo.bar/baz-qux");
  });

  it("returns null rather than guessing when no repository is named", () => {
    expect(repoFromGoal("list my github repositories")).toBeNull();
    expect(repoFromGoal("open an issue about the login bug")).toBeNull();
  });

  it("does not treat a URL's host+path as a repository", () => {
    expect(repoFromGoal("read https://example.com/page")).toBeNull();
    expect(repoFromGoal("check www.example.com/some/path")).toBeNull();
  });

  it("reads owner/repo out of a github.com link, not the host", () => {
    expect(repoFromGoal("open an issue in https://github.com/owner/repo")).toBe("owner/repo");
    expect(repoFromGoal("https://www.github.com/owner/repo.git")).toBe("owner/repo");
    // The host must never be mistaken for the owner.
    expect(repoFromGoal("https://github.com/owner/repo")).not.toContain("github.com");
  });
});

describe("titleFromGoal", () => {
  it("prefers explicitly quoted text", () => {
    expect(titleFromGoal('open an issue in a/b titled "cosigno test"')).toBe("cosigno test");
    expect(titleFromGoal("open an issue titled 'fix the header'")).toBe("fix the header");
  });

  it("falls back to trailing text after 'titled'", () => {
    expect(titleFromGoal("open an issue in a/b titled fix the login bug")).toBe("fix the login bug");
  });

  it("returns null when no title is given, so the operator is asked", () => {
    expect(titleFromGoal("open an issue in a/b")).toBeNull();
  });
});
