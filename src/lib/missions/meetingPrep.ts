import { getStore } from "../store";
import type { MissionRecord, MissionStepRecord } from "../types";

/**
 * The reference mission: "prepare everything for tomorrow's meeting."
 * A fixed, inspectable initial plan — the engine expands it adaptively when
 * the analysis actually finds follow-up material (see analyze.extract).
 * Steps 1 and 2 are independent of each other (both depend only on the
 * event), so one can proceed while the other waits.
 */

export const MEETING_PREP_GOAL = "prepare everything for tomorrow's meeting";

export async function createMeetingPrepMission(
  userId: string
): Promise<{ mission: MissionRecord; steps: MissionStepRecord[] }> {
  const store = getStore();
  const session = await store.createSession(userId, MEETING_PREP_GOAL);
  const mission = await store.createMission({
    user_id: userId,
    session_id: session.id,
    goal: MEETING_PREP_GOAL,
  });
  const steps = await store.createMissionSteps([
    {
      mission_id: mission.id,
      user_id: userId,
      idx: 0,
      purpose: "find the relevant upcoming calendar event",
      operator: "calendar",
      tool: "calendar.find_event",
      depends_on: [],
    },
    {
      mission_id: mission.id,
      user_id: userId,
      idx: 1,
      purpose: "search Gmail for conversations related to the meeting",
      operator: "communication",
      tool: "gmail.search_related",
      depends_on: [0],
    },
    {
      mission_id: mission.id,
      user_id: userId,
      idx: 2,
      purpose: "search Drive for files related to the meeting",
      operator: "files",
      tool: "drive.search_files",
      depends_on: [0],
    },
    {
      mission_id: mission.id,
      user_id: userId,
      idx: 3,
      purpose: "extract commitments, decisions, open questions, and risks",
      operator: "research",
      tool: "analyze.extract",
      depends_on: [1, 2],
    },
    {
      mission_id: mission.id,
      user_id: userId,
      idx: 4,
      purpose: "build the meeting brief",
      operator: "files",
      tool: "deliverable.brief",
      depends_on: [3],
    },
    {
      mission_id: mission.id,
      user_id: userId,
      idx: 5,
      purpose: "draft the agenda",
      operator: "files",
      tool: "deliverable.agenda",
      depends_on: [3],
    },
    {
      mission_id: mission.id,
      user_id: userId,
      idx: 6,
      purpose: "write the mission receipt",
      operator: "chief",
      tool: "mission.receipt",
      depends_on: [], // special: the engine runs the receipt only after everything else settles
    },
  ]);
  return { mission, steps };
}
