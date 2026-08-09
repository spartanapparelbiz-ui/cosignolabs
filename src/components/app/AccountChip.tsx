"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { LogOut, Settings } from "lucide-react";
import { useDisplayName, initialsFor } from "@/lib/theme";
import { ThemeToggleButton } from "@/components/ThemeToggle";

/**
 * The header account control — fully cosigno-branded (no provider default
 * widget). Shows the personalized name + monogram avatar and a small menu:
 * account settings, a theme toggle, and sign out. Sign out works whether or
 * not live auth is configured (falls back to returning home in demo mode).
 */
export function AccountChip() {
  const [name] = useDisplayName();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const display = name.trim() || "operator";

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onEsc = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onEsc);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onEsc);
    };
  }, [open]);

  function signOut() {
    import("@/lib/supabaseAuth/client").then(
      ({ signOutEverywhere }) => void signOutEverywhere(),
      () => (window.location.href = "/")
    );
  }

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        className="inline-flex items-center gap-2 rounded-pill ring-1 ring-inset ring-transparent transition-all duration-fast ease-brand-out hover:bg-cream-deep hover:ring-line/70 py-1 pl-1 pr-3"
      >
        <span className="flex h-7 w-7 items-center justify-center rounded-pill bg-ink text-xs font-extrabold uppercase text-cream">
          {initialsFor(display)}
        </span>
        <span className="hidden max-w-[9rem] truncate text-sm font-semibold lowercase text-ink sm:block">{display}</span>
      </button>

      {open && (
        <div
          role="menu"
          className="absolute right-0 z-20 mt-2 w-56 origin-top-right animate-menu-in rounded-card bg-surface p-2 shadow-lift ring-1 ring-inset ring-line/60"
        >
          <div className="flex items-center gap-2 px-2 py-2">
            <span className="flex h-9 w-9 items-center justify-center rounded-pill bg-ink text-sm font-extrabold uppercase text-cream">
              {initialsFor(display)}
            </span>
            <div className="min-w-0">
              <p className="truncate text-sm font-bold lowercase text-ink">{display}</p>
              <p className="truncate text-[11px] text-ink-soft">your cosigno operator</p>
            </div>
          </div>

          <div className="my-1 flex items-center justify-between rounded-btn px-2 py-1.5">
            <span className="text-xs font-bold lowercase text-ink-soft">theme</span>
            <ThemeToggleButton />
          </div>

          <Link
            href="/app/account"
            role="menuitem"
            onClick={() => setOpen(false)}
            className="flex items-center gap-2 rounded-btn px-2 py-2 text-sm font-bold lowercase text-ink transition-colors duration-fast hover:bg-cream-deep"
          >
            <Settings size={15} strokeWidth={2.4} aria-hidden="true" />
            account settings
          </Link>
          <button
            role="menuitem"
            onClick={signOut}
            className="flex w-full items-center gap-2 rounded-btn px-2 py-2 text-sm font-bold lowercase text-ink transition-colors duration-fast hover:bg-cream-deep"
          >
            <LogOut size={15} strokeWidth={2.4} aria-hidden="true" />
            sign out
          </button>
        </div>
      )}
    </div>
  );
}
