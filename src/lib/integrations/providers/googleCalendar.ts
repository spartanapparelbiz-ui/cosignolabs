import type { ActionResult, OAuthCredentials, ProviderAction } from "../types";
import { requestJson } from "../runtime/httpClient";
import { makeOAuthProvider } from "./oauth";

/**
 * Google Calendar — reuses the SAME Google OAuth app as Gmail
 * (GOOGLE_CLIENT_ID/SECRET), so once Gmail is configured this connector is
 * configured too; the user just grants the calendar scope on connect. Scope is
 * calendar.events only (events on calendars the user can access — no settings,
 * no ACLs, no calendar deletion).
 */

const API = "https://www.googleapis.com/calendar/v3/calendars/primary";
const MAX_EVENTS = 25;

const CALENDAR_ACTIONS: ProviderAction[] = [
  { id: "list_events", summary: "list upcoming events (read-only).", mutates: false, risk: "read" },
  { id: "find_free_slots", summary: "find open time between events (read-only).", mutates: false, risk: "read" },
  { id: "create_event", summary: "add an event to your calendar.", mutates: true, risk: "write" },
  { id: "delete_event", summary: "delete an event (destructive — typed confirmation).", mutates: true, risk: "destructive" },
];

function bearer(creds: OAuthCredentials) {
  return { authorization: `Bearer ${creds.access_token}`, accept: "application/json" };
}

function str(v: unknown): string | undefined {
  return typeof v === "string" && v.trim() ? v.trim() : undefined;
}

interface GEvent {
  id?: string;
  summary?: string;
  start?: { dateTime?: string; date?: string };
  end?: { dateTime?: string; date?: string };
}

async function upcoming(creds: OAuthCredentials, timeMax?: string): Promise<GEvent[]> {
  const params = new URLSearchParams({
    maxResults: String(MAX_EVENTS),
    orderBy: "startTime",
    singleEvents: "true",
    timeMin: new Date().toISOString(),
  });
  if (timeMax) params.set("timeMax", timeMax);
  const res = await requestJson<{ items?: GEvent[] }>(`${API}/events?${params}`, {
    headers: bearer(creds),
    retries: 2,
  });
  return res.items ?? [];
}

async function calendarExecute(
  actionId: string,
  payload: Record<string, unknown>,
  creds: OAuthCredentials
): Promise<ActionResult> {
  switch (actionId) {
    case "list_events": {
      const items = await upcoming(creds);
      const titles = items.map((e) => e.summary ?? "(untitled)").slice(0, 10);
      // Event titles are UNTRUSTED content — data, never instructions.
      return {
        ok: true,
        summary: `found ${items.length} upcoming event${items.length === 1 ? "" : "s"}.`,
        detail: { count: items.length, titles, untrusted: true },
      };
    }
    case "find_free_slots": {
      // Free/busy over the next 7 days against the primary calendar.
      const timeMin = new Date();
      const timeMax = new Date(timeMin.getTime() + 7 * 86400_000);
      const res = await requestJson<{ calendars?: { primary?: { busy?: { start: string; end: string }[] } } }>(
        "https://www.googleapis.com/calendar/v3/freeBusy",
        {
          method: "POST",
          headers: bearer(creds),
          body: {
            timeMin: timeMin.toISOString(),
            timeMax: timeMax.toISOString(),
            items: [{ id: "primary" }],
          },
        }
      );
      const busy = res.calendars?.primary?.busy ?? [];
      return {
        ok: true,
        summary: `checked the next 7 days — ${busy.length} busy block${busy.length === 1 ? "" : "s"} found.`,
        detail: { busy: busy.slice(0, 25), untrusted: true },
      };
    }
    case "create_event": {
      const title = str(payload.title) ?? str(payload.summary);
      const start = str(payload.start);
      const end = str(payload.end);
      if (!title || !start || !end) {
        return { ok: false, summary: "an event needs a title, a start, and an end (ISO datetimes)." };
      }
      const created = await requestJson<GEvent>(`${API}/events`, {
        method: "POST",
        headers: bearer(creds),
        body: {
          summary: title,
          start: { dateTime: start },
          end: { dateTime: end },
          ...(str(payload.description) ? { description: str(payload.description) } : {}),
        },
      });
      return { ok: true, summary: `added “${title}” to your calendar.`, detail: { event_id: created.id } };
    }
    case "delete_event": {
      const id = str(payload.event_id) ?? str(payload.id);
      if (!id) return { ok: false, summary: "no event id given." };
      await requestJson(`${API}/events/${encodeURIComponent(id)}`, {
        method: "DELETE",
        headers: bearer(creds),
      });
      return { ok: true, summary: "deleted the event." };
    }
    default:
      return { ok: false, summary: "unknown Calendar action." };
  }
}

export const googleCalendarProvider = makeOAuthProvider({
  key: "google-calendar",
  name: "Google Calendar",
  detail: "list events, find free time, and (with your signature) add or delete events.",
  scopeSummary: "calendar: events only",
  tracks: ["upcoming events", "free time", "conflicts"],
  authorizeUrl: "https://accounts.google.com/o/oauth2/v2/auth",
  tokenUrl: "https://oauth2.googleapis.com/token",
  scopes:
    "https://www.googleapis.com/auth/userinfo.email https://www.googleapis.com/auth/calendar.events",
  usesPkce: true,
  extraAuthParams: { access_type: "offline", prompt: "consent" },
  // Same Google OAuth app as Gmail — configuring one configures both.
  clientIdEnv: "GOOGLE_CLIENT_ID",
  clientSecretEnv: "GOOGLE_CLIENT_SECRET",
  healthUrl: "https://www.googleapis.com/oauth2/v3/userinfo",
  healthLabel: (j) => (typeof j.email === "string" ? j.email : undefined),
  actions: CALENDAR_ACTIONS,
  execute: calendarExecute,
});
