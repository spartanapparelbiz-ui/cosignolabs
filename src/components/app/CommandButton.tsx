"use client";

import { useEffect, useState } from "react";
import { Search } from "lucide-react";

/**
 * The visible door to the command bar. ⌘K existed with no affordance at all
 * — undiscoverable by mouse and unreachable on a phone. A quiet header
 * button opens the same palette, and on hardware with a keyboard it also
 * teaches the shortcut.
 */
export function CommandButton() {
  // ⌘ vs Ctrl is cosmetic; detect once on mount to label honestly.
  const [mac, setMac] = useState(true);
  useEffect(() => {
    setMac(/mac|iphone|ipad/i.test(navigator.platform || navigator.userAgent));
  }, []);

  return (
    <button
      onClick={() => window.dispatchEvent(new CustomEvent("cosigno:command-open"))}
      aria-label="search the workspace"
      className="inline-flex min-h-[36px] items-center gap-1.5 rounded-btn border border-line bg-surface px-2.5 py-1.5 text-xs font-bold text-ink-soft transition-colors duration-fast hover:border-signal hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-signal sm:px-3"
    >
      <Search size={13} aria-hidden="true" />
      <span className="hidden sm:inline">search</span>
      <kbd className="hidden rounded bg-cream-deep px-1.5 py-0.5 font-mono text-[10px] font-bold text-ink-soft sm:inline">
        {mac ? "⌘" : "Ctrl"} K
      </kbd>
    </button>
  );
}
