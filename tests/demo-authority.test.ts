import { describe, expect, it } from "vitest";
import {
  demoInitialStatus,
  demoNormalizeCommand,
  demoRequiresTypedConfirmation,
  demoResolveEnter,
  demoReversible,
  demoShouldAutoExecute,
  demoShowsApprove,
} from "../src/lib/demoAuthority";

/* -------------------------------------------------- authority-tier behavior */

describe("demo authority — Tier 1 never asks for approval", () => {
  it("tier-1, non-injected → auto-executes, no approval control", () => {
    expect(demoShouldAutoExecute(1, false)).toBe(true);
    expect(demoInitialStatus(1, false)).toBe("executing"); // never "proposed"
    expect(demoShowsApprove(1, false)).toBe(false);
    expect(demoRequiresTypedConfirmation(1, false)).toBe(false);
  });
});

describe("demo authority — Tier 2 waits for an explicit approval", () => {
  it("tier-2 → proposed, shows approve, no typed confirmation", () => {
    expect(demoShouldAutoExecute(2, false)).toBe(false);
    expect(demoInitialStatus(2, false)).toBe("proposed");
    expect(demoShowsApprove(2, false)).toBe(true);
    expect(demoRequiresTypedConfirmation(2, false)).toBe(false);
  });
});

describe("demo authority — Tier 3 is locked (typed confirmation)", () => {
  it("tier-3 → proposed, shows approve AND requires typed confirmation", () => {
    expect(demoShouldAutoExecute(3, false)).toBe(false);
    expect(demoInitialStatus(3, false)).toBe("proposed");
    expect(demoShowsApprove(3, false)).toBe(true);
    expect(demoRequiresTypedConfirmation(3, false)).toBe(true);
  });
});

describe("demo authority — injection-flagged cards are always held", () => {
  it("a flagged tier-1 read never auto-runs and can't be approved", () => {
    expect(demoShouldAutoExecute(1, true)).toBe(false);
    expect(demoInitialStatus(1, true)).toBe("proposed");
    expect(demoShowsApprove(1, true)).toBe(false); // dismiss only
    expect(demoShowsApprove(2, true)).toBe(false);
    expect(demoShowsApprove(3, true)).toBe(false);
  });
});

describe("demo receipt — reversibility", () => {
  it("read/organize is reversible; send/delete/pay is irreversible", () => {
    expect(demoReversible("search")).toBe(true);
    expect(demoReversible("update_record")).toBe(true);
    expect(demoReversible("send_email")).toBe(false);
    expect(demoReversible("delete")).toBe(false);
    expect(demoReversible("payment")).toBe(false);
  });
});

/* --------------------------------------------------- suggestion keyboard flow */

describe("demoResolveEnter — Enter runs the highlighted suggestion, never '/'", () => {
  const palette = 6;

  it("empty input + highlighted suggestion → runs that suggestion", () => {
    expect(demoResolveEnter({ input: "", paletteOpen: true, paletteIdx: 2, paletteLen: palette })).toEqual({
      kind: "palette",
      index: 2,
    });
  });

  it("just '/' typed + highlighted suggestion → runs the suggestion, not '/'", () => {
    expect(demoResolveEnter({ input: "/", paletteOpen: true, paletteIdx: 0, paletteLen: palette })).toEqual({
      kind: "palette",
      index: 0,
    });
  });

  it("a real typed command wins over the palette", () => {
    expect(
      demoResolveEnter({ input: "clear my inbox", paletteOpen: true, paletteIdx: 3, paletteLen: palette })
    ).toEqual({ kind: "typed", command: "clear my inbox" });
  });

  it("palette closed + typed command → typed", () => {
    expect(demoResolveEnter({ input: "check my mail", paletteOpen: false, paletteIdx: 0, paletteLen: palette })).toEqual(
      { kind: "typed", command: "check my mail" }
    );
  });

  it("palette closed + empty → noop (nothing submitted)", () => {
    expect(demoResolveEnter({ input: "  ", paletteOpen: false, paletteIdx: 0, paletteLen: palette })).toEqual({
      kind: "noop",
    });
  });

  it("no valid highlight index → does not submit a suggestion", () => {
    expect(demoResolveEnter({ input: "", paletteOpen: true, paletteIdx: -1, paletteLen: palette })).toEqual({
      kind: "noop",
    });
  });
});

describe("demoNormalizeCommand — a bare/leading slash is never a command", () => {
  it("drops a bare slash", () => {
    expect(demoNormalizeCommand("/")).toBe("");
  });
  it("strips a leading slash from a real command", () => {
    expect(demoNormalizeCommand("/clear my inbox")).toBe("clear my inbox");
  });
  it("trims and caps length", () => {
    expect(demoNormalizeCommand("  hello  ")).toBe("hello");
    expect(demoNormalizeCommand("x".repeat(300)).length).toBe(200);
  });
});
