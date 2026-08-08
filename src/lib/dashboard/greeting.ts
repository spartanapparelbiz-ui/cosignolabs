/**
 * How home addresses the person in front of it.
 *
 * Both functions are pure and live outside the component so the product's most
 * visible sentence is pinned by tests rather than by whoever happens to be
 * awake when someone checks the page.
 */

/**
 * Time-of-day greeting from an hour in the VISITOR's own clock. A
 * server-rendered hour would greet someone in Sydney with "good evening" at
 * breakfast, so the caller resolves this after mount.
 */
export function partOfDay(hour: number): string {
  if (hour < 12) return "Good morning";
  if (hour < 18) return "Good afternoon";
  return "Good evening";
}

/**
 * The line under the greeting — the whole point of the personalization. Not
 * "Dashboard", not a slogan, but the single truest sentence about this
 * workspace right now.
 *
 * Order matters and is the product's whole posture: what needs the PERSON
 * comes before what cosigno is doing, which comes before anything already
 * finished. Because every branch is derived from a real count, it can never
 * congratulate someone whose queue is full.
 */
export function headline(counts: {
  approvals: number;
  working: number;
  finished: number;
}): string {
  if (counts.approvals > 0) {
    return counts.approvals === 1
      ? "One thing is waiting for your signature."
      : `${counts.approvals} things are waiting for your signature.`;
  }
  if (counts.working > 0) {
    return counts.working === 1
      ? "cosigno is working on one thing for you."
      : `cosigno is working on ${counts.working} things for you.`;
  }
  if (counts.finished > 0) return "Everything from today is done.";
  return "Nothing needs your attention right now.";
}
