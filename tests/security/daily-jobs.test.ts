import { beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryStore } from "../../src/lib/store/memory";
import { resetRateLimitsForTests } from "../../src/lib/ratelimit";
import { advanceMission } from "../../src/lib/missions/engine";
import { approveAction, vetoAction } from "../../src/lib/actions/engine";
import {
  createDailyBriefMission,
  createFollowupsMission,
  createInboxCleanupMission,
} from "../../src/lib/missions/dailyJobs";

/**
 * The three daily Gmail + Calendar jobs, end-to-end through the real engine on
 * the labeled sandbox. Proves: reads and drafts run automatically but every
 * send/archive/schedule stops on an approval card; verification is honest
 * about sandbox vs live; a veto means the consequence never happens; and
 * missions stay user-isolated.
 */

vi.mock("@/lib/auth", () => ({
  authConfigured: () => true,
  DEMO_USER_ID: "demo-user",
  getUserId: vi.fn(async () => "user-a"),
}));

let store: MemoryStore;
beforeEach(() => {
  store = new MemoryStore();
  (globalThis as Record<string, unknown>).__cosignoStore = store;
  resetRateLimitsForTests();
});

async function drive(userId: string, id: string, passes = 15) {
  let last = null;
  for (let i = 0; i < passes; i++) {
    last = await advanceMission(userId, id);
    if (!last) break;
    if (
      ["completed", "partial", "failed", "stopped", "awaiting_input", "awaiting_approval", "paused", "blocked"].includes(
        last.mission.state
      )
    )
      break;
  }
  return last!;
}

describe("inbox operator (inbox_cleanup)", () => {
  it("scans, summarizes, and drafts automatically, then stops on the archive card", async () => {
    const { mission, steps } = await createInboxCleanupMission("user-a");
    expect(steps).toHaveLength(5);
    const r = await drive("user-a", mission.id);
    expect(r.mission.state).toBe("awaiting_approval");

    // Reads + drafts ran on their own — all honestly labeled sandbox.
    for (const tool of ["inbox.scan", "inbox.summarize", "inbox.draft_replies"]) {
      const s = r.steps.find((x) => x.tool === tool)!;
      expect(s.state).toBe("completed");
      expect(s.output?.simulated).toBe(true);
    }
    const scan = r.steps.find((s) => s.tool === "inbox.scan")!;
    expect(scan.sources.every((src) => src.simulated === true && src.name === "workspace sandbox")).toBe(true);

    // The reply drafts exist as a deliverable and say nothing was sent.
    const files = await store.listFiles("user-a");
    const drafts = files.find((f) => f.name.includes("reply drafts"))!;
    expect(drafts.content).toMatch(/sandbox drafts/i);
    expect(drafts.content).toMatch(/nothing exists in a real mail account/i);

    // The cleanup waits on a card that plainly says archive-only.
    const cleanup = r.steps.find((s) => s.tool === "inbox.propose_cleanup")!;
    expect(cleanup.state).toBe("awaiting_approval");
    const card = (await store.getAction("user-a", cleanup.action_id!))!;
    expect(card.status).toBe("proposed");
    expect(card.category).toBe("update_record");
    expect(String(card.payload.note)).toMatch(/nothing is deleted/i);
  });

  it("approval settles the cleanup with an honest sandbox verification and a receipt", async () => {
    const { mission } = await createInboxCleanupMission("user-a");
    let r = await drive("user-a", mission.id);
    const cleanup = r.steps.find((s) => s.tool === "inbox.propose_cleanup")!;
    await approveAction("user-a", cleanup.action_id!);
    r = await drive("user-a", mission.id);
    expect(r.mission.state).toBe("completed");

    const settled = r.steps.find((s) => s.tool === "inbox.propose_cleanup")!;
    expect(settled.state).toBe("completed");
    expect(settled.verification?.ok).toBe(true);
    expect(settled.verification?.simulated).toBe(true);
    expect(String(settled.verification?.detail)).toMatch(/no real mailbox was touched/i);

    const receipt = r.mission.receipt as Record<string, unknown>;
    expect(receipt).toBeTruthy();
    expect((receipt.verifications as unknown[]).length).toBeGreaterThanOrEqual(1);
  });

  it("a veto means the archive never happens and the receipt says so", async () => {
    const { mission } = await createInboxCleanupMission("user-a");
    let r = await drive("user-a", mission.id);
    const cleanup = r.steps.find((s) => s.tool === "inbox.propose_cleanup")!;
    await vetoAction("user-a", cleanup.action_id!, "not now");
    r = await drive("user-a", mission.id);
    expect(r.mission.state).toBe("partial");

    const settled = r.steps.find((s) => s.tool === "inbox.propose_cleanup")!;
    expect(settled.state).toBe("vetoed");
    const receipt = r.mission.receipt as Record<string, unknown>;
    const didNotRun = receipt.did_not_run as { state: string }[];
    expect(didNotRun.some((d) => d.state === "vetoed")).toBe(true);
  });
});

describe("follow-up operator (followups)", () => {
  it("finds and drafts automatically; send and reminder are separate approval cards", async () => {
    const { mission } = await createFollowupsMission("user-a");
    let r = await drive("user-a", mission.id);
    expect(r.mission.state).toBe("awaiting_approval");

    const draft = r.steps.find((s) => s.tool === "followup.draft")!;
    expect(draft.state).toBe("completed");
    expect(typeof draft.output?.send_time).toBe("string");
    // Sandbox data means no real Gmail drafts were claimed.
    expect(draft.output?.saved_to_gmail).toBe(0);

    const send = r.steps.find((s) => s.tool === "followup.offer_send")!;
    const reminder = r.steps.find((s) => s.tool === "calendar.propose_reminder")!;
    expect(send.state).toBe("awaiting_approval");
    expect(reminder.state).toBe("awaiting_approval");
    expect(send.action_id).not.toBe(reminder.action_id);
    const sendCard = (await store.getAction("user-a", send.action_id!))!;
    const remindCard = (await store.getAction("user-a", reminder.action_id!))!;
    expect(sendCard.category).toBe("send_email");
    expect(remindCard.category).toBe("update_record");
    // Sandbox drafts only ever address example.com — never a real recipient.
    expect(String(sendCard.payload.to)).toMatch(/@example\.com$/);

    // Approve both → the mission completes with honest sandbox verifications.
    await approveAction("user-a", send.action_id!);
    await approveAction("user-a", reminder.action_id!);
    r = await drive("user-a", mission.id);
    expect(r.mission.state).toBe("completed");
    for (const tool of ["followup.offer_send", "calendar.propose_reminder"]) {
      const s = r.steps.find((x) => x.tool === tool)!;
      expect(s.state).toBe("completed");
      expect(s.verification?.ok).toBe(true);
      expect(s.verification?.simulated).toBe(true);
    }
  });
});

describe("daily operator brief (daily_brief)", () => {
  it("writes the brief from calendar + inbox reads, with the reminder as its own card", async () => {
    const { mission } = await createDailyBriefMission("user-a");
    let r = await drive("user-a", mission.id);
    expect(r.mission.state).toBe("awaiting_approval");

    const brief = r.steps.find((s) => s.tool === "deliverable.daily_brief")!;
    expect(brief.state).toBe("completed");
    const files = await store.listFiles("user-a");
    const doc = files.find((f) => f.name.startsWith("daily brief"))!;
    expect(doc.content).toMatch(/sandbox brief/i);
    expect(doc.content).toMatch(/today's schedule/i);
    expect(doc.content).toMatch(/inbox signals/i);

    const reminder = r.steps.find((s) => s.tool === "calendar.propose_reminder")!;
    expect(reminder.state).toBe("awaiting_approval");
    await approveAction("user-a", reminder.action_id!);
    r = await drive("user-a", mission.id);
    expect(r.mission.state).toBe("completed");
    const receipt = r.mission.receipt as Record<string, unknown>;
    const deliverables = receipt.deliverables as { kind?: string }[];
    expect(deliverables.some((d) => d.kind === "daily-brief")).toBe(true);
  });
});

describe("isolation", () => {
  it("another user cannot see the mission or approve its cards", async () => {
    const { mission } = await createInboxCleanupMission("user-a");
    const r = await drive("user-a", mission.id);
    const cleanup = r.steps.find((s) => s.tool === "inbox.propose_cleanup")!;
    expect(await store.getMission("user-b", mission.id)).toBeNull();
    expect(await store.getAction("user-b", cleanup.action_id!)).toBeNull();
    await expect(approveAction("user-b", cleanup.action_id!)).rejects.toThrow();
    // The card is untouched for the real owner.
    expect((await store.getAction("user-a", cleanup.action_id!))!.status).toBe("proposed");
  });
});
