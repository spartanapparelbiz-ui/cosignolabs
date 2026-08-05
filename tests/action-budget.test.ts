import { beforeEach, describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { getStore } from "../src/lib/store";
import { MemoryStore } from "../src/lib/store/memory";
import {
  BUDGET_CHOICES,
  DEFAULT_ACTION_BUDGET,
  INCREASE_STEPS,
  MAX_ACTION_BUDGET,
  budgetSentence,
  budgetState,
  clampBudget,
  isExternalChange,
  limitFor,
  pausedReason,
} from "../src/lib/missions/budget";
import { missionBudget } from "../src/lib/missions/missionBudget";
import { advanceMission, controlMission } from "../src/lib/missions/engine";
import { CATEGORY_LIST, type ActionCategory, type ActionRecord, type ActionStatus } from "../src/lib/types";

/**
 * The action budget replaced a dollar figure nobody chose with a count of
 * things cosigno changed. These tests hold the line on what "a change" means —
 * the number is only useful if it counts the same things every time.
 */

const USER = "budget-user";

function freshStore(): MemoryStore {
  const store = new MemoryStore();
  (globalThis as unknown as { __cosignoStore?: unknown }).__cosignoStore = store;
  return store;
}

beforeEach(() => {
  freshStore();
});

let seq = 0;
function action(
  category: ActionCategory,
  status: ActionStatus,
  tier: 1 | 2 | 3 = 2
): ActionRecord {
  seq += 1;
  return {
    id: `a${seq}`,
    session_id: "s1",
    user_id: USER,
    category,
    tier,
    status,
    summary: `${category} ${seq}`,
    payload: {},
    result: null,
    veto_reason: null,
    injection_flag: false,
    tier_note: null,
    created_at: new Date().toISOString(),
    resolved_at: null,
  };
}

/* --------------------------------------------------- what counts as a change */

describe("what spends the budget", () => {
  it("charges for anything that leaves cosigno", () => {
    for (const c of ["send_email", "post_content", "update_record", "connection_call", "webhook", "spend", "refund", "payment", "delete"] as ActionCategory[]) {
      expect(isExternalChange(c)).toBe(true);
    }
  });

  it("never charges for reading, searching or drafting", () => {
    // The whole design rests on this: a limit that ticked down during research
    // would push people to set it high just to avoid interruptions, and stop
    // meaning anything at the moment it mattered.
    for (const c of ["search", "summarize", "draft"] as ActionCategory[]) {
      expect(isExternalChange(c)).toBe(false);
    }
  });

  it("has an answer for every category the engine has — a new one is never free by accident", () => {
    for (const meta of CATEGORY_LIST) {
      expect(typeof isExternalChange(meta.category)).toBe("boolean");
    }
    // A category nobody classified defaults to COUNTING, not to free.
    expect(isExternalChange("not_a_real_category" as ActionCategory)).toBe(true);
  });
});

/* --------------------------------------------------------- counting the spend */

describe("what a mission has spent", () => {
  it("counts executed changes, and nothing else", () => {
    const s = budgetState(
      [
        action("send_email", "executed"),
        action("search", "executed"),
        action("summarize", "executed"),
      ],
      10
    );
    expect(s.used).toBe(1);
    expect(s.remaining).toBe(9);
  });

  it("charges nothing for work you declined", () => {
    // Vetoing a suggestion must not consume the allowance you vetoed it to
    // protect.
    const s = budgetState(
      [action("send_email", "vetoed"), action("post_content", "failed")],
      5
    );
    expect(s.used).toBe(0);
    expect(s.committed).toBe(0);
    expect(s.exhausted).toBe(false);
  });

  it("reserves a slot for anything already waiting on you", () => {
    // Otherwise a mission proposes past its limit and approving them all takes
    // you over it.
    const s = budgetState([action("send_email", "proposed"), action("post_content", "approved")], 2);
    expect(s.used).toBe(0);
    expect(s.committed).toBe(2);
    expect(s.exhausted).toBe(true);
  });

  it("stops ON the limit, not past it", () => {
    const at = budgetState([action("send_email", "executed"), action("delete", "executed", 3)], 2);
    expect(at.exhausted).toBe(true);
    expect(at.remaining).toBe(0);
    const under = budgetState([action("send_email", "executed")], 2);
    expect(under.exhausted).toBe(false);
  });

  it("reports what kinds of change happened, for the receipt", () => {
    const s = budgetState(
      [action("send_email", "executed"), action("send_email", "executed"), action("delete", "executed", 3)],
      10
    );
    expect(s.kinds).toEqual(["Send email", "Delete"]);
  });

  it("counts how many changes you personally signed for", () => {
    const s = budgetState(
      [action("connection_call", "executed", 1), action("send_email", "executed", 2), action("delete", "executed", 3)],
      10
    );
    expect(s.approvals).toBe(2);
  });
});

/* ------------------------------------------------------------ which limit wins */

describe("which limit applies", () => {
  it("uses the mission's own limit when it has one", () => {
    expect(limitFor(7, 20)).toBe(7);
  });

  it("follows the workspace default when the mission never chose", () => {
    // Raising the default therefore lifts every mission that never overrode it,
    // rather than leaving them pinned to a number you've changed your mind about.
    expect(limitFor(null, 50)).toBe(50);
  });

  it("falls back to a real number rather than to nothing", () => {
    expect(limitFor(null, null)).toBe(DEFAULT_ACTION_BUDGET);
    expect(limitFor(undefined, undefined)).toBe(DEFAULT_ACTION_BUDGET);
  });

  it("never honors a limit outside what the engine can enforce", () => {
    expect(clampBudget(0)).toBe(1);
    expect(clampBudget(-5)).toBe(1);
    expect(clampBudget(1e9)).toBe(MAX_ACTION_BUDGET);
    expect(clampBudget(Number.NaN)).toBe(DEFAULT_ACTION_BUDGET);
    expect(clampBudget(7.9)).toBe(7);
  });

  it("offers only limits it will actually honor", () => {
    for (const n of BUDGET_CHOICES) expect(clampBudget(n)).toBe(n);
    for (const n of INCREASE_STEPS) expect(n).toBeGreaterThan(0);
  });
});

/* ------------------------------------------------------------- live, from data */

describe("a mission's live position", () => {
  it("is derived from the mission's own actions, never a stored counter", async () => {
    const store = getStore();
    const session = await store.createSession(USER, "goal");
    const mission = await store.createMission({
      user_id: USER,
      session_id: session.id,
      goal: "goal",
    });
    await store.setActionBudget(USER, 3);

    const a = await store.createAction({
      session_id: session.id,
      user_id: USER,
      category: "send_email",
      tier: 2,
      summary: "send",
      payload: {},
      injection_flag: false,
      tier_note: null,
    });
    await store.transitionAction(USER, a.id, "approved");
    await store.transitionAction(USER, a.id, "executing");
    await store.transitionAction(USER, a.id, "executed");

    const state = await missionBudget(USER, mission);
    expect(state.limit).toBe(3);
    expect(state.used).toBe(1);
    expect(state.exhausted).toBe(false);
  });

  it("lets a mission's own limit override the workspace default", async () => {
    const store = getStore();
    const session = await store.createSession(USER, "goal");
    const mission = await store.createMission({
      user_id: USER,
      session_id: session.id,
      goal: "goal",
    });
    await store.setActionBudget(USER, 50);
    await store.updateMission(USER, mission.id, { action_budget: 2 });
    const fresh = (await store.getMission(USER, mission.id))!;
    expect((await missionBudget(USER, fresh)).limit).toBe(2);
  });

  it("keeps one preference from clobbering another", async () => {
    const store = getStore();
    await store.setActionBudget(USER, 50);
    await store.setMemoryEnabled(USER, false);
    const prefs = await store.getPrefs(USER);
    expect(prefs.action_budget).toBe(50);
    expect(prefs.memory_enabled).toBe(false);
  });
});

/* ----------------------------------------------------------------- the wording */

describe("how the number is said", () => {
  it("never mentions money", () => {
    const s = budgetState([action("send_email", "executed")], 10);
    for (const text of [budgetSentence(s), pausedReason(s)]) {
      expect(text).not.toMatch(/\$|cent|cost|dollar/i);
    }
  });

  it("says nothing changed rather than showing a zero", () => {
    expect(budgetSentence(budgetState([], 10))).toMatch(/nothing changed yet/);
  });

  it("explains a stop as a decision, not a fault", () => {
    const s = budgetState([action("send_email", "executed"), action("delete", "executed", 3)], 2);
    expect(pausedReason(s)).toMatch(/allowed to change/);
    expect(pausedReason(s)).not.toMatch(/error|fail|problem/i);
  });
});

/* ------------------------------------------------------ the engine, end to end */

describe("a mission that runs out", () => {
  /** A mission with one runnable step and `spent` changes already executed. */
  async function missionAt(spent: number, limit: number) {
    const store = getStore();
    const session = await store.createSession(USER, "goal");
    const mission = await store.createMission({
      user_id: USER,
      session_id: session.id,
      goal: "goal",
    });
    await store.updateMission(USER, mission.id, { action_budget: limit });
    await store.createMissionSteps([
      {
        mission_id: mission.id,
        user_id: USER,
        idx: 0,
        purpose: "write the mission receipt",
        operator: "chief",
        tool: "mission.receipt",
        depends_on: [],
      },
    ]);
    for (let i = 0; i < spent; i += 1) {
      const a = await store.createAction({
        session_id: session.id,
        user_id: USER,
        category: "send_email",
        tier: 2,
        summary: `send ${i}`,
        payload: {},
        injection_flag: false,
        tier_note: null,
      });
      await store.transitionAction(USER, a.id, "approved");
      await store.transitionAction(USER, a.id, "executing");
      await store.transitionAction(USER, a.id, "executed");
    }
    return mission.id;
  }

  it("stops itself, and says why in words about changes", async () => {
    const id = await missionAt(2, 2);
    const mission = (await advanceMission(USER, id))!.mission;
    expect(mission.state).toBe("paused");
    expect(mission.error).toMatch(/changed 2 things/);
    // The step it was about to run never ran.
    const steps = await getStore().listMissionSteps(USER, id);
    expect(steps[0].state).toBe("ready");
  });

  it("carries on when there is room left", async () => {
    const id = await missionAt(1, 5);
    const mission = (await advanceMission(USER, id))!.mission;
    expect(mission.state).not.toBe("paused");
  });

  it("cannot be restarted by resume alone", async () => {
    const id = await missionAt(2, 2);
    await advanceMission(USER, id);
    const after = await controlMission(USER, id, "resume");
    expect(after?.state).toBe("paused");
  });

  it("moves again once it is given more room", async () => {
    const store = getStore();
    const id = await missionAt(2, 2);
    await advanceMission(USER, id);
    await store.updateMission(USER, id, { action_budget: 5, state: "queued", error: null });
    const mission = (await advanceMission(USER, id))!.mission;
    expect(mission.state).not.toBe("paused");
  });
});

/* ------------------------------------------------------- enforcement + surfaces */

const ENGINE = readFileSync("src/lib/missions/engine.ts", "utf8");
const WORKSPACE = readFileSync("src/components/app/MissionWorkspace.tsx", "utf8");
const CONTROL = readFileSync("src/components/app/MissionControl.tsx", "utf8");
const ROUTE = readFileSync("src/app/api/missions/[id]/budget/route.ts", "utf8");
const RECEIPT = readFileSync("src/lib/missions/tools.ts", "utf8");

describe("the engine actually stops", () => {
  it("checks the budget before running a step, and pauses rather than failing", () => {
    expect(ENGINE).toMatch(/const budget = await missionBudget\(userId, mission\)/);
    expect(ENGINE).toMatch(/if \(budget\.exhausted\) \{[\s\S]*?state: "paused"/);
  });

  it("keeps the internal tool-call cap — the budget replaces what was SHOWN, not what protects the engine", () => {
    expect(ENGINE).toMatch(/mission\.budget_cents \/ 5/);
    expect(ENGINE).toMatch(/mission\.tool_calls >= maxToolCalls/);
  });

  it("won't let plain resume restart a mission that ran out", () => {
    // It would pause again on the very next pass — a button that does nothing.
    expect(ENGINE).toMatch(/if \(budget\.exhausted\) return mission;/);
  });
});

describe("giving a mission more room", () => {
  it("is additive — 'ten more', never 'set it to thirty'", () => {
    expect(ROUTE).toMatch(/before\.limit \+ add/);
  });

  it("raises only this mission, never the workspace default", () => {
    expect(ROUTE).toMatch(/updateMission\(userId, id, \{ action_budget: raised \}\)/);
    expect(ROUTE).not.toMatch(/setActionBudget/);
  });

  it("restarts a mission only if this is why it stopped", () => {
    expect(ROUTE).toMatch(/state === "paused" && before\.exhausted/);
  });

  it("rate-limits and records the change", () => {
    expect(ROUTE).toMatch(/enforceLimit\("transitionMinute", userId\)/);
    expect(ROUTE).toMatch(/logAudit\(userId, "budget_raised"/);
  });

  it("says so plainly when there is no more room to give", () => {
    expect(ROUTE).toMatch(/budget_at_maximum/);
  });
});

describe("what the surfaces show", () => {
  it("shows changes against a limit, never a dollar figure", () => {
    expect(WORKSPACE).not.toMatch(/budget_cents/);
    expect(CONTROL).not.toMatch(/budget_cents/);
    expect(CONTROL).toMatch(/changes made/);
  });

  it("stopped-for-budget offers more room and a way to finish, not a dead end", () => {
    expect(WORKSPACE).toMatch(/INCREASE_STEPS\.map/);
    expect(WORKSPACE).toMatch(/that&apos;s enough — finish here/);
  });

  it("no longer calls internal tool calls 'actions taken'", () => {
    // They include reads. Calling them actions was the same category error the
    // dollar cap made.
    expect(WORKSPACE).not.toMatch(/tool_calls\} action/);
  });

  it("puts changes, approvals and apps on the receipt — not cost", () => {
    expect(RECEIPT).toMatch(/changes: \{ made: budget\.used, allowed: budget\.limit, kinds: budget\.kinds \}/);
    expect(RECEIPT).toMatch(/approvals: budget\.approvals/);
    expect(RECEIPT).toMatch(/apps: collectApps\(ctx\)/);
  });
});
