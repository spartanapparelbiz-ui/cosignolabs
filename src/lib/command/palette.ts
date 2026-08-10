import type { ResultKind, SearchResult } from "../search/global";

/**
 * The command palette's own logic — what ⌘K can DO, as opposed to what it can
 * find.
 *
 * The distinction matters, and it is where most palettes go wrong. A palette
 * that only navigates is a search box with a keyboard shortcut. A palette that
 * executes anything is a way to fire consequential work from a text field
 * without reading it, which is the exact failure mode this product exists to
 * prevent.
 *
 * So the rule here is precise: **the palette may compose and it may navigate.
 * It may never authorise.** Typing a goal puts it in the ask box, where the
 * normal understanding-and-confirm flow runs. A decision found by search is
 * opened, not signed — the deliberate approval interaction is the product, and
 * a "quick approve" shortcut would quietly delete it.
 *
 * Pure and total, so the whole grammar is unit-testable without a DOM.
 */

export type ActionKind = "delegate" | "navigate";

export interface PaletteAction {
  kind: ActionKind;
  /** What the row reads. */
  title: string;
  /** One line of context. */
  subtitle: string;
  /** Where it goes. */
  href: string;
  /** Text to put in the ask box on arrival. Delegate actions only. */
  compose?: string;
}

/** Verbs the palette understands at the start of a query. */
const VERBS: Array<{ match: RegExp; strip: RegExp }> = [
  { match: /^(delegate|do|ask|run|start|have cosigno)\s+/i, strip: /^(delegate|do|ask|run|start|have cosigno)\s+/i },
];

/** Queries that read as a request rather than a lookup. */
const REQUEST_SHAPED =
  /\b(draft|send|review|research|prepare|summar[iy]|find|check|follow up|clean|plan|write|compare|watch)\b/i;

/**
 * Whether this query is a thing to DO rather than a thing to find.
 *
 * Two signals, both conservative: an explicit verb prefix ("delegate …"), or a
 * sentence long enough and request-shaped enough that treating it as a search
 * term would obviously return nothing useful. A short noun ("gmail") is always
 * a lookup — offering to delegate "gmail" is nonsense the reader has to skip
 * past on every keystroke.
 */
export function looksLikeRequest(query: string): boolean {
  const q = query.trim();
  if (q.length < 3) return false;
  if (VERBS.some((v) => v.match.test(q))) return true;
  const words = q.split(/\s+/).length;
  return words >= 3 && REQUEST_SHAPED.test(q);
}

/** The goal text, with any leading command verb removed. */
export function goalFrom(query: string): string {
  let q = query.trim();
  for (const v of VERBS) q = q.replace(v.strip, "");
  return q.trim();
}

/**
 * The actions available for a query, best first.
 *
 * A delegate action leads when the query reads as a request; otherwise the
 * palette stays out of the way and lets the search results speak.
 */
export function actionsFor(query: string): PaletteAction[] {
  const q = query.trim();
  if (!q) return [];
  const out: PaletteAction[] = [];

  if (looksLikeRequest(q)) {
    const goal = goalFrom(q);
    if (goal) {
      out.push({
        kind: "delegate",
        title: `Delegate: ${goal}`,
        // Said explicitly, because a palette row that reads like a button is
        // assumed to fire immediately — and this one deliberately doesn't.
        subtitle: "opens the ask box with this, so you can confirm before anything runs",
        href: "/app",
        compose: goal,
      });
    }
  }

  return out;
}

/* ------------------------------------------------------------- grouping */

export interface ResultGroup {
  label: string;
  kind: ResultKind | "action";
  items: SearchResult[];
}

/** The order groups appear in — what you are most likely to have meant. */
const GROUP_ORDER: Array<{ kind: ResultKind; label: string }> = [
  { kind: "decision", label: "waiting on you" },
  { kind: "mission", label: "missions" },
  { kind: "file", label: "files" },
  { kind: "app", label: "connected apps" },
  { kind: "page", label: "go to" },
];

/**
 * Group results by kind, in a fixed order.
 *
 * A flat list makes the reader do the sorting: a decision waiting on them and
 * a settings page look identical until each row is read. Fixed order also
 * means the palette's shape is predictable — the third row is the third row
 * every time, which is what lets someone learn to hit ⌘K, type two letters
 * and press enter without looking.
 */
export function groupResults(results: SearchResult[]): ResultGroup[] {
  const groups: ResultGroup[] = [];
  for (const { kind, label } of GROUP_ORDER) {
    const items = results.filter((r) => r.kind === kind);
    if (items.length > 0) groups.push({ kind, label, items });
  }
  return groups;
}

/**
 * The flat, keyboard-navigable order of everything on screen.
 *
 * Arrow keys move through this list, so it has to match the visual order
 * exactly — a palette where ↓ skips a row you can see is worse than one with
 * no keyboard support at all.
 */
export function flatten(
  actions: PaletteAction[],
  groups: ResultGroup[]
): Array<{ action?: PaletteAction; result?: SearchResult }> {
  return [
    ...actions.map((action) => ({ action })),
    ...groups.flatMap((g) => g.items.map((result) => ({ result }))),
  ];
}
