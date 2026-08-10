import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

/**
 * Approving used to require leaving the page: home and the mission views both
 * showed a card and then sent you to /app/approvals to act on it. The trip was
 * the only thing between an operator and a decision they had already made.
 *
 * The inbox is now embedded in all three places. The property that matters is
 * SCOPING: an embedded inbox on a mission must offer only that mission's own
 * cards, or approving beside one piece of work could sign off a neighbouring
 * mission's action that merely happened to be in the shared queue.
 */

const read = (p: string) => readFileSync(p, "utf8");

const HOME = "src/components/app/home/OperatorHome.tsx";
const WORKSPACE = "src/components/app/MissionWorkspace.tsx";
const RUNNER = "src/components/app/MissionRunner.tsx";
const INBOX = "src/components/app/DecisionInbox.tsx";

describe("approvals are actionable where the work is", () => {
  it.each([
    ["home", HOME],
    ["the mission workspace", WORKSPACE],
    ["the missions list", RUNNER],
  ])("%s embeds the real decision inbox", (_label, path) => {
    const src = read(path);
    expect(src).toContain("DecisionInbox");
  });

  it.each([
    ["the mission workspace", WORKSPACE],
    ["the missions list", RUNNER],
  ])("%s scopes the inbox to that mission's own cards", (_label, path) => {
    const src = read(path);
    // `only` is what prevents an approval here from reaching another
    // mission's pending card.
    expect(src).toMatch(/<DecisionInbox[^>]*only=/s);
  });

  it("no longer sends people to another page to make the decision", () => {
    for (const path of [HOME, WORKSPACE, RUNNER]) {
      const src = read(path);
      // A link to the approvals page is fine to keep elsewhere; what must be
      // gone is it being the ONLY way to act on a waiting card.
      const linkIsTheOnlyAction =
        src.includes('href="/app/approvals"') && !src.includes("DecisionInbox");
      expect(linkIsTheOnlyAction).toBe(false);
    }
  });
});

describe("the embedded inbox stays honest about the shared queue", () => {
  it("filters at render, so it never fetches a different queue than the approvals page", () => {
    const src = read(INBOX);
    // One fetch, one source of truth: scoping is a view concern.
    expect(src).toContain('jsonFetch("/api/actions?status=proposed&limit=200")');
    expect(src).toMatch(/const visible = only \? actions\.filter/);
  });

  it("renders nothing rather than an empty-state when embedded", () => {
    const src = read(INBOX);
    expect(src).toContain("emptyFallback");
    expect(src).toMatch(/if \(emptyFallback !== undefined\) return/);
  });

  it("counts and empties off the scoped list, not the full queue", () => {
    const src = read(INBOX);
    // A count taken from `actions` would tell a mission it has decisions
    // waiting that belong to something else entirely.
    expect(src).toMatch(/\{visible\.length\} decision/);
    expect(src).toMatch(/if \(visible\.length === 0\)/);
    expect(src).toMatch(/\{visible\.map\(/);
  });
});
