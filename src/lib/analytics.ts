/**
 * Analytics stub — a single no-op sink. cosigno ships NO third-party tracking
 * scripts; interactive widgets call track() so the wiring exists, but nothing
 * leaves the browser. Swap the body for a real sink later without touching
 * call sites. Never send PII or command content here.
 */
export function track(event: string, props?: Record<string, unknown>): void {
  if (process.env.NODE_ENV === "development") {
    // Visible in dev only, so the events are discoverable while building.
    // eslint-disable-next-line no-console
    console.debug("[track]", event, props ?? {});
  }
}
