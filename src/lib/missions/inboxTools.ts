import { getStore } from "../store";
import { runProviderAction } from "../integrations/runtime/connections";
import { detectInjection } from "../agent/untrusted";
import { verifyCalendarEvent, verifyGmailSend } from "./verify";
import type { MissionTool, ToolContext } from "./tools";

/**
 * The three daily Gmail + Calendar jobs — Inbox Operator, Follow-up Operator,
 * and the Daily Operator Brief. Same honesty contract as every mission tool:
 * a tool runs against a REAL connection (sources name the provider) or a
 * clearly-labeled workspace sandbox, never a mix. Read-only work runs
 * automatically; drafts run automatically because a draft cannot transmit;
 * anything that sends, archives, labels, or schedules is only ever PROPOSED
 * here — the real provider call happens in verify(), after the card was
 * approved, and is then read back for evidence. Mail subjects and senders are
 * UNTRUSTED content: they are carried as data, scanned for injection, and can
 * never authorize a tool.
 */

interface MailItem {
  id: string;
  subject: string;
  from: string;
}

/** Deterministic sandbox fixtures — labeled everywhere they appear. */
const SANDBOX_MAIL = {
  newsletters: [
    { id: "sbx-n1", subject: "the weekly growth digest — 5 plays for july", from: "digest <news@example.com>" },
    { id: "sbx-n2", subject: "your monday product roundup", from: "roundup <letters@example.com>" },
    { id: "sbx-n3", subject: "flash sale: 40% off annual plans", from: "promos <offers@example.com>" },
  ] as MailItem[],
  leads: [
    { id: "sbx-l1", subject: "interested in a team plan for 12 seats", from: "jordan lee <jordan@example.com>" },
    { id: "sbx-l2", subject: "question about your onboarding timeline", from: "sam ortiz <sam@example.com>" },
  ] as MailItem[],
  waiting: [
    { id: "sbx-w1", subject: "re: proposal — any update?", from: "casey kim <casey@example.com>" },
    { id: "sbx-w2", subject: "following up on the pilot scope", from: "ari patel <ari@example.com>" },
  ] as MailItem[],
  events: ["product sync — 10:00", "pilot review — 13:30"],
};

const NEWSLETTER_QUERY = 'in:inbox (category:promotions OR "unsubscribe")';
const LEAD_QUERY = "in:inbox is:unread -category:promotions newer_than:7d";
const WAITING_QUERY = "in:inbox is:unread older_than:2d";
const SIGNAL_QUERY = "in:inbox is:unread newer_than:1d";
const MAX_READS = 3;

async function connectedApp(userId: string, providerKey: string) {
  const connections = await getStore().listConnections(userId);
  return (
    connections.find(
      (c) => c.kind === "app" && c.provider_key === providerKey && c.status === "connected"
    ) ?? null
  );
}

function outputOf(ctx: ToolContext, tool: string): Record<string, unknown> {
  const step = ctx.steps.find((s) => s.tool === tool && s.state === "completed");
  return step?.output ?? {};
}

function itemsOf(v: unknown): MailItem[] {
  return Array.isArray(v)
    ? (v as MailItem[]).filter((i) => i && typeof i.id === "string" && typeof i.subject === "string")
    : [];
}

/** Search + read a bounded sample of subjects for one Gmail query. */
async function scanQuery(
  userId: string,
  connectionId: string,
  query: string
): Promise<{ count: number; items: MailItem[] }> {
  const res = await runProviderAction(userId, connectionId, "search_messages", { query });
  if (!res.ok) throw new Error(res.summary);
  const count = typeof res.detail?.count === "number" ? (res.detail.count as number) : 0;
  const ids = Array.isArray(res.detail?.ids)
    ? (res.detail.ids as string[]).filter((x) => typeof x === "string")
    : [];
  const items: MailItem[] = [];
  for (const id of ids.slice(0, MAX_READS)) {
    const msg = await runProviderAction(userId, connectionId, "read_message", { id });
    if (msg.ok) {
      items.push({
        id,
        subject: String(msg.detail?.subject ?? "(no subject)"),
        from: String(msg.detail?.from ?? ""),
      });
    }
  }
  return { count, items };
}

/** "name <a@b.c>" → "a@b.c" (or the raw string when it's already bare). */
function addressOf(from: string): string {
  const m = from.match(/<([^>]+)>/);
  return (m ? m[1] : from).trim();
}

function injectionIn(items: MailItem[]): boolean {
  return items.some((i) => detectInjection(`${i.subject}\n${i.from}`));
}

async function writeDeliverable(
  ctx: ToolContext,
  name: string,
  content: string
): Promise<{ file_id: string; file_name: string }> {
  const file = await getStore().createFile({
    user_id: ctx.userId,
    session_id: ctx.mission.session_id,
    name,
    mime: "text/markdown",
    content,
  });
  return { file_id: file.id, file_name: file.name };
}

function list(items: string[]): string {
  return items.length ? items.map((i) => `- ${i}`).join("\n") : "_none_";
}

/* ------------------------------------------------------- inbox operator */

const inboxScan: MissionTool = {
  id: "inbox.scan",
  timeoutMs: 25_000,
  async run(ctx) {
    const conn = await connectedApp(ctx.userId, "google");
    if (conn) {
      const newsletters = await scanQuery(ctx.userId, conn.id, NEWSLETTER_QUERY);
      const leads = await scanQuery(ctx.userId, conn.id, LEAD_QUERY);
      const injected = injectionIn([...newsletters.items, ...leads.items]);
      return {
        kind: "ok",
        summary: `Scanned your inbox — ${newsletters.count} newsletter/promo message${newsletters.count === 1 ? "" : "s"} and ${leads.count} recent unread thread${leads.count === 1 ? "" : "s"} that may need you.`,
        output: {
          newsletters: newsletters.items,
          newsletter_count: newsletters.count,
          leads: leads.items,
          lead_count: leads.count,
          injected,
          simulated: false,
        },
        sources: [
          { name: "Gmail", detail: `${newsletters.count} messages matching ${NEWSLETTER_QUERY}` },
          { name: "Gmail", detail: `${leads.count} messages matching ${LEAD_QUERY}` },
        ],
      };
    }
    return {
      kind: "ok",
      summary: `Scanned the sandbox inbox — ${SANDBOX_MAIL.newsletters.length} newsletters and ${SANDBOX_MAIL.leads.length} waiting leads. connect Gmail to run this on your real inbox.`,
      output: {
        newsletters: SANDBOX_MAIL.newsletters,
        newsletter_count: SANDBOX_MAIL.newsletters.length,
        leads: SANDBOX_MAIL.leads,
        lead_count: SANDBOX_MAIL.leads.length,
        injected: false,
        simulated: true,
      },
      sources: [
        { name: "workspace sandbox", detail: "example inbox (Gmail not connected)", simulated: true },
      ],
    };
  },
};

const inboxSummarize: MissionTool = {
  id: "inbox.summarize",
  timeoutMs: 15_000,
  async run(ctx) {
    const scan = outputOf(ctx, "inbox.scan");
    const newsletters = itemsOf(scan.newsletters);
    const leads = itemsOf(scan.leads);
    const nNews = typeof scan.newsletter_count === "number" ? (scan.newsletter_count as number) : newsletters.length;
    const nLeads = typeof scan.lead_count === "number" ? (scan.lead_count as number) : leads.length;
    const simulated = scan.simulated !== false;
    const overview = [
      `${nNews} newsletter/promotional message${nNews === 1 ? "" : "s"} can be archived out of the inbox.`,
      nLeads > 0
        ? `${nLeads} thread${nLeads === 1 ? " needs" : "s need"} a human reply — drafts are prepared next (drafts never send).`
        : "No waiting threads need a reply right now.",
      ...leads.map((l) => `needs you: “${l.subject}” from ${l.from || "unknown sender"}`),
    ];
    return {
      kind: "ok",
      summary: `Summarized the scan: ${nNews} archivable, ${nLeads} needing a reply.`,
      output: { overview, newsletter_count: nNews, lead_count: nLeads, simulated },
      sources: [
        {
          name: simulated ? "workspace sandbox" : "analysis",
          detail: `summary of ${nNews + nLeads} scanned messages`,
          simulated,
        },
      ],
    };
  },
};

const inboxDraftReplies: MissionTool = {
  id: "inbox.draft_replies",
  timeoutMs: 25_000,
  async run(ctx) {
    const scan = outputOf(ctx, "inbox.scan");
    const leads = itemsOf(scan.leads).slice(0, MAX_READS);
    const simulated = scan.simulated !== false;
    if (leads.length === 0) {
      return {
        kind: "ok",
        summary: "No waiting threads to reply to — skipping the drafts.",
        output: { drafts: [], skipped: true, simulated },
        sources: [],
      };
    }

    const drafts = leads.map((l) => ({
      to: addressOf(l.from),
      subject: l.subject.toLowerCase().startsWith("re:") ? l.subject : `Re: ${l.subject}`,
      body: [
        `hi,`,
        "",
        `thanks for your note about “${l.subject}”. I wanted to make sure this didn't sit unanswered — here's where things stand on my side, and I'm happy to jump on a quick call if that's easier.`,
        "",
        "best",
      ].join("\n"),
    }));

    // Drafting is auto-safe because a draft cannot transmit. With Gmail
    // connected the drafts are REALLY saved to the account; otherwise they
    // exist only in the labeled sandbox deliverable.
    const conn = simulated ? null : await connectedApp(ctx.userId, "google");
    let saved = 0;
    if (conn) {
      for (const d of drafts) {
        const res = await runProviderAction(ctx.userId, conn.id, "create_draft", d);
        if (res.ok) saved++;
      }
    }

    const content = [
      `# reply drafts`,
      simulated
        ? `\n> sandbox drafts — example data, nothing exists in a real mail account.\n`
        : `\n> ${saved} draft${saved === 1 ? "" : "s"} saved to your Gmail Drafts — nothing has been sent.\n`,
      ...drafts.flatMap((d) => [`## to ${d.to} — ${d.subject}`, "", d.body, ""]),
    ].join("\n");
    const file = await writeDeliverable(ctx, "reply drafts", content);
    return {
      kind: "ok",
      summary: conn
        ? `drafted ${drafts.length} repl${drafts.length === 1 ? "y" : "ies"} — ${saved} saved to your Gmail Drafts, nothing sent.`
        : `drafted ${drafts.length} sandbox repl${drafts.length === 1 ? "y" : "ies"} — nothing sent.`,
      output: { ...file, deliverable: "replies", drafts, saved_to_gmail: saved, simulated },
      sources: [
        { name: "files", detail: `deliverable “${file.file_name}” saved (v1)` },
        ...(conn ? [{ name: "Gmail", detail: `${saved} drafts saved (drafts cannot send)` }] : []),
      ],
    };
  },
};

const inboxProposeCleanup: MissionTool = {
  id: "inbox.propose_cleanup",
  timeoutMs: 10_000,
  async run(ctx) {
    const scan = outputOf(ctx, "inbox.scan");
    const count = typeof scan.newsletter_count === "number" ? (scan.newsletter_count as number) : 0;
    const simulated = scan.simulated !== false;
    if (count === 0) {
      return {
        kind: "ok",
        summary: "No newsletter clutter found — nothing to archive.",
        output: { skipped: true, simulated },
        sources: [],
      };
    }
    return {
      kind: "propose",
      category: "update_record",
      summary: `Archive ${count} newsletter/promo message${count === 1 ? "" : "s"} out of the inbox (nothing is deleted)`,
      payload: {
        query: NEWSLETTER_QUERY,
        count,
        note: "Archive only — the messages stay searchable in All Mail; nothing is deleted.",
        simulated,
      },
    };
  },
  async verify(ctx, action) {
    if (action.payload.simulated === true) {
      return {
        ok: true,
        simulated: true,
        detail: "Sandbox cleanup — archived inside the workspace only; no real mailbox was touched.",
      };
    }
    const conn = await connectedApp(ctx.userId, "google");
    if (!conn) return { ok: false, detail: "Couldn't archive — Gmail is no longer connected. Nothing was changed." };
    const query = typeof action.payload.query === "string" ? action.payload.query : NEWSLETTER_QUERY;
    const res = await runProviderAction(ctx.userId, conn.id, "archive", { query });
    if (!res.ok) return { ok: false, detail: `the archive call failed: ${res.summary}` };
    // Read-back evidence: the same query should now match fewer inbox messages.
    const check = await runProviderAction(ctx.userId, conn.id, "search_messages", { query });
    const remaining = typeof check.detail?.count === "number" ? (check.detail.count as number) : null;
    return {
      ok: true,
      detail: `${res.summary} read-back: ${remaining ?? "?"} matching message${remaining === 1 ? "" : "s"} still in the inbox.`,
      checked: { query, remaining },
    };
  },
};

/* --------------------------------------------------- follow-up operator */

const followupFind: MissionTool = {
  id: "followup.find",
  timeoutMs: 25_000,
  async run(ctx) {
    const conn = await connectedApp(ctx.userId, "google");
    if (conn) {
      const { count, items } = await scanQuery(ctx.userId, conn.id, WAITING_QUERY);
      return {
        kind: "ok",
        summary: `Found ${count} thread${count === 1 ? "" : "s"} in your inbox unread for 2+ days — the ones most likely waiting on a response.`,
        output: { threads: items, count, injected: injectionIn(items), simulated: false },
        sources: [{ name: "Gmail", detail: `${count} messages matching ${WAITING_QUERY}` }],
      };
    }
    return {
      kind: "ok",
      summary: `Found ${SANDBOX_MAIL.waiting.length} sandbox threads waiting on a response. connect Gmail to run this on your real inbox.`,
      output: { threads: SANDBOX_MAIL.waiting, count: SANDBOX_MAIL.waiting.length, injected: false, simulated: true },
      sources: [{ name: "workspace sandbox", detail: "example threads (Gmail not connected)", simulated: true }],
    };
  },
};

/** First open 30-minute morning slot tomorrow (9:00–12:00), avoiding busy blocks. */
function proposeSendTime(busy: { start: string; end: string }[]): string {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  for (let hour = 9; hour < 12; hour++) {
    d.setHours(hour, 0, 0, 0);
    const startMs = d.getTime();
    const endMs = startMs + 30 * 60_000;
    const clash = busy.some((b) => {
      const bs = Date.parse(b.start);
      const be = Date.parse(b.end);
      return Number.isFinite(bs) && Number.isFinite(be) && bs < endMs && be > startMs;
    });
    if (!clash) return d.toISOString();
  }
  d.setHours(12, 0, 0, 0);
  return d.toISOString();
}

const followupDraft: MissionTool = {
  id: "followup.draft",
  timeoutMs: 25_000,
  async run(ctx) {
    const found = outputOf(ctx, "followup.find");
    const threads = itemsOf(found.threads).slice(0, MAX_READS);
    const simulated = found.simulated !== false;
    if (threads.length === 0) {
      return {
        kind: "ok",
        summary: "No threads are waiting on a response — nothing to draft.",
        output: { drafts: [], skipped: true, simulated },
        sources: [],
      };
    }

    const drafts = threads.map((t) => ({
      to: addressOf(t.from),
      subject: t.subject.toLowerCase().startsWith("re:") ? t.subject : `Re: ${t.subject}`,
      body: [
        `hi,`,
        "",
        `following up on “${t.subject}” — I didn't want this to slip. is there anything you need from me to move it forward?`,
        "",
        "best",
      ].join("\n"),
    }));

    // Save real drafts when Gmail is connected (drafts cannot transmit), and
    // pick a send time from the REAL calendar's free/busy when it's connected.
    const gmail = simulated ? null : await connectedApp(ctx.userId, "google");
    let saved = 0;
    if (gmail) {
      for (const d of drafts) {
        const res = await runProviderAction(ctx.userId, gmail.id, "create_draft", d);
        if (res.ok) saved++;
      }
    }
    const cal = await connectedApp(ctx.userId, "google-calendar");
    let busy: { start: string; end: string }[] = [];
    let sendTimeLive = false;
    if (cal) {
      const res = await runProviderAction(ctx.userId, cal.id, "find_free_slots", {});
      if (res.ok && Array.isArray(res.detail?.busy)) {
        busy = res.detail.busy as { start: string; end: string }[];
        sendTimeLive = true;
      }
    }
    const send_time = proposeSendTime(busy);

    const content = [
      `# follow-up drafts`,
      simulated
        ? `\n> sandbox drafts — example data, nothing exists in a real mail account.\n`
        : `\n> ${saved} draft${saved === 1 ? "" : "s"} saved to your Gmail Drafts — nothing has been sent.\n`,
      `**proposed send time:** ${send_time}${sendTimeLive ? " (from your real calendar's free/busy)" : " (default morning slot — connect Google Calendar for a conflict-checked time)"}`,
      "",
      ...drafts.flatMap((d) => [`## to ${d.to} — ${d.subject}`, "", d.body, ""]),
    ].join("\n");
    const file = await writeDeliverable(ctx, "follow-up drafts", content);
    return {
      kind: "ok",
      summary: `Drafted ${drafts.length} follow-up${drafts.length === 1 ? "" : "s"}${gmail ? ` (${saved} saved to Gmail Drafts)` : ""} and proposed a send time — nothing sent.`,
      output: { ...file, deliverable: "followups", drafts, send_time, send_time_live: sendTimeLive, saved_to_gmail: saved, simulated },
      sources: [
        { name: "files", detail: `deliverable “${file.file_name}” saved (v1)` },
        ...(gmail ? [{ name: "Gmail", detail: `${saved} drafts saved (drafts cannot send)` }] : []),
        ...(cal ? [{ name: "Google Calendar", detail: "free/busy checked for the send time" }] : []),
      ],
    };
  },
};

const followupOfferSend: MissionTool = {
  id: "followup.offer_send",
  timeoutMs: 10_000,
  async run(ctx) {
    const out = outputOf(ctx, "followup.draft");
    const drafts = Array.isArray(out.drafts) ? (out.drafts as { to: string; subject: string; body: string }[]) : [];
    const simulated = out.simulated !== false;
    const first = drafts[0];
    if (!first || !first.to) {
      return {
        kind: "ok",
        summary: "No follow-up draft to offer — nothing to send.",
        output: { skipped: true, simulated },
        sources: [],
      };
    }
    const send_time = typeof out.send_time === "string" ? out.send_time : null;
    return {
      kind: "propose",
      category: "send_email",
      summary: `Send the follow-up “${first.subject}” to ${first.to}`,
      payload: { to: first.to, subject: first.subject, body: first.body, send_time, simulated },
    };
  },
  async verify(ctx, action) {
    // The card's approval authorizes exactly this send; the REAL provider call
    // happens here, post-approval, then is read back from Sent Mail.
    if (action.payload.simulated === true) {
      return {
        ok: true,
        simulated: true,
        detail: "Sandbox send — verified inside the workspace; no external mail exists.",
      };
    }
    const conn = await connectedApp(ctx.userId, "google");
    if (!conn) return { ok: false, detail: "Couldn't send — Gmail is no longer connected. Nothing was sent." };
    const to = typeof action.payload.to === "string" ? action.payload.to : "";
    const subject = typeof action.payload.subject === "string" ? action.payload.subject : "";
    const body = typeof action.payload.body === "string" ? action.payload.body : "";
    const res = await runProviderAction(ctx.userId, conn.id, "send_message", { to, subject, body });
    if (!res.ok) return { ok: false, detail: `the send failed: ${res.summary}` };
    return verifyGmailSend(ctx.userId, { subject });
  },
};

function reminderTopic(ctx: ToolContext): { title: string; simulated: boolean } | null {
  const drafts = outputOf(ctx, "followup.draft");
  const d = Array.isArray(drafts.drafts) ? (drafts.drafts as { subject?: string }[])[0] : undefined;
  if (d?.subject) return { title: `follow up: ${d.subject}`, simulated: drafts.simulated !== false };
  const signals = outputOf(ctx, "brief.signals");
  const s = Array.isArray(signals.subjects) ? (signals.subjects as string[])[0] : undefined;
  if (s) return { title: `handle: ${s}`, simulated: signals.simulated !== false };
  return null;
}

const calendarProposeReminder: MissionTool = {
  id: "calendar.propose_reminder",
  timeoutMs: 10_000,
  async run(ctx) {
    const topic = reminderTopic(ctx);
    if (!topic) {
      return {
        kind: "ok",
        summary: "Nothing needs a reminder — no calendar change proposed.",
        output: { skipped: true },
        sources: [],
      };
    }
    const start = new Date();
    start.setDate(start.getDate() + 1);
    start.setHours(9, 0, 0, 0);
    const end = new Date(start.getTime() + 15 * 60_000);
    return {
      kind: "propose",
      category: "update_record",
      summary: `Add a 15-minute reminder “${topic.title}” to your calendar tomorrow at 9:00`,
      payload: { title: topic.title, start: start.toISOString(), end: end.toISOString(), simulated: topic.simulated },
    };
  },
  async verify(ctx, action) {
    if (action.payload.simulated === true) {
      return {
        ok: true,
        simulated: true,
        detail: "Sandbox reminder — recorded inside the workspace; no real calendar was touched.",
      };
    }
    const conn = await connectedApp(ctx.userId, "google-calendar");
    if (!conn) return { ok: false, detail: "Couldn't schedule — Google Calendar is no longer connected. Nothing was created." };
    const title = typeof action.payload.title === "string" ? action.payload.title : "follow-up reminder";
    const start = typeof action.payload.start === "string" ? action.payload.start : "";
    const end = typeof action.payload.end === "string" ? action.payload.end : "";
    const res = await runProviderAction(ctx.userId, conn.id, "create_event", { title, start, end });
    if (!res.ok) return { ok: false, detail: `creating the event failed: ${res.summary}` };
    return verifyCalendarEvent(ctx.userId, { title, when: start });
  },
};

/* ------------------------------------------------------ daily brief */

const briefCalendar: MissionTool = {
  id: "brief.calendar",
  timeoutMs: 20_000,
  async run(ctx) {
    const conn = await connectedApp(ctx.userId, "google-calendar");
    if (conn) {
      const res = await runProviderAction(ctx.userId, conn.id, "list_events", {});
      if (!res.ok) throw new Error(res.summary);
      const titles = Array.isArray(res.detail?.titles) ? (res.detail.titles as string[]) : [];
      return {
        kind: "ok",
        summary: `Read your calendar — ${titles.length} upcoming event${titles.length === 1 ? "" : "s"}.`,
        output: { events: titles, count: titles.length, simulated: false },
        sources: [{ name: "Google Calendar", detail: `${titles.length} upcoming events` }],
      };
    }
    return {
      kind: "ok",
      summary: `Read the sandbox calendar — ${SANDBOX_MAIL.events.length} events. connect Google Calendar for your real schedule.`,
      output: { events: SANDBOX_MAIL.events, count: SANDBOX_MAIL.events.length, simulated: true },
      sources: [{ name: "workspace sandbox", detail: "example schedule (calendar not connected)", simulated: true }],
    };
  },
};

const briefSignals: MissionTool = {
  id: "brief.signals",
  timeoutMs: 25_000,
  async run(ctx) {
    const conn = await connectedApp(ctx.userId, "google");
    if (conn) {
      const { count, items } = await scanQuery(ctx.userId, conn.id, SIGNAL_QUERY);
      const subjects = items.map((i) => i.subject);
      return {
        kind: "ok",
        summary: `Read the overnight inbox — ${count} new unread message${count === 1 ? "" : "s"}.`,
        output: { count, subjects, injected: injectionIn(items), simulated: false },
        sources: [{ name: "Gmail", detail: `${count} messages matching ${SIGNAL_QUERY}` }],
      };
    }
    const subjects = SANDBOX_MAIL.leads.map((l) => l.subject);
    return {
      kind: "ok",
      summary: `Read the sandbox inbox — ${subjects.length} overnight signals. connect Gmail for your real mail.`,
      output: { count: subjects.length, subjects, injected: false, simulated: true },
      sources: [{ name: "workspace sandbox", detail: "example signals (Gmail not connected)", simulated: true }],
    };
  },
};

const deliverableDailyBrief: MissionTool = {
  id: "deliverable.daily_brief",
  timeoutMs: 15_000,
  async run(ctx) {
    const cal = outputOf(ctx, "brief.calendar");
    const sig = outputOf(ctx, "brief.signals");
    const events = Array.isArray(cal.events) ? (cal.events as string[]) : [];
    const subjects = Array.isArray(sig.subjects) ? (sig.subjects as string[]) : [];
    const nSignals = typeof sig.count === "number" ? (sig.count as number) : subjects.length;
    const simulated = cal.simulated !== false || sig.simulated !== false;
    const priorities = [
      ...subjects.slice(0, 2).map((s) => `respond to “${s}”`),
      ...(events.length ? [`prepare for ${events[0]}`] : []),
    ];
    const today = new Date().toISOString().slice(0, 10);
    const content = [
      `# daily operator brief — ${today}`,
      simulated
        ? `\n> sandbox brief — built from example data, clearly marked. connect Gmail and Google Calendar for a live one.\n`
        : "",
      `## today's schedule\n\n${list(events)}`,
      "",
      `## inbox signals (${nSignals} new)\n\n${list(subjects.map((s) => `“${s}”`))}`,
      "",
      `## suggested priorities\n\n${list(priorities)}`,
    ].join("\n");
    const file = await writeDeliverable(ctx, `daily brief — ${today}`, content);
    return {
      kind: "ok",
      summary: `Morning brief written from ${events.length} calendar event${events.length === 1 ? "" : "s"} and ${nSignals} inbox signal${nSignals === 1 ? "" : "s"}.`,
      output: { ...file, deliverable: "daily-brief" },
      sources: [{ name: "files", detail: `deliverable “${file.file_name}” saved (v1)`, simulated }],
    };
  },
};

export const INBOX_TOOLS: Record<string, MissionTool> = {
  [inboxScan.id]: inboxScan,
  [inboxSummarize.id]: inboxSummarize,
  [inboxDraftReplies.id]: inboxDraftReplies,
  [inboxProposeCleanup.id]: inboxProposeCleanup,
  [followupFind.id]: followupFind,
  [followupDraft.id]: followupDraft,
  [followupOfferSend.id]: followupOfferSend,
  [calendarProposeReminder.id]: calendarProposeReminder,
  [briefCalendar.id]: briefCalendar,
  [briefSignals.id]: briefSignals,
  [deliverableDailyBrief.id]: deliverableDailyBrief,
};
