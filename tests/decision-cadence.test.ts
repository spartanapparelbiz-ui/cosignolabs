import { describe, expect, it } from "vitest";
import {
  assessWait,
  cadenceLine,
  decisionCadence,
  durationLabel,
  MIN_SAMPLE,
} from "../src/lib/decisions/cadence";
import type { ActionRecord } from "../src/lib/types";

/**
 * The cadence is the one prediction cosigno makes, so these tests pin the
 * property that keeps it a prediction rather than a guess: it is computed
 * only from decisions a person actually made, it names its own sample size,
 * and it stays silent whenever it has nothing meaningful to say.
 */

const now = new Date("2026-08-10T12:00:00Z");

function decided(minutesToDecide: number, over: Partial<ActionRecord> = {}): ActionRecord {
  const created = new Date("2026-08-01T09:00:00Z");
  return {
    id: `a-${Math.abs(minutesToDecide)}-${over.id ?? ""}`,
    session_id: "s",
    user_id: "u",
    category: "send_email",
    tier: 2,
    status: "executed",
    summary: "Send it",
    payload: {},
    result: null,
    veto_reason: null,
    injection_flag: false,
    tier_note: null,
    created_at: created.toISOString(),
    resolved_at: new Date(created.getTime() + minutesToDecide * 60_000).toISOString(),
    ...over,
  };
}

/** N decided actions, all with the same wait. */
function history(n: number, minutes: number): ActionRecord[] {
  return Array.from({ length: n }, (_, i) => decided(minutes, { id: `h${i}` }));
}

describe("the cadence is computed only from human decisions", () => {
  it("needs a real sample before it claims anything", () => {
    expect(decisionCadence(history(MIN_SAMPLE - 1, 20))).toBeNull();
    expect(decisionCadence(history(MIN_SAMPLE, 20))).not.toBeNull();
  });

  it("excludes tier-1 auto actions — they never waited on a person", () => {
    const autos = history(20, 0.01).map((a, i) => ({ ...a, id: `auto${i}`, tier: 1 as const }));
    expect(decisionCadence(autos)).toBeNull();
  });

  it("excludes unresolved and time-travelling records", () => {
    const bad = [
      decided(20, { id: "open", status: "proposed", resolved_at: null }),
      decided(-10, { id: "backwards" }), // resolved before proposed
    ];
    expect(decisionCadence([...history(4, 20), ...bad])).toBeNull();
  });

  it("uses the median, so one abandoned card doesn't define the person", () => {
    const c = decisionCadence([...history(8, 10), decided(60 * 24 * 30, { id: "forgotten" })]);
    expect(c!.medianMinutes).toBe(10);
  });

  it("a veto is a decision too", () => {
    const vetoes = history(6, 15).map((a, i) => ({
      ...a,
      id: `v${i}`,
      status: "vetoed" as const,
    }));
    expect(decisionCadence(vetoes)!.sample).toBe(6);
  });
});

describe("the assessment speaks only when it carries information", () => {
  const cadence = decisionCadence(history(24, 20))!;

  it("stays silent for an ordinary wait", () => {
    const fresh = { created_at: new Date(now.getTime() - 30 * 60_000).toISOString() };
    expect(assessWait(fresh, cadence, now)).toBeNull();
  });

  it("never flags anything under an hour, however fast the person usually is", () => {
    const quick = decisionCadence(history(24, 2))!;
    const card = { created_at: new Date(now.getTime() - 50 * 60_000).toISOString() };
    expect(assessWait(card, quick, now)).toBeNull();
  });

  it("speaks when the wait is a multiple of the median, and shows the evidence", () => {
    const stale = { created_at: new Date(now.getTime() - 4 * 60 * 60_000).toISOString() };
    const a = assessWait(stale, cadence, now)!;
    expect(a.unusual).toBe(true);
    expect(a.text).toMatch(/waiting 4 hours/);
    expect(a.text).toMatch(/you usually decide within 20 minutes/);
    expect(a.text).toMatch(/based on your last 24 decisions/);
  });

  it("says nothing at all when there is no cadence", () => {
    const stale = { created_at: new Date(now.getTime() - 4 * 60 * 60_000).toISOString() };
    expect(assessWait(stale, null, now)).toBeNull();
  });
});

describe("the header line is a description, not a forecast", () => {
  it("names the median and the sample", () => {
    const line = cadenceLine(decisionCadence(history(24, 20)))!;
    expect(line).toBe(
      "you typically decide within about 20 minutes — based on your last 24 decisions."
    );
  });

  it("is absent without data rather than generic", () => {
    expect(cadenceLine(null)).toBeNull();
  });
});

describe("durations read the way a person would say them", () => {
  it("scales through minutes, hours, days", () => {
    expect(durationLabel(0.4)).toBe("under a minute");
    expect(durationLabel(20)).toBe("about 20 minutes");
    expect(durationLabel(180)).toBe("about 3 hours");
    expect(durationLabel(60 * 24 * 2)).toBe("about 2 days");
  });
});
