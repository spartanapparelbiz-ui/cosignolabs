/**
 * The ask box's autocomplete: slash commands and @app mentions.
 *
 * Pure and total, so the whole interaction is unit-testable without a DOM and
 * cannot throw on a half-typed token. Two grammars, both triggered only at a
 * word boundary:
 *
 *   /command   — a shortcut to a way of working (a watch, a schedule, a file)
 *   @app       — names a connected app the request should use
 *
 * The rule that shapes the mention list: only apps that are actually
 * connected are offered. Completing "@stripe" for a workspace with no Stripe
 * connection writes a request that cannot be carried out, which teaches
 * people to distrust every other suggestion on the screen.
 */

export interface SlashCommand {
  /** Typed after the slash. */
  name: string;
  /** What it does, in one clause. */
  detail: string;
  /**
   * What replaces the token. When it ends in a space the caret continues the
   * sentence; the ones that end mid-phrase are deliberate — the user has to
   * finish the thought, which is the point of the shortcut.
   */
  insert: string;
}

export const SLASH_COMMANDS: SlashCommand[] = [
  {
    name: "watch",
    detail: "keep an eye on something and tell you when it changes",
    insert: "watch for ",
  },
  {
    name: "every",
    detail: "do this on a schedule, e.g. every monday",
    insert: "every ",
  },
  { name: "draft", detail: "write it, but don't send it", insert: "draft " },
  { name: "research", detail: "read the public sources and write it up", insert: "research " },
  { name: "summarise", detail: "condense something you point it at", insert: "summarise " },
  { name: "prepare", detail: "assemble a brief for a meeting or a decision", insert: "prepare " },
  { name: "review", detail: "go through something and report back", insert: "review " },
  { name: "find", detail: "search across your connected apps", insert: "find " },
];

export interface MentionApp {
  /** Typed after the @, lowercase and space-free. */
  handle: string;
  /** How it's shown. */
  name: string;
  providerKey: string;
}

/** A connector's display name, reduced to something typeable after an @. */
export function toHandle(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export type Suggestion =
  | { kind: "slash"; command: SlashCommand }
  | { kind: "mention"; app: MentionApp };

export interface AutocompleteState {
  /** Where the token being completed starts, so a pick can replace it. */
  start: number;
  /** What has been typed after the trigger character. */
  query: string;
  trigger: "/" | "@";
  suggestions: Suggestion[];
}

/**
 * Find the token under the caret, if it is one we complete.
 *
 * A trigger only counts at the start of the input or after whitespace: an
 * email address in the middle of a sentence contains an @ and must not open
 * an app picker, and a URL contains slashes.
 */
export function autocompleteAt(
  value: string,
  caret: number,
  apps: MentionApp[]
): AutocompleteState | null {
  const upto = value.slice(0, caret);
  const match = /(^|\s)([/@])([\w-]*)$/.exec(upto);
  if (!match) return null;

  const trigger = match[2] as "/" | "@";
  const query = match[3].toLowerCase();
  const start = caret - query.length - 1;

  if (trigger === "/") {
    // A slash command is only a command at the very start of the request.
    // Mid-sentence, "/" is punctuation or part of a path.
    if (start !== 0) return null;
    const suggestions = SLASH_COMMANDS.filter((c) => c.name.startsWith(query)).map(
      (command): Suggestion => ({ kind: "slash", command })
    );
    return suggestions.length ? { start, query, trigger, suggestions } : null;
  }

  const suggestions = apps
    .filter((a) => a.handle.includes(query) || a.name.toLowerCase().includes(query))
    .map((app): Suggestion => ({ kind: "mention", app }));
  return suggestions.length ? { start, query, trigger, suggestions } : null;
}

/** The text a chosen suggestion writes into the box, and where the caret lands. */
export function applySuggestion(
  value: string,
  state: AutocompleteState,
  suggestion: Suggestion
): { value: string; caret: number } {
  const insert =
    suggestion.kind === "slash"
      ? suggestion.command.insert
      : `@${suggestion.app.handle} `;
  const before = value.slice(0, state.start);
  const after = value.slice(state.start + state.query.length + 1);
  const next = `${before}${insert}${after}`;
  return { value: next, caret: before.length + insert.length };
}

/**
 * The apps a request names, resolved back to connector keys.
 *
 * Used to show the reader which connections their sentence will use before
 * they commit to it. Unknown handles are simply not returned — a typo should
 * quietly match nothing rather than be silently corrected to the nearest app,
 * which would route a request somewhere it wasn't addressed.
 */
export function mentionedApps(value: string, apps: MentionApp[]): MentionApp[] {
  const handles = new Set(
    [...value.matchAll(/(?:^|\s)@([\w-]+)/g)].map((m) => m[1].toLowerCase())
  );
  return apps.filter((a) => handles.has(a.handle));
}
