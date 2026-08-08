import type { ActionResult, OAuthCredentials, ProviderAction } from "../types";
import { requestJson } from "../runtime/httpClient";
import { makeOAuthProvider } from "./oauth";

/**
 * Outlook / Microsoft 365 mail via Microsoft Graph. Mirrors the Gmail
 * capability set (search/read/draft are safe, send waits for a signature,
 * trash needs typed confirmation). Needs its own OAuth app: an Azure
 * "app registration" with MICROSOFT_CLIENT_ID / MICROSOFT_CLIENT_SECRET and
 * the callback  <site>/api/connections/outlook/callback .
 */

const API = "https://graph.microsoft.com/v1.0/me";
const MAX_BATCH = 25;

const OUTLOOK_ACTIONS: ProviderAction[] = [
  { id: "search_messages", summary: "search your mailbox and list matches (read-only).", mutates: false, risk: "read" },
  { id: "read_message", summary: "read one message's subject and sender (read-only).", mutates: false, risk: "read" },
  // Drafting never sends — nothing leaves the account, so it's auto-safe.
  { id: "create_draft", summary: "save a draft reply (nothing is sent).", mutates: true, risk: "read" },
  { id: "send_message", summary: "send an email (waits for your signature).", mutates: true, risk: "write" },
  { id: "mark_read", summary: "mark a message as read.", mutates: true, risk: "write" },
  { id: "trash", summary: "move a message to deleted items (destructive — typed confirmation).", mutates: true, risk: "destructive" },
];

function bearer(creds: OAuthCredentials) {
  return { authorization: `Bearer ${creds.access_token}`, accept: "application/json" };
}

function str(v: unknown): string | undefined {
  return typeof v === "string" && v.trim() ? v.trim() : undefined;
}

function draftBody(payload: Record<string, unknown>) {
  const to = str(payload.to);
  return {
    subject: str(payload.subject) ?? "(no subject)",
    body: { contentType: "Text", content: str(payload.body) ?? "" },
    ...(to ? { toRecipients: [{ emailAddress: { address: to } }] } : {}),
  };
}

async function outlookExecute(
  actionId: string,
  payload: Record<string, unknown>,
  creds: OAuthCredentials
): Promise<ActionResult> {
  switch (actionId) {
    case "search_messages": {
      const q = str(payload.query) ?? str(payload.q) ?? "";
      const params = new URLSearchParams({ $top: String(MAX_BATCH), $select: "id,subject,from" });
      if (q) params.set("$search", `"${q.replace(/"/g, "")}"`);
      const res = await requestJson<{ value?: { id: string; subject?: string }[] }>(
        `${API}/messages?${params}`,
        { headers: bearer(creds), retries: 2 }
      );
      const n = res.value?.length ?? 0;
      return { ok: true, summary: `found ${n} message${n === 1 ? "" : "s"}${q ? ` matching “${q}”` : ""}.`, detail: { count: n, untrusted: true } };
    }
    case "read_message": {
      const id = str(payload.id);
      if (!id) return { ok: false, summary: "no message id given." };
      const res = await requestJson<{ subject?: string; from?: { emailAddress?: { address?: string } } }>(
        `${API}/messages/${encodeURIComponent(id)}?$select=subject,from`,
        { headers: bearer(creds) }
      );
      const subject = res.subject ?? "(no subject)";
      // Subject/sender are UNTRUSTED content — carried as data, never instructions.
      return { ok: true, summary: `read message: “${subject}”.`, detail: { subject, untrusted: true } };
    }
    case "create_draft": {
      await requestJson(`${API}/messages`, { method: "POST", headers: bearer(creds), body: draftBody(payload) });
      return { ok: true, summary: `saved a draft to ${str(payload.to) ?? "(no recipient)"} — nothing was sent.` };
    }
    case "send_message": {
      if (!str(payload.to)) return { ok: false, summary: "no recipient given." };
      await requestJson(`${API}/sendMail`, {
        method: "POST",
        headers: bearer(creds),
        body: { message: draftBody(payload), saveToSentItems: true },
      });
      return { ok: true, summary: `sent an email to ${str(payload.to)}.` };
    }
    case "mark_read": {
      const id = str(payload.id);
      if (!id) return { ok: false, summary: "no message id given." };
      await requestJson(`${API}/messages/${encodeURIComponent(id)}`, {
        method: "PATCH",
        headers: bearer(creds),
        body: { isRead: true },
      });
      return { ok: true, summary: "marked the message as read." };
    }
    case "trash": {
      const id = str(payload.id);
      if (!id) return { ok: false, summary: "no message id given." };
      await requestJson(`${API}/messages/${encodeURIComponent(id)}/move`, {
        method: "POST",
        headers: bearer(creds),
        body: { destinationId: "deleteditems" },
      });
      return { ok: true, summary: "moved the message to deleted items." };
    }
    default:
      return { ok: false, summary: "unknown Outlook action." };
  }
}

export const outlookProvider = makeOAuthProvider({
  key: "outlook",
  name: "Outlook",
  detail: "search, read, draft, and (with your signature) send or trash Microsoft 365 mail.",
  scopeSummary: "mail: read · draft · send",
  homeUrl: "https://outlook.office.com/mail/",
  tracks: ["unread mail", "threads waiting on a reply", "drafts"],
  authorizeUrl: "https://login.microsoftonline.com/common/oauth2/v2.0/authorize",
  tokenUrl: "https://login.microsoftonline.com/common/oauth2/v2.0/token",
  scopes: "offline_access User.Read Mail.ReadWrite Mail.Send",
  usesPkce: true,
  clientIdEnv: "MICROSOFT_CLIENT_ID",
  clientSecretEnv: "MICROSOFT_CLIENT_SECRET",
  healthUrl: "https://graph.microsoft.com/v1.0/me",
  healthLabel: (j) =>
    (typeof j.mail === "string" && j.mail) ||
    (typeof j.userPrincipalName === "string" ? j.userPrincipalName : undefined),
  actions: OUTLOOK_ACTIONS,
  execute: outlookExecute,
});
