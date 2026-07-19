import type { ActionRecord, HoldScope } from "./types";

/**
 * Cosigno Hold enforcement — the single predicate the engine consults before
 * executing anything. Pure and dependency-free so it's trivially testable
 * and can't diverge between call sites.
 *
 *   none     — nothing is held.
 *   external — anything requiring approval or signature (tier ≥ 2) waits at
 *              the boundary. Tier-1 (read-only / reversible) still runs.
 *   all      — everything waits, including tier-1 auto actions.
 */
export function holdBlocks(scope: HoldScope, action: Pick<ActionRecord, "tier">): boolean {
  if (scope === "all") return true;
  if (scope === "external") return action.tier >= 2;
  return false;
}

export const HOLD_LABEL: Record<HoldScope, string> = {
  none: "Not held",
  external: "External actions paused",
  all: "All work paused",
};

/** The honest reason surfaced on a card the hold is blocking. */
export function holdMessage(scope: HoldScope): string {
  if (scope === "all") {
    return "Cosigno is on hold — nothing executes, including routine work. Resume cosigno to continue.";
  }
  return "Cosigno is on hold — external actions are paused at the boundary. Resume cosigno to continue.";
}
