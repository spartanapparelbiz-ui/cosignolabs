import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

/**
 * The workspace-wide kill switch, and the one word that makes it safe.
 *
 * It used to read "Stop", sitting in the header of every page — including the
 * mission pages, which have their own "Stop" button for that one mission. Two
 * identical labels a few inches apart, one of which freezes the entire
 * workspace, in front of someone who is by definition already in a hurry.
 *
 * The second assertion is the one that is easy to lose in a refactor: a
 * control's accessible name has to CONTAIN the words it displays (WCAG 2.5.3,
 * "Label in Name"). Someone driving the page by voice says what they can see;
 * an aria-label that substitutes different words makes the control
 * unreachable by speech, silently, for the people least able to work around
 * it. The rendered sweep across every surface lives in the Playwright suite,
 * where there is a real accessibility tree to read — this pins the specific
 * control the sweep caught.
 */

const SRC = readFileSync("src/components/app/EmergencyStop.tsx", "utf8");

describe("the kill switch says what it is", () => {
  it("is not called the same thing as a single mission's stop button", () => {
    expect(SRC).toContain("Stop all");
    // A bare "Stop" as this button's own label is what the rename removed.
    expect(SRC).not.toMatch(/aria-hidden="true" \/>\n\s+Stop\n/);
  });

  it("announces a name that contains the words it shows", () => {
    expect(SRC).toMatch(/aria-label="Stop all — pause every AI action/);
    expect(SRC).toMatch(/aria-label="Confirm — stop everything/);
  });

  it("stays visible while stopped, as the way back", () => {
    // A kill switch that disappears once pressed leaves the operator hunting
    // for the resume control in the middle of an incident.
    expect(SRC).toContain("Resume cosigno");
  });
});
