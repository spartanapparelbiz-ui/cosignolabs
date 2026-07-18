import { getStore } from "./store";
import { nextRunAt } from "./automations";
import type { AutomationRecord } from "./types";

/**
 * Cosigno Skills — installable, preconfigured capability packs. A skill is
 * nothing magical: installing one creates a small set of named recurring
 * rules (watches in monitor mode, preparation rules in prepare mode) that
 * make cosigno useful the moment onboarding ends. Every rule runs through
 * the same pipeline as a typed command, and nothing a skill prepares
 * executes without the user's approval or signature. Uninstalling deletes
 * exactly the rules the skill created (matched by its name prefix).
 */

interface SkillItem {
  name: string;
  command: string;
  interval_hours: number;
  mode: "monitor" | "prepare";
}

export interface SkillDef {
  key: string;
  name: string;
  tagline: string;
  items: SkillItem[];
}

export const SKILLS: SkillDef[] = [
  {
    key: "inbox-operator",
    name: "Inbox Operator",
    tagline: "Email handled: organized, triaged, responses prepared.",
    items: [
      {
        name: "Morning inbox review",
        command:
          "Review my unread email, identify the messages that actually matter, and prepare replies for the ones that need action.",
        interval_hours: 24,
        mode: "prepare",
      },
      {
        name: "Important sender watch",
        command:
          "Watch my inbox for messages from important senders (investors, key customers, my team) and tell me when one arrives.",
        interval_hours: 1,
        mode: "monitor",
      },
      {
        name: "Newsletter cleanup",
        command: "Find newsletters and promotional email from this week and prepare an archive list for my approval.",
        interval_hours: 168,
        mode: "prepare",
      },
    ],
  },
  {
    key: "meeting-operator",
    name: "Meeting Operator",
    tagline: "Every meeting arrives prepared: briefs, context, follow-ups.",
    items: [
      {
        name: "Tomorrow's meeting briefs",
        command:
          "Look at tomorrow's calendar, gather context for each meeting from email and files, and prepare a short brief with a draft agenda for each.",
        interval_hours: 24,
        mode: "prepare",
      },
      {
        name: "Calendar conflict watch",
        command: "Watch my calendar for conflicts or double-bookings this week and tell me when one appears.",
        interval_hours: 1,
        mode: "monitor",
      },
      {
        name: "Follow-up drafts",
        command: "For meetings that ended today, prepare follow-up notes and draft any promised emails for my review.",
        interval_hours: 24,
        mode: "prepare",
      },
    ],
  },
  {
    key: "founder-operator",
    name: "Founder Operator",
    tagline: "Daily priorities, key conversations, investor updates — organized.",
    items: [
      {
        name: "Daily priorities",
        command:
          "Each morning, review my email, calendar, and open missions, and prepare a short list of today's priorities.",
        interval_hours: 24,
        mode: "prepare",
      },
      {
        name: "Important conversation tracker",
        command:
          "Watch my email for ongoing important conversations that have gone quiet for more than three days and tell me which need a nudge.",
        interval_hours: 24,
        mode: "monitor",
      },
      {
        name: "Investor update prep",
        command:
          "Each week, gather what changed (wins, metrics, blockers) and prepare a draft investor update for my review.",
        interval_hours: 168,
        mode: "prepare",
      },
    ],
  },
  {
    key: "sales-operator",
    name: "Sales Operator",
    tagline: "Leads researched, outreach drafted, opportunities never go cold.",
    items: [
      {
        name: "Stale opportunity watch",
        command:
          "Watch my sales opportunities and tell me when one has had no activity for seven days.",
        interval_hours: 24,
        mode: "monitor",
      },
      {
        name: "Outreach preparation",
        command:
          "Each day, research my newest leads and prepare personalized outreach drafts for my review.",
        interval_hours: 24,
        mode: "prepare",
      },
      {
        name: "Follow-up drafts",
        command:
          "Prepare follow-up drafts for opportunities that were contacted but haven't replied within four days.",
        interval_hours: 24,
        mode: "prepare",
      },
    ],
  },
];

const prefix = (skill: SkillDef) => `${skill.name} · `;

/** Which skills are installed (any of their prefixed rules exist). */
export function installedKeys(automations: AutomationRecord[]): Set<string> {
  const installed = new Set<string>();
  for (const skill of SKILLS) {
    if (automations.some((a) => a.name.startsWith(prefix(skill)))) installed.add(skill.key);
  }
  return installed;
}

/** Install: create the skill's rules (skipping any that already exist). */
export async function installSkill(userId: string, key: string): Promise<number> {
  const skill = SKILLS.find((s) => s.key === key);
  if (!skill) throw new Error("unknown_skill");
  const store = getStore();
  const existing = await store.listAutomations(userId);
  let created = 0;
  for (const item of skill.items) {
    const name = `${skill.name} · ${item.name}`;
    if (existing.some((a) => a.name === name)) continue;
    await store.createAutomation({
      user_id: userId,
      name,
      command: item.command,
      interval_hours: item.interval_hours,
      mode: item.mode,
      next_run_at: nextRunAt(item.interval_hours),
    });
    await store.logAudit(userId, "automation_created", {
      name,
      interval_hours: item.interval_hours,
      mode: item.mode,
      skill: skill.key,
    });
    created += 1;
  }
  return created;
}

/** Uninstall: delete exactly the rules this skill created. */
export async function uninstallSkill(userId: string, key: string): Promise<number> {
  const skill = SKILLS.find((s) => s.key === key);
  if (!skill) throw new Error("unknown_skill");
  const store = getStore();
  const mine = (await store.listAutomations(userId)).filter((a) => a.name.startsWith(prefix(skill)));
  for (const a of mine) {
    await store.deleteAutomation(userId, a.id);
    await store.logAudit(userId, "automation_deleted", { id: a.id, skill: skill.key });
  }
  return mine.length;
}
