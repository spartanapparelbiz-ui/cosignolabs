import type { ActionResult, OAuthCredentials, ProviderAction } from "../types";
import { requestJson } from "../runtime/httpClient";
import { makeOAuthProvider } from "./oauth";

/**
 * Google Drive — reuses the same Google OAuth app as Gmail/Calendar. Scope is
 * drive.file, the narrowest useful one: cosigno can only see and touch files
 * it created (or the user explicitly opened with it) — never the whole drive.
 * That boundary is stated on the card and in every list result.
 */

const API = "https://www.googleapis.com/drive/v3";
const UPLOAD = "https://www.googleapis.com/upload/drive/v3";
const MAX_FILES = 25;

const DRIVE_ACTIONS: ProviderAction[] = [
  { id: "list_files", summary: "list files cosigno created in your Drive (read-only).", mutates: false, risk: "read" },
  { id: "create_text_file", summary: "save a new text/markdown/csv file to your Drive.", mutates: true, risk: "write" },
  { id: "update_text_file", summary: "replace the contents of a file cosigno created.", mutates: true, risk: "write" },
  { id: "trash_file", summary: "move a file to Drive's trash (destructive — typed confirmation).", mutates: true, risk: "destructive" },
];

const TEXT_MIMES = new Set(["text/plain", "text/markdown", "text/csv"]);
const MAX_CONTENT = 200_000;

function bearer(creds: OAuthCredentials) {
  return { authorization: `Bearer ${creds.access_token}`, accept: "application/json" };
}

function str(v: unknown): string | undefined {
  return typeof v === "string" && v.trim() ? v.trim() : undefined;
}

/** multipart/related body for a metadata+content upload in one request. */
function multipart(meta: Record<string, unknown>, content: string, mime: string) {
  const boundary = `cosigno-${Date.now().toString(36)}`;
  const body = [
    `--${boundary}`,
    "Content-Type: application/json; charset=UTF-8",
    "",
    JSON.stringify(meta),
    `--${boundary}`,
    `Content-Type: ${mime}`,
    "",
    content,
    `--${boundary}--`,
    "",
  ].join("\r\n");
  return { body, type: `multipart/related; boundary=${boundary}` };
}

async function driveExecute(
  actionId: string,
  payload: Record<string, unknown>,
  creds: OAuthCredentials
): Promise<ActionResult> {
  switch (actionId) {
    case "list_files": {
      const params = new URLSearchParams({
        pageSize: String(MAX_FILES),
        q: "trashed = false",
        fields: "files(id,name,mimeType,modifiedTime)",
        orderBy: "modifiedTime desc",
      });
      const res = await requestJson<{ files?: { id: string; name: string }[] }>(
        `${API}/files?${params}`,
        { headers: bearer(creds), retries: 2 }
      );
      const files = res.files ?? [];
      // File names come from Drive — UNTRUSTED content, carried as data only.
      return {
        ok: true,
        summary: `found ${files.length} file${files.length === 1 ? "" : "s"} cosigno can see (drive.file scope: only files it created or you opened with it).`,
        detail: { files: files.slice(0, MAX_FILES), untrusted: true },
      };
    }
    case "create_text_file": {
      const name = str(payload.name);
      const content = typeof payload.content === "string" ? payload.content : undefined;
      const mime = str(payload.mime) ?? "text/plain";
      if (!name || content === undefined) return { ok: false, summary: "a file needs a name and content." };
      if (!TEXT_MIMES.has(mime)) return { ok: false, summary: "only text, markdown, or csv files are supported." };
      if (content.length > MAX_CONTENT) return { ok: false, summary: "that file is too large (200k character limit)." };
      const { body, type } = multipart({ name, mimeType: mime }, content, mime);
      const created = await requestJson<{ id?: string; name?: string }>(
        `${UPLOAD}/files?uploadType=multipart&fields=id,name`,
        { method: "POST", headers: { ...bearer(creds), "content-type": type }, body }
      );
      return { ok: true, summary: `saved “${created.name ?? name}” to your Drive.`, detail: { file_id: created.id } };
    }
    case "update_text_file": {
      const id = str(payload.file_id) ?? str(payload.id);
      const content = typeof payload.content === "string" ? payload.content : undefined;
      if (!id || content === undefined) return { ok: false, summary: "an update needs a file id and content." };
      if (content.length > MAX_CONTENT) return { ok: false, summary: "that file is too large (200k character limit)." };
      await requestJson(`${UPLOAD}/files/${encodeURIComponent(id)}?uploadType=media`, {
        method: "PATCH",
        headers: { ...bearer(creds), "content-type": "text/plain" },
        body: content,
      });
      return { ok: true, summary: "updated the file's contents." };
    }
    case "trash_file": {
      const id = str(payload.file_id) ?? str(payload.id);
      if (!id) return { ok: false, summary: "no file id given." };
      await requestJson(`${API}/files/${encodeURIComponent(id)}`, {
        method: "PATCH",
        headers: bearer(creds),
        body: { trashed: true },
      });
      return { ok: true, summary: "moved the file to Drive's trash (recoverable there)." };
    }
    default:
      return { ok: false, summary: "unknown Drive action." };
  }
}

export const googleDriveProvider = makeOAuthProvider({
  key: "google-drive",
  name: "Google Drive",
  detail: "save and update text files in your Drive — cosigno only sees files it created.",
  scopeSummary: "drive: app-created files only",
  tracks: ["files cosigno created", "recent documents"],
  authorizeUrl: "https://accounts.google.com/o/oauth2/v2/auth",
  tokenUrl: "https://oauth2.googleapis.com/token",
  scopes:
    "https://www.googleapis.com/auth/userinfo.email https://www.googleapis.com/auth/drive.file",
  usesPkce: true,
  extraAuthParams: { access_type: "offline", prompt: "consent" },
  // Same Google OAuth app as Gmail — configuring one configures all three.
  clientIdEnv: "GOOGLE_CLIENT_ID",
  clientSecretEnv: "GOOGLE_CLIENT_SECRET",
  healthUrl: "https://www.googleapis.com/oauth2/v3/userinfo",
  healthLabel: (j) => (typeof j.email === "string" ? j.email : undefined),
  actions: DRIVE_ACTIONS,
  execute: driveExecute,
});
