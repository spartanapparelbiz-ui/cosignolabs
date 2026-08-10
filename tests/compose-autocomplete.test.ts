import { describe, expect, it } from "vitest";
import {
  applySuggestion,
  autocompleteAt,
  mentionedApps,
  toHandle,
  type MentionApp,
} from "../src/lib/compose/autocomplete";

const APPS: MentionApp[] = [
  { handle: "gmail", name: "Gmail", providerKey: "google" },
  { handle: "google-calendar", name: "Google Calendar", providerKey: "google-calendar" },
  { handle: "github", name: "GitHub", providerKey: "github" },
];

describe("triggers only fire at a word boundary", () => {
  it("opens the app picker after an @ at the start", () => {
    const s = autocompleteAt("@gm", 3, APPS);
    expect(s?.trigger).toBe("@");
    expect(s?.suggestions).toHaveLength(1);
  });

  it("does not open a picker inside an email address", () => {
    expect(autocompleteAt("email katie@example", 18, APPS)).toBeNull();
  });

  it("does not treat a slash inside a url as a command", () => {
    expect(autocompleteAt("read https://a.com/b", 20, APPS)).toBeNull();
  });

  it("only offers slash commands at the very start of the request", () => {
    expect(autocompleteAt("/wa", 3, APPS)?.trigger).toBe("/");
    expect(autocompleteAt("please /wa", 10, APPS)).toBeNull();
  });

  it("returns nothing when the query matches nothing", () => {
    expect(autocompleteAt("@zzzz", 5, APPS)).toBeNull();
    expect(autocompleteAt("/zzzz", 5, APPS)).toBeNull();
  });
});

describe("mentions only offer connected apps", () => {
  it("offers nothing when the workspace has no connections", () => {
    expect(autocompleteAt("@g", 2, [])).toBeNull();
  });

  it("matches on display name as well as handle", () => {
    const s = autocompleteAt("@cal", 4, APPS);
    expect(s?.suggestions).toHaveLength(1);
    expect(s?.suggestions[0]).toMatchObject({ kind: "mention" });
  });
});

describe("applying a suggestion", () => {
  it("replaces the token and leaves the caret ready to keep typing", () => {
    const state = autocompleteAt("@gm", 3, APPS)!;
    const out = applySuggestion("@gm", state, state.suggestions[0]);
    expect(out.value).toBe("@gmail ");
    expect(out.caret).toBe(7);
  });

  it("preserves text after the caret", () => {
    const value = "@gm the update";
    const state = autocompleteAt(value, 3, APPS)!;
    const out = applySuggestion(value, state, state.suggestions[0]);
    expect(out.value).toBe("@gmail  the update");
  });

  it("a slash command writes its phrase, not its name", () => {
    const state = autocompleteAt("/watch", 6, APPS)!;
    const out = applySuggestion("/watch", state, state.suggestions[0]);
    expect(out.value).toBe("watch for ");
  });
});

describe("resolving the apps a request names", () => {
  it("finds every mentioned app", () => {
    expect(mentionedApps("check @gmail and @github", APPS).map((a) => a.handle)).toEqual([
      "gmail",
      "github",
    ]);
  });

  it("silently matches nothing on a typo rather than guessing", () => {
    expect(mentionedApps("check @gmial", APPS)).toEqual([]);
  });

  it("ignores an @ that is part of an address", () => {
    expect(mentionedApps("mail katie@github.com", APPS)).toEqual([]);
  });
});

describe("handles are typeable", () => {
  it("lowercases and hyphenates a display name", () => {
    expect(toHandle("Google Calendar")).toBe("google-calendar");
    expect(toHandle("Acme CRM (prod)")).toBe("acme-crm-prod");
  });
});
