import type { ActionResult, OAuthCredentials, ProviderAction } from "../types";
import { requestJson } from "../runtime/httpClient";
import { makeOAuthProvider } from "./oauth";

/**
 * Gmail — the first real first-party connector. Capabilities are declared with
 * an explicit risk class so the server can tier them (read→1, write→2,
 * destructive→3); the connector never sets its own tier. `execute` performs the
 * REAL Gmail REST call server-side with the user's decrypted token and returns
 * a REAL result summary (e.g. "archived 12 messages") for the executed card.
 *
 * Minimum scope: gmail.modify covers read + drafts + send + label/archive +
 * trash (everything except permanent, trash-bypassing deletion). We request
 * exactly that plus the email address for the account label — nothing broader.
 */

const API = "https://gmail.googleapis.com/gmail/v1/users/me";
const MAX_BATCH = 25;

/** Launch capabilities, each tagged with its risk class (→ server tier). */
const GMAIL_ACTIONS: ProviderAction[] = [
  { id: "search_messages", summary: "search your inbox and list matches (read-only).", mutates: false, risk: "read" },
  { id: "read_message", summary: "read one message's subject and sender (read-only).", mutates: false, risk: "read" },
  // Drafting never sends — nothing leaves the account, so it's auto-safe.
  { id: "create_draft", summary: "save a draft reply (nothing is sent).", mutates: true, risk: "read" },
  { id: "send_message", summary: "send an email (waits for your signature).", mutates: true, risk: "write" },
  { id: "archive", summary: "archive messages out of the inbox.", mutates: true, risk: "write" },
  { id: "label", summary: "add a label to messages.", mutates: true, risk: "write" },
  { id: "mark_read", summary: "mark messages as read.", mutates: true, risk: "write" },
  { id: "trash", summary: "move messages to trash (destructive — typed confirmation).", mutates: true, risk: "destructive" },
];

function bearer(creds: OAuthCredentials) {
  return { authorization: `Bearer ${creds.access_token}`, accept: "application/json" };
}

function str(v: unknown): string | undefined {
  return typeof v === "string" && v.trim() ? v.trim() : undefined;
}

/** Bounded list of message ids from an explicit list or a search query. */
async function resolveIds(payload: Record<string, unknown>, creds: OAuthCredentials): Promise<string[]> {
  if (Array.isArray(payload.ids)) {
    return payload.ids.filter((x): x is string => typeof x === "string").slice(0, MAX_BATCH);
  }
  const q = str(payload.query) ?? str(payload.q);
  if (!q) return [];
  const res = await requestJson<{ messages?: { id: string }[] }>(
    `${API}/messages?maxResults=${MAX_BATCH}&q=${encodeURIComponent(q)}`,
    { headers: bearer(creds), retries: 2 }
  );
  return (res.messages ?? []).map((m) => m.id);
}

/** RFC-2822 message as base64url, the shape Gmail's raw send/draft expects. */
function rawMessage(to: string, subject: string, body: string): string {
  const mime = [`To: ${to}`, `Subject: ${subject}`, "Content-Type: text/plain; charset=UTF-8", "", body].join("\r\n");
  return Buffer.from(mime, "utf8").toString("base64url");
}

async function modify(ids: string[], patch: Record<string, string[]>, creds: OAuthCredentials): Promise<number> {
  let n = 0;
  for (const id of ids) {
    await requestJson(`${API}/messages/${encodeURIComponent(id)}/modify`, {
      method: "POST",
      headers: bearer(creds),
      body: patch,
    });
    n++;
  }
  return n;
}

async function gmailExecute(
  actionId: string,
  payload: Record<string, unknown>,
  creds: OAuthCredentials
): Promise<ActionResult> {
  switch (actionId) {
    case "search_messages": {
      const q = str(payload.query) ?? str(payload.q) ?? "";
      const res = await requestJson<{ messages?: { id: string }[]; resultSizeEstimate?: number }>(
        `${API}/messages?maxResults=${MAX_BATCH}&q=${encodeURIComponent(q)}`,
        { headers: bearer(creds), retries: 2 }
      );
      const n = res.messages?.length ?? 0;
      // Message ids let a mission read individual matches (bounded); ids are
      // opaque references, but the result set as a whole stays untrusted.
      const ids = (res.messages ?? []).map((m) => m.id).slice(0, MAX_BATCH);
      return { ok: true, summary: `found ${n} message${n === 1 ? "" : "s"}${q ? ` matching “${q}”` : ""}.`, detail: { count: n, ids, untrusted: true } };
    }
    case "read_message": {
      const id = str(payload.id);
      if (!id) return { ok: false, summary: "no message id given." };
      const res = await requestJson<{ payload?: { headers?: { name: string; value: string }[] } }>(
        `${API}/messages/${encodeURIComponent(id)}?format=metadata&metadataHeaders=Subject&metadataHeaders=From`,
        { headers: bearer(creds) }
      );
      const headers = res.payload?.headers ?? [];
      const subject = headers.find((h) => h.name === "Subject")?.value ?? "(no subject)";
      const from = headers.find((h) => h.name === "From")?.value ?? "";
      // The subject/sender are UNTRUSTED content — carried as data, never instructions.
      return { ok: true, summary: `read message: “${subject}”.`, detail: { id, subject, from, untrusted: true } };
    }
    case "create_draft": {
      const to = str(payload.to) ?? "";
      const subject = str(payload.subject) ?? "(no subject)";
      const body = str(payload.body) ?? "";
      await requestJson(`${API}/drafts`, {
        method: "POST",
        headers: bearer(creds),
        body: { message: { raw: rawMessage(to, subject, body) } },
      });
      return { ok: true, summary: `saved a draft to ${to || "(no recipient)"} — nothing was sent.` };
    }
    case "send_message": {
      const to = str(payload.to);
      if (!to) return { ok: false, summary: "no recipient given." };
      const subject = str(payload.subject) ?? "(no subject)";
      const body = str(payload.body) ?? "";
      await requestJson(`${API}/messages/send`, {
        method: "POST",
        headers: bearer(creds),
        body: { raw: rawMessage(to, subject, body) },
      });
      return { ok: true, summary: `sent an email to ${to}.` };
    }
    case "archive": {
      const ids = await resolveIds(payload, creds);
      const n = await modify(ids, { removeLabelIds: ["INBOX"] }, creds);
      return { ok: true, summary: `archived ${n} message${n === 1 ? "" : "s"}.` };
    }
    case "mark_read": {
      const ids = await resolveIds(payload, creds);
      const n = await modify(ids, { removeLabelIds: ["UNREAD"] }, creds);
      return { ok: true, summary: `marked ${n} message${n === 1 ? "" : "s"} as read.` };
    }
    case "label": {
      const ids = await resolveIds(payload, creds);
      const label = str(payload.label_id) ?? str(payload.label);
      if (!label) return { ok: false, summary: "no label given." };
      const n = await modify(ids, { addLabelIds: [label] }, creds);
      return { ok: true, summary: `labelled ${n} message${n === 1 ? "" : "s"}.` };
    }
    case "trash": {
      const ids = await resolveIds(payload, creds);
      let n = 0;
      for (const id of ids) {
        await requestJson(`${API}/messages/${encodeURIComponent(id)}/trash`, { method: "POST", headers: bearer(creds) });
        n++;
      }
      return { ok: true, summary: `moved ${n} message${n === 1 ? "" : "s"} to trash.` };
    }
    default:
      return { ok: false, summary: "unknown Gmail action." };
  }
}

export const gmailProvider = makeOAuthProvider({
  key: "google",
  name: "Gmail",
  detail: "search, read, draft, and (with your signature) send, archive, or trash mail.",
  scopeSummary: "gmail: read · draft · send · modify",
  tracks: ["unread mail", "threads waiting on a reply", "drafts"],
  authorizeUrl: "https://accounts.google.com/o/oauth2/v2/auth",
  tokenUrl: "https://oauth2.googleapis.com/token",
  // Minimum single write scope that covers every launch capability, plus the
  // address for the account label. gmail.modify excludes permanent deletion.
  scopes:
    "https://www.googleapis.com/auth/userinfo.email https://www.googleapis.com/auth/gmail.modify",
  usesPkce: true,
  extraAuthParams: { access_type: "offline", prompt: "consent" },
  clientIdEnv: "GOOGLE_CLIENT_ID",
  clientSecretEnv: "GOOGLE_CLIENT_SECRET",
  healthUrl: "https://www.googleapis.com/oauth2/v3/userinfo",
  healthLabel: (j) => (typeof j.email === "string" ? j.email : undefined),
  actions: GMAIL_ACTIONS,
  execute: gmailExecute,
});
