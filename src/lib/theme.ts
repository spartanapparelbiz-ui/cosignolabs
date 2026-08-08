"use client";

import { useCallback, useEffect, useState } from "react";

/**
 * Client-side theme + personalization, persisted to localStorage (no backend
 * needed, works in demo mode). The resolved theme is written to
 * <html data-theme> — the same attribute the no-flash inline script sets
 * before first paint (see THEME_INIT_SCRIPT).
 */

export type ThemePref = "light" | "dark" | "system";

export const THEME_KEY = "cosigno.theme";
export const NAME_KEY = "cosigno.name";
const NAME_EVENT = "cosigno:name";

/**
 * Runs before paint in <head> to set the theme with no flash. Default is
 * LIGHT unless the user has explicitly chosen dark or system — that keeps the
 * public/marketing pages (not audited for dark) pristine for first-time
 * visitors, while the app honors the operator's saved choice everywhere.
 */
export const THEME_INIT_SCRIPT = `(function(){try{var p=localStorage.getItem('${THEME_KEY}')||'light';var d=p==='dark'||(p==='system'&&window.matchMedia('(prefers-color-scheme: dark)').matches);document.documentElement.setAttribute('data-theme',d?'dark':'light');}catch(e){}})();`;

function systemDark(): boolean {
  return typeof window !== "undefined" && window.matchMedia("(prefers-color-scheme: dark)").matches;
}

function resolve(pref: ThemePref): "light" | "dark" {
  return pref === "system" ? (systemDark() ? "dark" : "light") : pref;
}

function apply(pref: ThemePref) {
  document.documentElement.setAttribute("data-theme", resolve(pref));
}

/** Read/set the theme preference; keeps <html data-theme> and storage in sync. */
export function useTheme() {
  const [pref, setPref] = useState<ThemePref>("system");

  useEffect(() => {
    const saved = (localStorage.getItem(THEME_KEY) as ThemePref | null) ?? "light";
    setPref(saved);
  }, []);

  // When on "system", follow OS changes live.
  useEffect(() => {
    if (pref !== "system") return;
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => apply("system");
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, [pref]);

  const set = useCallback((next: ThemePref) => {
    setPref(next);
    localStorage.setItem(THEME_KEY, next);
    apply(next);
  }, []);

  return { pref, set, resolved: resolve(pref) };
}

/**
 * Turn whatever the sign-in provider knows into something you'd call a person.
 * A full name wins; otherwise the local part of the email, with separators
 * turned back into spaces and each word capitalized — "ada.lovelace@…" reads
 * as "Ada Lovelace". Anything that doesn't survive that (a hash, a plus-tag,
 * a bare number) returns "" and the product simply greets nobody by name,
 * which is far better than greeting them by their user id.
 */
export function nameFromIdentity(identity: {
  fullName?: string | null;
  email?: string | null;
}): string {
  const full = (identity.fullName ?? "").trim();
  if (full) return full.slice(0, 40);

  const local = (identity.email ?? "").split("@")[0]?.split("+")[0] ?? "";
  const words = local
    .split(/[._\-\s]+/)
    .filter((w) => /^[a-z]/i.test(w) && w.length > 1)
    .slice(0, 2);
  if (words.length === 0) return "";
  return words
    .map((w) => w[0].toUpperCase() + w.slice(1).toLowerCase())
    .join(" ")
    .slice(0, 40);
}

/**
 * The user's display name — theirs to set in account settings, but seeded once
 * from the sign-in identity so the product can greet a new operator by name on
 * the very first screen instead of waiting for them to fill in a form. The seed
 * only ever runs when nothing is stored, so an explicit choice is never
 * overwritten, and it stays silent when there is no live auth (demo, sandbox).
 */
export function useDisplayName() {
  const [name, setName] = useState("");

  useEffect(() => {
    const stored = localStorage.getItem(NAME_KEY);
    setName(stored ?? "");
    const sync = () => setName(localStorage.getItem(NAME_KEY) ?? "");
    window.addEventListener(NAME_EVENT, sync);
    window.addEventListener("storage", sync);
    if (stored === null) void seedNameFromIdentity();
    return () => {
      window.removeEventListener(NAME_EVENT, sync);
      window.removeEventListener("storage", sync);
    };
  }, []);

  const save = useCallback((next: string) => {
    const clean = next.slice(0, 40);
    setName(clean);
    localStorage.setItem(NAME_KEY, clean);
    window.dispatchEvent(new Event(NAME_EVENT));
  }, []);

  return [name, save] as const;
}

/**
 * One best-effort read of the signed-in identity, at most once per browser.
 * Loaded dynamically so the auth client never lands in the first paint, and
 * every failure path is silent: a missing name is a cosmetic absence, not an
 * error worth telling anybody about.
 */
let seeded = false;
async function seedNameFromIdentity(): Promise<void> {
  if (seeded) return;
  seeded = true;
  try {
    const { supabaseAuthConfigured, supabaseBrowser } = await import("./supabaseAuth/client");
    if (!supabaseAuthConfigured()) return;
    const { data } = await supabaseBrowser().auth.getUser();
    const user = data?.user;
    if (!user) return;
    const meta = (user.user_metadata ?? {}) as { full_name?: string; name?: string };
    const derived = nameFromIdentity({
      fullName: meta.full_name ?? meta.name ?? null,
      email: user.email ?? null,
    });
    // Re-check storage: the operator may have named themselves while this was
    // in flight, and their choice always wins over a guess.
    if (!derived || localStorage.getItem(NAME_KEY) !== null) return;
    localStorage.setItem(NAME_KEY, derived);
    window.dispatchEvent(new Event(NAME_EVENT));
  } catch {
    /* no live auth, or the session could not be read — greet nobody by name */
  }
}

/** Two-letter monogram from a display name (fallback to the cosigno "c"). */
export function initialsFor(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return "c";
  if (words.length === 1) return words[0].slice(0, 2).toLowerCase();
  return (words[0][0] + words[1][0]).toLowerCase();
}
