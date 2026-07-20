/**
 * Shared helpers for building the RuleContext an action carries when it is
 * checked against the user's permission rules. Both the live Boundary door
 * (proposeConnectorAction) and the offline dry-run (previewConnectorAction)
 * import these, so the two can never drift: a preview computes the exact same
 * tier + rule decision the real proposal would.
 */

/** Pull a numeric amount out of connector args (amount/total/value keys). */
export function argAmount(args: Record<string, unknown>): number | undefined {
  for (const k of ["amount", "total", "value", "price"]) {
    const v = args[k];
    if (typeof v === "number" && Number.isFinite(v)) return v;
    if (typeof v === "string") {
      // Only parse when the string actually contains a digit — a non-numeric
      // value like "premium-plan" must NOT become 0 (which would spuriously
      // satisfy an "under $X" rule). Skip it so amount conditions stay unknown.
      const cleaned = v.replace(/[^\d.]/g, "");
      if (!/\d/.test(cleaned)) continue;
      const n = Number(cleaned);
      if (Number.isFinite(n)) return n;
    }
  }
  return undefined;
}

/** Pull a channel identifier (#channel) out of connector args. */
export function argChannel(args: Record<string, unknown>): string | undefined {
  for (const k of ["channel", "channel_name", "to"]) {
    const v = args[k];
    if (typeof v === "string" && v.trim()) return v.startsWith("#") ? v : `#${v}`;
  }
  return undefined;
}
