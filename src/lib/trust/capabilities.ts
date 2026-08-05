import { CATEGORIES, type ActionCategory, type Tier } from "../types";

/**
 * The Trust Center's model: what cosigno may do, in capabilities a person
 * recognises rather than the categories the engine dispatches on.
 *
 * Nobody has an opinion about "update_record" or "connection_call". Everybody
 * has an opinion about whether AI may send email on their behalf. This maps
 * one to the other so the page can ask the question people can actually
 * answer.
 *
 * The mapping is deliberately lossless in the safe direction: setting a
 * capability sets every category behind it, and reading one reports the
 * STRICTEST setting among them. A capability that showed "automatic" while one
 * of its categories still required approval would be the page's only job done
 * wrong.
 */

export type TrustSetting = "always" | "ask" | "never";

export interface Capability {
  id: string;
  icon: string;
  title: string;
  /** One sentence, in the reader's words. */
  detail: string;
  categories: ActionCategory[];
  /**
   * True when the engine pins this above automatic and will clamp any attempt
   * to lower it. The control must not offer "always" here — a switch that
   * silently snaps back is worse than one that isn't there.
   */
  pinned: boolean;
}

export const CAPABILITIES: Capability[] = [
  {
    id: "read",
    icon: "📖",
    title: "Read information",
    detail: "Search and read your email, files, calendar and connected apps.",
    categories: ["search"],
    pinned: false,
  },
  {
    id: "create",
    icon: "✍️",
    title: "Create content",
    detail: "Draft emails, documents, reports and summaries. Drafts are never sent.",
    categories: ["summarize", "draft"],
    pinned: false,
  },
  {
    id: "send",
    icon: "📨",
    title: "Send messages",
    detail: "Send email and messages from your connected accounts.",
    categories: ["send_email"],
    pinned: false,
  },
  {
    id: "publish",
    icon: "🚀",
    title: "Publish and share",
    detail: "Post content, open issues and publish work in your connected apps.",
    categories: ["post_content"],
    pinned: false,
  },
  {
    id: "change",
    icon: "📝",
    title: "Change information",
    detail: "Update records, files and calendar events inside your connected apps.",
    categories: ["update_record", "connection_call"],
    pinned: false,
  },
  {
    id: "connect",
    icon: "🔗",
    title: "Send data elsewhere",
    detail: "Send information to other systems you've set up.",
    categories: ["webhook"],
    pinned: false,
  },
  {
    id: "money",
    icon: "💳",
    title: "Money",
    detail: "Spend, refund and move money.",
    categories: ["spend", "refund", "payment"],
    pinned: true,
  },
  {
    id: "delete",
    icon: "🗑",
    title: "Delete things",
    detail: "Delete files, records and data.",
    categories: ["delete"],
    pinned: true,
  },
];

/** Every engine category belongs to exactly one capability — nothing hidden. */
export function uncoveredCategories(): ActionCategory[] {
  const covered = new Set(CAPABILITIES.flatMap((c) => c.categories));
  return (Object.keys(CATEGORIES) as ActionCategory[]).filter((c) => !covered.has(c));
}

/**
 * What a capability is currently set to, from the tiers behind it.
 *
 * Reports the STRICTEST of its categories. If one of them still needs
 * approval, the capability needs approval — rounding toward "automatic" would
 * tell someone they are less protected than they are.
 */
export function settingFor(
  capability: Capability,
  tiers: Record<string, Tier>,
  forbidden: ReadonlySet<string>
): TrustSetting {
  if (capability.categories.some((c) => forbidden.has(c))) return "never";
  const strictest = Math.max(
    ...capability.categories.map((c) => {
      const meta = CATEGORIES[c];
      // A pinned category IS its default tier — the engine will never resolve
      // it lower. Reading a caller's number here would let a stale or wrong
      // tier put the word "automatic" next to deletion, which is the one
      // sentence this page must never be able to print.
      if (meta.pinned) return meta.defaultTier;
      return tiers[c] ?? meta.defaultTier;
    })
  );
  return strictest > 1 ? "ask" : "always";
}

/** The tier a setting maps to. `never` is a rule, not a tier. */
export function tierForSetting(capability: Capability, setting: TrustSetting): Tier | null {
  if (setting === "never") return null;
  if (setting === "always") {
    // A pinned capability cannot be made automatic. The caller shouldn't offer
    // it; this is the second line of defence.
    return capability.pinned ? null : 1;
  }
  return capability.pinned ? 3 : 2;
}

/** One sentence of feedback, shown the moment a setting changes. */
export function explain(setting: TrustSetting): string {
  switch (setting) {
    case "always":
      return "Cosigno does this automatically, without asking.";
    case "ask":
      return "Cosigno pauses and waits for your approval every time.";
    case "never":
      return "Cosigno refuses to do this, even if you ask it to.";
  }
}

/* ------------------------------------------------------------- presets */

export type PresetId = "conservative" | "balanced" | "autonomous";

export interface Preset {
  id: PresetId;
  title: string;
  detail: string;
  recommended?: boolean;
  /** Capability id → setting. Anything absent is left as the user had it. */
  settings: Record<string, TrustSetting>;
}

/**
 * Three starting points. None of them can make money or deletion automatic —
 * the engine pins those, so a preset that claimed to would be writing a cheque
 * it cannot cash.
 */
export const PRESETS: Preset[] = [
  {
    id: "conservative",
    title: "Conservative",
    detail: "Cosigno reads and researches on its own. Everything else — including writing a draft — waits for you.",
    settings: {
      read: "always",
      create: "ask",
      send: "ask",
      publish: "ask",
      change: "ask",
      connect: "ask",
      money: "ask",
      delete: "ask",
    },
  },
  {
    id: "balanced",
    title: "Balanced",
    detail: "Cosigno reads, researches and drafts on its own. Anything that leaves your workspace waits for you.",
    recommended: true,
    settings: {
      read: "always",
      create: "always",
      send: "ask",
      publish: "ask",
      change: "ask",
      connect: "ask",
      money: "ask",
      delete: "ask",
    },
  },
  {
    id: "autonomous",
    title: "Autonomous",
    detail: "Cosigno sends, publishes and updates without stopping. Money and deletion still always need you.",
    settings: {
      read: "always",
      create: "always",
      send: "always",
      publish: "always",
      change: "always",
      connect: "always",
      money: "ask",
      delete: "ask",
    },
  },
];

/** Which preset the current settings match, or null when they're custom. */
export function activePreset(current: Record<string, TrustSetting>): PresetId | null {
  for (const preset of PRESETS) {
    const matches = Object.entries(preset.settings).every(
      ([id, want]) => current[id] === want
    );
    if (matches) return preset.id;
  }
  return null;
}
