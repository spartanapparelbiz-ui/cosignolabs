import { OPERATOR_PROFILES } from "../missions/operators";

/**
 * SPECIALIST IDENTITY — what the person sees when a specialist does work.
 *
 * The runtime already has real, enforced operator profiles (see
 * missions/operators.ts): each one may run a fixed set of tools and nothing
 * else. Those are execution boundaries, written in the engine's vocabulary.
 * This module is their public face, and it exists because "communication
 * operator ran gmail.search_related" and "your inbox specialist read the
 * thread" describe the same event to two entirely different audiences.
 *
 * THE IDENTITY SYSTEM, AND WHY IT ISN'T COLOUR.
 *
 * cosigno's palette is ink, cream, and one signal orange (BRAND.md). Handing
 * six specialists six colours would double the palette to make an org chart
 * legible, and the product would immediately look like every other dashboard
 * with a rainbow legend. So identity is carried by things the brand already
 * has room for:
 *
 *   · SYMBOL     a distinct geometric mark, drawn from what the work IS
 *   · CHARACTER  how it writes — the difference between an engineer's note
 *                and a researcher's
 *   · SIGNATURE  how its mark behaves while it is working; a precise
 *                specialist snaps, a research specialist sweeps
 *   · DENSITY    how much detail it puts on screen by default
 *
 * You should be able to tell the engineering specialist from the research
 * specialist across a room, with the screen in greyscale, and with motion
 * turned off — which is exactly the test colour alone fails.
 */

export type SpecialistKey = keyof typeof OPERATOR_PROFILES;

/** How a specialist's mark behaves while its work is in flight. */
export type MotionSignature =
  /** precise, stepped — engineering, calendar */
  | "snap"
  /** a slow sweep — research, browsing */
  | "sweep"
  /** a soft in-and-out — communication */
  | "breathe"
  /** layered shift — files */
  | "shuffle"
  /** the operator itself; steady */
  | "steady";

export interface SpecialistIdentity {
  key: string;
  /** What the user calls it. Never "operator" — that word is cosigno itself. */
  name: string;
  /** One plain sentence: what this specialist is for. */
  does: string;
  /** What it will never do, in the user's words. From the enforced profile. */
  never: string;
  /** How it communicates — used to keep its summaries in character. */
  character: string;
  /** Geometry id, rendered by SpecialistMark. */
  symbol: "inbox" | "schedule" | "research" | "files" | "web" | "code" | "chief";
  signature: MotionSignature;
  /** How much detail it shows before you ask for more. */
  density: "spare" | "balanced" | "dense";
}

/**
 * One identity per enforced operator profile. Keys match exactly — a
 * specialist the engine can run but the interface can't name would show up as
 * "cosigno did something", which is the failure this table prevents.
 */
export const SPECIALISTS: Record<string, SpecialistIdentity> = {
  communication: {
    key: "communication",
    name: "Inbox specialist",
    does: "Reads the threads you've allowed and prepares what to say back.",
    never: "Sends anything. Sending always waits for your approval.",
    character: "Brief and quotable — it writes the way you'd want the reply to read.",
    symbol: "inbox",
    signature: "breathe",
    density: "spare",
  },
  calendar: {
    key: "calendar",
    name: "Schedule specialist",
    does: "Finds events, free time, and conflicts across your calendar.",
    never: "Creates, moves, or cancels anything you haven't approved.",
    character: "Exact about times and deliberately boring about everything else.",
    symbol: "schedule",
    signature: "snap",
    density: "spare",
  },
  research: {
    key: "research",
    name: "Research specialist",
    does: "Compares the evidence and tells you what it actually supports.",
    never: "Sends, buys, publishes, or changes anything outside cosigno.",
    character: "Calm and evidence-first — every claim arrives with what backs it.",
    symbol: "research",
    signature: "sweep",
    density: "dense",
  },
  files: {
    key: "files",
    name: "Document specialist",
    does: "Reads the files you've shared and writes what the work produces.",
    never: "Deletes anything, or shares a file outside without approval.",
    character: "Structured — headings, then the point, then the detail.",
    symbol: "files",
    signature: "shuffle",
    density: "balanced",
  },
  browser: {
    key: "browser",
    name: "Web specialist",
    does: "Looks things up on the open web and prepares web actions.",
    never: "Submits a form, buys anything, or changes an account setting alone.",
    character: "Reports what the page said, and says when a page wouldn't load.",
    symbol: "web",
    signature: "sweep",
    density: "balanced",
  },
  code: {
    key: "code",
    name: "Engineering specialist",
    does: "Reads your repositories and issues, and drafts the changes to make.",
    never: "Opens an issue, comments, or writes code without approval.",
    character: "Precise and structured — exact names, exact numbers, no adjectives.",
    symbol: "code",
    signature: "snap",
    density: "dense",
  },
  chief: {
    key: "chief",
    name: "cosigno",
    does: "Decides which specialists are needed, sequences them, and closes out.",
    never: "Grants itself permissions it wasn't given.",
    character: "Direct. Says what happened, what's next, and what it needs from you.",
    symbol: "chief",
    signature: "steady",
    density: "spare",
  },
};

/**
 * The identity for an operator key.
 *
 * Falls back to cosigno itself rather than inventing a specialist: an unnamed
 * key means the engine grew a profile the interface hasn't been taught yet,
 * and attributing that work to a plausible-sounding specialist would be a
 * confident lie. cosigno taking responsibility for it is true in every case.
 */
export function specialistFor(operatorKey: string | null | undefined): SpecialistIdentity {
  if (!operatorKey) return SPECIALISTS.chief;
  return SPECIALISTS[operatorKey] ?? SPECIALISTS.chief;
}

/** Every specialist that touched a set of steps, in the order they appeared. */
export function specialistsUsed(
  steps: { operator: string }[]
): SpecialistIdentity[] {
  const seen = new Set<string>();
  const out: SpecialistIdentity[] = [];
  for (const s of steps) {
    const id = specialistFor(s.operator);
    if (seen.has(id.key)) continue;
    seen.add(id.key);
    out.push(id);
  }
  return out;
}
