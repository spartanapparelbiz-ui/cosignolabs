import { describe, expect, it } from "vitest";
import {
  agoCompact,
  agoDetailed,
  agoLong,
  checkedLabel,
  duration,
  minutesBetween,
  untilCompact,
  untilLong,
} from "../src/lib/time";

/**
 * One time vocabulary, everywhere — the temporal twin of the status
 * vocabulary. The registers are enumerated and named; these tests pin each
 * register's exact outputs, so a surface picking one knows precisely what it
 * gets, and so drift inside the module is as loud as drift outside it (which
 * one-time-language.test.ts polices).
 */

const NOW = Date.parse("2026-08-10T12:00:00Z");
const ago = (mins: number) => new Date(NOW - mins * 60_000).toISOString();
const ahead = (mins: number) => new Date(NOW + mins * 60_000).toISOString();

describe("agoCompact — the feed register", () => {
  it.each([
    [0.4, "just now"],
    [3, "3m ago"],
    [130, "2h ago"],
    [60 * 24 * 2, "2d ago"],
  ])("%s minutes ago reads %j", (mins, expected) => {
    expect(agoCompact(ago(mins), NOW)).toBe(expected);
  });

  it("hands over to the date once relative stops being information", () => {
    expect(agoCompact(ago(60 * 24 * 9), NOW)).toMatch(/aug/i);
  });
});

describe("agoDetailed — the live-ops register", () => {
  it("keeps the minutes inside the hour, because they matter there", () => {
    expect(agoDetailed(ago(5), NOW)).toBe("5 min ago");
    expect(agoDetailed(ago(3 * 60 + 12), NOW)).toBe("3h 12m ago");
    expect(agoDetailed(ago(60 * 24 * 2), NOW)).toBe("2d ago");
  });
});

describe("agoLong — the prose register", () => {
  it("is a bare span; the sentence around it is the caller's", () => {
    expect(agoLong(ago(20), NOW)).toBe("20 minutes");
    expect(agoLong(ago(3 * 60), NOW)).toBe("3 hours");
    expect(agoLong(ago(60 * 24 * 2), NOW)).toBe("2 days");
  });

  it("a fresh moment never reads '0 minutes' — a briefing said that once", () => {
    // "the oldest has been 0 minutes" shipped to a screenshot before this
    // floor existed.
    expect(agoLong(ago(0.3), NOW)).toBe("under a minute");
  });
});

describe("until — schedules", () => {
  it("long form speaks in prose, with 'tomorrow' for one day out", () => {
    expect(untilLong(ahead(20), NOW)).toBe("in 20 minutes");
    expect(untilLong(ahead(3 * 60), NOW)).toBe("in 3 hours");
    expect(untilLong(ahead(60 * 24), NOW)).toBe("tomorrow");
    expect(untilLong(ahead(-5), NOW)).toBe("now");
  });

  it("compact form fits a lane", () => {
    expect(untilCompact(ahead(20), NOW)).toBe("in 20m");
    expect(untilCompact(ahead(-5), NOW)).toBe("due now");
    expect(untilCompact(ahead(60 * 24 * 2), NOW)).toBe("in 2d");
  });
});

describe("duration — spans as nouns", () => {
  it("plain and approx differ only by the 'about'", () => {
    expect(duration(20)).toBe("20 minutes");
    expect(duration(20, "approx")).toBe("about 20 minutes");
    expect(duration(180, "approx")).toBe("about 3 hours");
  });

  it("a sub-minute span never reads as zero", () => {
    expect(duration(0.3)).toBe("under a minute");
    expect(duration(0.3, "approx")).toBe("under a minute");
  });
});

describe("totality — garbage in, empty string out, never NaN", () => {
  it.each([agoCompact, agoDetailed, agoLong, untilLong, untilCompact])(
    "%o returns '' on unparseable input",
    (fn) => {
      expect(fn("not a date", NOW)).toBe("");
    }
  );

  it("minutesBetween rejects garbage and time travel", () => {
    expect(minutesBetween("nope", ago(0))).toBeNull();
    expect(minutesBetween(ago(0), ago(10))).toBeNull(); // backwards
    expect(minutesBetween(ago(10), ago(0))).toBe(10);
  });

  it("checkedLabel treats missing and garbage the same honest way", () => {
    expect(checkedLabel(null, NOW)).toBe("not checked yet");
    expect(checkedLabel("garbage", NOW)).toBe("not checked yet");
    expect(checkedLabel(ago(3), NOW)).toBe("checked 3m ago");
    expect(checkedLabel(ago(0), NOW)).toBe("checked just now");
  });
});

describe("every register is pure — now is a parameter", () => {
  it("the same inputs always produce the same words", () => {
    expect(agoCompact(ago(90), NOW)).toBe(agoCompact(ago(90), NOW));
    expect(agoCompact(ago(90), new Date(NOW))).toBe(agoCompact(ago(90), NOW));
  });
});
