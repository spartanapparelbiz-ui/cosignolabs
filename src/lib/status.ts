import type { ActionRecord, MissionRecord } from "./types";

/**
 * One status vocabulary for the whole product.
 *
 * The same state used to read three different ways depending which page you
 * were on: a failed mission was "Needs attention" on home, "Failed" in the
 * workspace, and "failed safely" in the list. Each was defensible alone;
 * together they taught people that cosigno's words don't mean anything exact,
 * which is expensive for a product whose entire pitch is that it tells you the
 * truth about what happened.
 *
 * Five statuses cover almost everything:
 *
 *   Working · Waiting · Needs approval · Finished · Failed
 *
 * Two states genuinely aren't any of those, and are kept rather than forced:
 *
 * · STOPPED — you ended it deliberately. Calling that "Failed" would report a
 *   fault where there was a decision, and calling it "Finished" would claim an
 *   outcome that never happened.
 * · NEEDS ATTENTION — some work landed and some didn't, or couldn't be
 *   confirmed. "Finished" would overclaim and "Failed" would erase the part
 *   that really did happen.
 *
 * Forcing either into the five would mean choosing a wrong word for the sake of
 * a tidy set, which is exactly the trade this vocabulary exists to prevent.
 */

export type Status =
  | "Working"
  | "Waiting"
  | "Needs approval"
  | "Finished"
  | "Failed"
  | "Stopped"
  | "Needs attention";

/**
 * The one color each status is allowed to wear, expressed as a meaning rather
 * than as a class name so every badge, dot and row in the product resolves the
 * same state to the same color.
 *
 *   signal   something is waiting on you
 *   positive it worked
 *   danger   it didn't
 *   neutral  everything else, which is most of it
 *
 * "Working" is deliberately neutral: work in progress is the normal condition
 * of this product, and a workspace where the normal condition is colored is a
 * workspace with no colors left for the abnormal one.
 */
export type StatusTone = "neutral" | "positive" | "signal" | "danger";

export const STATUS_TONE: Record<Status, StatusTone> = {
  Working: "neutral",
  Waiting: "signal",
  "Needs approval": "signal",
  Finished: "positive",
  Failed: "danger",
  Stopped: "neutral",
  "Needs attention": "signal",
};

/** A mission's state, in the shared words. */
export function missionStatus(state: MissionRecord["state"]): Status {
  switch (state) {
    case "queued":
    case "running":
    case "retrying":
    case "verifying":
      return "Working";
    case "awaiting_approval":
      return "Needs approval";
    case "awaiting_input":
    case "paused":
    case "blocked":
      // All three mean the same thing to the person reading: cosigno cannot
      // continue until you do something.
      return "Waiting";
    case "completed":
      return "Finished";
    case "partial":
      return "Needs attention";
    case "stopped":
      return "Stopped";
    case "failed":
      return "Failed";
  }
}

/** A decision card's state, in the same words. */
export function actionStatus(status: ActionRecord["status"]): Status {
  switch (status) {
    case "proposed":
      return "Needs approval";
    case "approved":
    case "executing":
      return "Working";
    case "executed":
      return "Finished";
    case "vetoed":
      // You declined it. Nothing went wrong.
      return "Stopped";
    case "failed":
      return "Failed";
  }
}
