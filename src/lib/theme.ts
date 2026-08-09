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
 * Runs before paint in <head> to set the theme with no flash.
 *
 * The default is the VISITOR'S OWN setting. It used to be a hard "light",
 * because the marketing pages had never been audited in dark — which meant
 * someone whose whole machine is dark got a page that ignored them. The audit
 * has now been done (the one real defect it found: every solid orange button
 * rendered its label in the dark-mode ink, cream on orange at 1.7:1, on every
 * page of the site — see --c-on-signal in globals.css), so the setting is
 * honoured everywhere. An explicit saved choice still wins over the OS.
 */
export const THEME_INIT_SCRIPT = `(function(){try{var p=localStorage.getItem('${THEME_KEY}')||'system';var d=p==='dark'||(p==='system'&&window.matchMedia('(prefers-color-scheme: dark)').matches);document.documentElement.setAttribute('data-theme',d?'dark':'light');}catch(e){}})();`;

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
    const saved = (localStorage.getItem(THEME_KEY) as ThemePref | null) ?? "system";
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

/** The user's chosen display name (personalization), persisted locally. */
export function useDisplayName() {
  const [name, setName] = useState("");

  useEffect(() => {
    setName(localStorage.getItem(NAME_KEY) ?? "");
    const sync = () => setName(localStorage.getItem(NAME_KEY) ?? "");
    window.addEventListener(NAME_EVENT, sync);
    window.addEventListener("storage", sync);
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

/** Two-letter monogram from a display name (fallback to the cosigno "c"). */
export function initialsFor(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return "c";
  if (words.length === 1) return words[0].slice(0, 2).toLowerCase();
  return (words[0][0] + words[1][0]).toLowerCase();
}
