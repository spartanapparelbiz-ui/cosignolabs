"use client";

import { Search } from "lucide-react";

/**
 * The visible way into ⌘K.
 *
 * A command bar nobody knows about is a command bar nobody uses, and the
 * workspace header was otherwise an empty strip. This is deliberately shaped
 * like a search field rather than a button: it reads as "you can type here",
 * shows the shortcut so the keyboard route is learned once, and collapses to a
 * single icon on phones where there is no ⌘K to advertise.
 */
export function SearchTrigger() {
  const openSearch = () => window.dispatchEvent(new Event("cosigno:search"));

  return (
    <>
      <button
        onClick={openSearch}
        aria-label="search cosigno"
        className="group hidden items-center gap-2 rounded-pill ring-1 ring-inset ring-transparent transition-all duration-fast ease-brand-out hover:bg-cream-deep hover:ring-line/70 py-1.5 pl-3.5 pr-1.5 text-sm font-medium text-ink-soft hover:text-ink sm:inline-flex"
      >
        <Search size={14} strokeWidth={2.4} aria-hidden="true" />
        <span className="pr-8">Search</span>
        <kbd className="rounded-pill bg-cream-deep px-2 py-0.5 text-[10px] font-bold tracking-wide text-ink-soft/80 transition-colors group-hover:bg-surface">
          ⌘K
        </kbd>
      </button>

      <button
        onClick={openSearch}
        aria-label="search cosigno"
        className="grid h-9 w-9 place-items-center rounded-pill text-ink-soft transition-colors duration-fast hover:bg-cream-deep hover:text-ink sm:hidden"
      >
        <Search size={17} strokeWidth={2.4} aria-hidden="true" />
      </button>
    </>
  );
}
