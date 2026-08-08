import { describe, it, expect } from "vitest";
import { readdirSync, existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { loadingMessageFor, loadingTitleFor } from "@/lib/loadingMessages";
import { partOfDay, headline } from "@/lib/dashboard/greeting";
import { arrivals } from "@/lib/useNewItems";

/**
 * The loading experience is a product promise, not a detail: no page in the
 * workspace may open on a blank frame, and the line under the mark must
 * describe the page actually being opened. Both are cheap to break by adding a
 * route and forgetting, so both are pinned here.
 */

const APP_DIR = join(process.cwd(), "src", "app", "app");

/** Every directory under /app that renders a page. */
function routeDirs(dir: string, acc: string[] = []): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const full = join(dir, entry.name);
    if (existsSync(join(full, "page.tsx"))) acc.push(full);
    routeDirs(full, acc);
  }
  return acc;
}

describe("every workspace route has a loading state", () => {
  const dirs = [APP_DIR, ...routeDirs(APP_DIR)];

  it("finds the routes it means to check", () => {
    // A guard on the guard: if the walk silently found nothing, the assertion
    // below would pass while checking absolutely nothing.
    expect(dirs.length).toBeGreaterThan(20);
  });

  it("never opens a page on a blank frame", () => {
    const missing = dirs
      .filter((d) => !existsSync(join(d, "loading.tsx")))
      // A route that only redirects renders no page of its own.
      .filter((d) => !readFileSync(join(d, "page.tsx"), "utf8").includes('redirect("'));
    expect(missing.map((d) => d.replace(process.cwd(), ""))).toEqual([]);
  });
});

describe("contextual loading messages", () => {
  it("names the page actually being opened", () => {
    expect(loadingMessageFor("/app")).toBe("Preparing your workspace");
    expect(loadingMessageFor("/app/missions")).toBe("Finding today's work");
    expect(loadingMessageFor("/app/approvals")).toBe("Loading approvals");
    expect(loadingMessageFor("/app/connections")).toBe("Checking connected apps");
  });

  it("keeps a nested route on its own message, not its parent's", () => {
    // /app/settings/rules is a different job from /app/settings, and
    // /app/mission-control must not be swallowed by /app/missions.
    expect(loadingMessageFor("/app/settings/rules")).toBe("Loading your rules");
    expect(loadingMessageFor("/app/settings")).toBe("Opening your settings");
    expect(loadingMessageFor("/app/mission-control")).toBe("Tuning in to live work");
    expect(loadingMessageFor("/app/account/plan")).toBe("Loading your plan");
  });

  it("treats a dynamic child as its section", () => {
    expect(loadingMessageFor("/app/missions/abc-123")).toBe("Finding today's work");
  });

  it("ignores trailing slashes and query strings", () => {
    expect(loadingMessageFor("/app/activity/")).toBe(loadingMessageFor("/app/activity"));
    expect(loadingMessageFor("/app/activity?filter=work")).toBe(loadingMessageFor("/app/activity"));
  });

  it("is deterministic — the same route always says the same thing", () => {
    const first = loadingMessageFor("/app/connections");
    for (let i = 0; i < 20; i++) expect(loadingMessageFor("/app/connections")).toBe(first);
  });

  it("falls back rather than inventing a message for an unknown route", () => {
    // A new workspace page inherits the workspace line — still true of it —
    // and carries no heading until someone writes one, so a route added
    // tomorrow degrades to something honest instead of to a wrong label.
    expect(loadingMessageFor("/app/somewhere-new")).toBe("Preparing your workspace");
    expect(loadingTitleFor("/app/somewhere-new")).toBe("");
    // Outside the workspace there is nothing to inherit.
    expect(loadingMessageFor("/pricing")).toBe("One moment");
  });

  it("never says the word 'loading' on its own, and never trails an ellipsis", () => {
    // The component adds the animated dots; a message carrying its own would
    // render two sets. And "Loading..." is the generic state this replaced.
    for (const path of ["/app", "/app/missions", "/app/approvals", "/app/connections", "/app/activity"]) {
      const msg = loadingMessageFor(path);
      expect(msg.endsWith("…")).toBe(false);
      expect(msg.endsWith("...")).toBe(false);
      expect(msg.toLowerCase()).not.toBe("loading");
    }
  });
});

describe("the greeting", () => {
  it("changes with the visitor's own hour", () => {
    expect(partOfDay(0)).toBe("Good morning");
    expect(partOfDay(11)).toBe("Good morning");
    expect(partOfDay(12)).toBe("Good afternoon");
    expect(partOfDay(17)).toBe("Good afternoon");
    expect(partOfDay(18)).toBe("Good evening");
    expect(partOfDay(23)).toBe("Good evening");
  });
});

describe("the line under the greeting", () => {
  it("puts what needs the person before everything else", () => {
    // Even with work running and work finished, a waiting signature wins.
    expect(headline({ approvals: 2, working: 3, finished: 5 })).toBe(
      "2 things are waiting for your signature."
    );
  });

  it("counts in words a person uses", () => {
    expect(headline({ approvals: 1, working: 0, finished: 0 })).toBe(
      "One thing is waiting for your signature."
    );
    expect(headline({ approvals: 0, working: 1, finished: 0 })).toBe(
      "cosigno is working on one thing for you."
    );
    expect(headline({ approvals: 0, working: 4, finished: 0 })).toBe(
      "cosigno is working on 4 things for you."
    );
  });

  it("says the true thing when there is nothing to report", () => {
    expect(headline({ approvals: 0, working: 0, finished: 2 })).toBe("Everything from today is done.");
    expect(headline({ approvals: 0, working: 0, finished: 0 })).toBe(
      "Nothing needs your attention right now."
    );
  });

  it("never reports an absence as a failure", () => {
    const quiet = headline({ approvals: 0, working: 0, finished: 0 });
    expect(quiet).not.toMatch(/\bno\b|\bnone\b|empty|nothing yet/i);
  });
});

describe("only new work animates", () => {
  it("reports the arrivals and nothing else", () => {
    expect([...arrivals(new Set(["a", "b"]), ["a", "b", "c"])]).toEqual(["c"]);
  });

  it("reports nothing when the list is unchanged", () => {
    expect([...arrivals(new Set(["a", "b"]), ["a", "b"])]).toEqual([]);
  });

  it("does not treat a removal as an arrival", () => {
    expect([...arrivals(new Set(["a", "b"]), ["a"])]).toEqual([]);
  });

  it("treats a re-added id as new again", () => {
    expect([...arrivals(new Set(["a"]), ["a", "b"])]).toEqual(["b"]);
    expect([...arrivals(new Set(["a", "b"]), ["a", "b"])]).toEqual([]);
  });
});
