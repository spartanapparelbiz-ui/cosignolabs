/**
 * Analytics — first-party and privacy-respecting. No cookies, no cross-site
 * tracking scripts, no PII. Interactive widgets call track() with a named
 * event; the six funnel events (§9) are the ones the operator reads:
 *
 *   demo_started · demo_completed · injection_caught
 *   apply_viewed · apply_submitted · pricing_clicked
 *
 * Transport (both fire-and-forget, both optional):
 *   1. a first-party beacon to /api/track, which structured-logs the event so
 *      it shows up in the operator's existing logs / Netlify analytics — no
 *      third party, nothing to consent to.
 *   2. window.plausible(), IF the operator later adds Plausible. Until then it
 *      is simply absent and skipped. Plausible needs no cookie banner.
 *
 * Never pass command content, email, or any free text here — event name +
 * coarse enum props only.
 */

export type FunnelEvent =
  | "demo_started"
  | "demo_completed"
  | "injection_caught"
  | "apply_viewed"
  | "apply_submitted"
  | "pricing_clicked";

export function track(event: string, props?: Record<string, unknown>): void {
  if (typeof window !== "undefined") {
    // Plausible if the operator added it; silently skipped otherwise.
    const p = (window as unknown as { plausible?: (e: string, o?: unknown) => void })
      .plausible;
    if (typeof p === "function") p(event, props ? { props } : undefined);

    // First-party beacon — survives page unload, never blocks the UI.
    try {
      const body = JSON.stringify({ event, props });
      if (navigator.sendBeacon) navigator.sendBeacon("/api/track", body);
      else void fetch("/api/track", { method: "POST", body, keepalive: true });
    } catch {
      /* analytics must never throw into product code */
    }
  }

  if (process.env.NODE_ENV === "development") {
    // eslint-disable-next-line no-console
    console.debug("[track]", event, props ?? {});
  }
}
