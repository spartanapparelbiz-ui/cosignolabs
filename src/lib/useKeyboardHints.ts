"use client";

import { useEffect, useState } from "react";

/**
 * Client preference: show keyboard-shortcut hints (approve/veto on focused
 * cards). Persisted in localStorage — a UI-only preference, so no server
 * round-trip. Toggled from the account center's profile panel; read by the
 * workspace + action cards. Defaults on.
 */
const KEY = "cosigno.keyhints";

export function useKeyboardHints(): [boolean, (v: boolean) => void] {
  const [on, setOn] = useState(true);

  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(KEY);
      if (stored !== null) setOn(stored === "1");
    } catch {
      /* private mode / disabled storage — keep the default */
    }
  }, []);

  const set = (v: boolean) => {
    setOn(v);
    try {
      window.localStorage.setItem(KEY, v ? "1" : "0");
    } catch {
      /* ignore */
    }
    // let other mounted readers (workspace, cards) update live
    window.dispatchEvent(new CustomEvent("cosigno:keyhints", { detail: v }));
  };

  // Sync across components that mount the hook simultaneously.
  useEffect(() => {
    const handler = (e: Event) => setOn((e as CustomEvent<boolean>).detail);
    window.addEventListener("cosigno:keyhints", handler);
    return () => window.removeEventListener("cosigno:keyhints", handler);
  }, []);

  return [on, set];
}
