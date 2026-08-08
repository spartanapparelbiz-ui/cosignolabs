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
  /**
   * Set when cosigno has no way to do this at all, at any setting. The row
   * still appears, because "it cannot" is the most reassuring answer on the
   * page and hiding it would leave the question unanswered — but it reports a
   * fact rather than offering a switch.
   */
  locked?: TrustSetting;
}

export const CAPABILITIES: Capability[] = [
  {
    id: "read",
    icon: "📖",
    title: "Read information",
    detail: "Read your emails, files, calendars, documents and connected apps.",
    categories: ["search"],
    pinned: false,
  },
  {
    id: "create",
    icon: "✍️",
    title: "Create content",
    detail: "Draft emails, documents, reports and notes. Drafts are never sent.",
    categories: ["summarize", "draft"],
    pinned: false,
  },
  {
    id: "send",
    icon: "📨",
    title: "Send messages",
    detail: "Send emails and messages using your connected accounts.",
    categories: ["send_email"],
    pinned: false,
  },
  {
    id: "edit",
    icon: "📝",
    title: "Edit information",
    detail: "Update files, calendar events, customer records and databases.",
    categories: ["update_record", "connection_call"],
    pinned: false,
  },
  {
    id: "publish",
    icon: "🚀",
    title: "Publish & deploy",
    detail: "Publish content, open and merge pull requests, and deploy sites.",
    categories: ["post_content"],
    pinned: false,
  },
  {
    id: "connect",
    icon: "🔗",
    title: "Send data elsewhere",
    detail: "Send information onward to other systems you've set up.",
    categories: ["webhook"],
    pinned: false,
  },
  {
    id: "money",
    icon: "💳",
    title: "Payments",
    detail: "Create invoices, process refunds and move money.",
    categories: ["spend", "refund", "payment"],
    pinned: true,
  },
  {
    id: "delete",
    icon: "🗑",
    title: "Delete",
    detail: "Delete files, records, repositories and other data.",
    categories: ["delete"],
    pinned: true,
  },
  {
    id: "security",
    icon: "🔒",
    title: "Security",
    detail: "Manage your secrets, connected accounts and security settings.",
    // Nothing maps here, and that is the answer. Cosigno has no way to connect
    // an account, read a stored credential or change a security setting — the
    // engine has no category for it and no tool that could reach one. Showing
    // a switch would invent a risk that doesn't exist and imply the opposite
    // setting were available.
    categories: [],
    pinned: true,
    locked: "never",
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
  if (capability.locked) return capability.locked;
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

/** Which answers a row may actually be set to. */
export function optionsFor(capability: Capability): TrustSetting[] {
  if (capability.locked) return [capability.locked];
  return capability.pinned ? ["ask", "never"] : ["always", "ask", "never"];
}

/** One sentence of feedback, shown the moment a setting changes. */
export function explain(setting: TrustSetting): string {
  switch (setting) {
    case "always":
      return "Cosigno may perform this action automatically.";
    case "ask":
      return "Cosigno will always pause for your approval.";
    case "never":
      return "Cosigno will refuse requests involving this action.";
  }
}

/* ------------------------------------------------------------- presets */

export type PresetId = "conservative" | "balanced" | "autonomous";

export interface Preset {
  id: PresetId;
  title: string;
  detail: string;
  /** The dot beside the name — a level you can read across the room. */
  dot: string;
  recommended?: boolean;
  /** Capability id → setting. Anything absent is left as the user had it. */
  settings: Record<string, TrustSetting>;
}

/**
 * Three starting points, and they are genuinely three.
 *
 * The line between them is what "safe work" means. Conservative treats every
 * change to your apps as something you sign for. Balanced treats a change
 * INSIDE an app you already connected — a record updated, an event moved — as
 * safe, and still stops before anything leaves your workspace. Autonomous
 * stops only where it must.
 *
 * Two presets with the same effect under different names would be a lie told
 * three times on the most important page in the product, so the difference is
 * real and each sentence describes it.
 *
 * None of them can make payments or deletion automatic — the engine pins
 * those, so a preset that claimed to would be writing a cheque it cannot cash.
 */
export const PRESETS: Preset[] = [
  {
    id: "conservative",
    title: "Conservative",
    dot: "🟢",
    detail:
      "Cosigno researches and prepares work on its own. Everything that changes your apps waits for your approval.",
    settings: {
      read: "always",
      create: "always",
      edit: "ask",
      send: "ask",
      publish: "ask",
      connect: "ask",
      money: "ask",
      delete: "ask",
    },
  },
  {
    id: "balanced",
    title: "Balanced",
    dot: "🟡",
    detail:
      "Cosigno handles safe work on its own, including updates inside your apps. It asks before anything leaves your workspace.",
    recommended: true,
    settings: {
      read: "always",
      create: "always",
      edit: "always",
      send: "ask",
      publish: "ask",
      connect: "ask",
      money: "ask",
      delete: "ask",
    },
  },
  {
    id: "autonomous",
    title: "Autonomous",
    dot: "🔵",
    detail:
      "Cosigno completes work with minimal interruptions. Payments, deletion and security still always need you.",
    settings: {
      read: "always",
      create: "always",
      edit: "always",
      send: "always",
      publish: "always",
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
