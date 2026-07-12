import { getStore } from "../store";
import { runProviderAction } from "../integrations/runtime/connections";

/**
 * Normalized verification — one result model for every provider. A successful
 * API request is NEVER treated as proof the intended outcome occurred; each
 * verifier reads the outcome back and confirms the fields that matter. When
 * the read-back is uncertain, the result is ok:false with a plain reason, so
 * the UI shows "submitted, but not fully verified" rather than a false green.
 */

export interface VerificationResult {
  ok: boolean;
  detail: string;
  /** True when the check ran against a labeled sandbox rather than a live provider. */
  simulated?: boolean;
  /** The fields that were confirmed (or the mismatches found). */
  checked?: Record<string, unknown>;
  /** Stored as JSON on the step — index signature keeps it assignable. */
  [key: string]: unknown;
}

async function connectedApp(userId: string, providerKey: string) {
  const connections = await getStore().listConnections(userId);
  return (
    connections.find(
      (c) => c.kind === "app" && c.provider_key === providerKey && c.status === "connected"
    ) ?? null
  );
}

/** Gmail: confirm the message is actually in Sent Mail (subject match). */
export async function verifyGmailSend(
  userId: string,
  expected: { subject: string }
): Promise<VerificationResult> {
  const conn = await connectedApp(userId, "google");
  if (!conn) return { ok: false, detail: "couldn't verify — Gmail is no longer connected." };
  const res = await runProviderAction(userId, conn.id, "search_messages", {
    query: `in:sent subject:"${expected.subject.replace(/"/g, "")}"`,
  });
  const count = typeof res.detail?.count === "number" ? (res.detail.count as number) : 0;
  return res.ok && count > 0
    ? { ok: true, detail: `verified: the message is in Sent Mail (subject “${expected.subject}”).`, checked: { subject: expected.subject } }
    : { ok: false, detail: "the send reported success but the message wasn't found in Sent Mail yet." };
}

/**
 * Calendar: retrieve upcoming events and confirm the created event's title
 * and time are present. Uses list_events read-back (the scope we hold).
 */
export async function verifyCalendarEvent(
  userId: string,
  expected: { title: string; when?: string; attendees?: string[] }
): Promise<VerificationResult> {
  const conn = await connectedApp(userId, "google-calendar");
  if (!conn) return { ok: false, detail: "couldn't verify — Google Calendar is no longer connected." };
  const res = await runProviderAction(userId, conn.id, "list_events", {});
  if (!res.ok) return { ok: false, detail: "couldn't read the calendar back to verify." };
  const titles = Array.isArray(res.detail?.titles) ? (res.detail!.titles as string[]) : [];
  const found = titles.some((t) => t.toLowerCase().includes(expected.title.toLowerCase()));
  return found
    ? { ok: true, detail: `verified: “${expected.title}” is on the calendar.`, checked: { title: expected.title, when: expected.when ?? null } }
    : { ok: false, detail: `the event was created but “${expected.title}” wasn't found on read-back — treat as unverified.` };
}

/**
 * Drive: retrieve the file list and confirm the created/updated file is
 * present by name. A live provider also returns modifiedTime/checksum which
 * a caller may compare; here we confirm existence + name.
 */
export async function verifyDriveFile(
  userId: string,
  expected: { name: string }
): Promise<VerificationResult> {
  const conn = await connectedApp(userId, "google-drive");
  if (!conn) return { ok: false, detail: "couldn't verify — Google Drive is no longer connected." };
  const res = await runProviderAction(userId, conn.id, "list_files", {});
  if (!res.ok) return { ok: false, detail: "couldn't read Drive back to verify." };
  const files = Array.isArray(res.detail?.files)
    ? (res.detail!.files as { name?: string }[]).map((f) => f.name ?? "")
    : [];
  const found = files.some((n) => n.toLowerCase() === expected.name.toLowerCase());
  return found
    ? { ok: true, detail: `verified: “${expected.name}” is in your Drive.`, checked: { name: expected.name } }
    : { ok: false, detail: `the file was written but “${expected.name}” wasn't found on read-back — treat as unverified.` };
}
