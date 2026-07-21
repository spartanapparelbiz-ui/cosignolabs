/**
 * Pure decision helpers for the public demo sandbox (LivePreview). Extracted so
 * the authority behavior the product promises can be unit-tested directly,
 * without driving the DOM:
 *
 *   - Tier 1 (read-only) runs automatically and NEVER shows approve/veto.
 *   - Tier 2 waits for an explicit approval.
 *   - Tier 3 is locked (typed confirmation).
 *   - Injection-flagged cards are always HELD, whatever their tier — never
 *     auto-run, never approvable.
 *
 * The demo mirrors the server's real tier semantics (src/lib/tiers.ts); it does
 * not replace them — the real Boundary still runs server-side in the app.
 */

export type DemoTier = 1 | 2 | 3;
export type DemoStatus = "proposed" | "executing" | "executed" | "vetoed";

/** A tier-1, non-injected action runs on its own — no human in the loop. */
export function demoShouldAutoExecute(tier: DemoTier, injectionFlag: boolean): boolean {
  return tier === 1 && !injectionFlag;
}

/** The status a freshly-planned card starts in. */
export function demoInitialStatus(tier: DemoTier, injectionFlag: boolean): DemoStatus {
  return demoShouldAutoExecute(tier, injectionFlag) ? "executing" : "proposed";
}

/** Whether an APPROVE control should ever render for this card. */
export function demoShowsApprove(tier: DemoTier, injectionFlag: boolean): boolean {
  // Held (injected) cards can only be dismissed, never approved. Tier-1 reads
  // auto-run, so they never present an approve button either.
  if (injectionFlag) return false;
  return tier === 2 || tier === 3;
}

/** Whether this card requires a typed confirmation before it can execute. */
export function demoRequiresTypedConfirmation(tier: DemoTier, injectionFlag: boolean): boolean {
  return !injectionFlag && tier === 3;
}

/** Categories whose effect can't be walked back — shown on the receipt. */
export const DEMO_IRREVERSIBLE = new Set([
  "send_email",
  "post_content",
  "delete",
  "refund",
  "payment",
  "spend",
  "webhook",
]);

export function demoReversible(category: string): boolean {
  return !DEMO_IRREVERSIBLE.has(category);
}

export type EnterResolution =
  | { kind: "palette"; index: number }
  | { kind: "typed"; command: string }
  | { kind: "noop" };

/**
 * What pressing Enter in the sandbox input should do. The key correctness rule:
 * when the suggestion palette is open with a highlighted item and the user has
 * NOT typed a real command (empty, or just the "/" shortcut char), Enter runs
 * the HIGHLIGHTED suggestion — it must never submit "/" as a command.
 */
export function demoResolveEnter(args: {
  input: string;
  paletteOpen: boolean;
  paletteIdx: number;
  paletteLen: number;
}): EnterResolution {
  const trimmed = args.input.trim();
  const noRealCommand = trimmed === "" || trimmed === "/";
  if (
    args.paletteOpen &&
    noRealCommand &&
    args.paletteLen > 0 &&
    args.paletteIdx >= 0 &&
    args.paletteIdx < args.paletteLen
  ) {
    return { kind: "palette", index: args.paletteIdx };
  }
  if (noRealCommand) return { kind: "noop" };
  return { kind: "typed", command: trimmed };
}

/** Normalize a raw command: a bare/leading slash is the palette shortcut, not text. */
export function demoNormalizeCommand(raw: string): string {
  let cmd = raw.trim().slice(0, 200);
  if (cmd === "/") return "";
  if (cmd.startsWith("/")) cmd = cmd.slice(1).trim();
  return cmd;
}
