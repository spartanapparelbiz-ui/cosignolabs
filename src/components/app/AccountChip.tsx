"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { CreditCard, LogOut, Settings } from "lucide-react";
import { useDisplayName, initialsFor } from "@/lib/theme";
import { ThemeToggleButton } from "@/components/ThemeToggle";

/**
 * The header account control — fully cosigno-branded (no provider default
 * widget). Shows the personalized name + monogram avatar and a small menu:
 * account settings, plan, a theme toggle, and sign out. Sign out works whether
 * or not live auth is configured (falls back to returning home in demo mode).
 *
 * The legal links live down here too. They used to sit in a footer repeated
 * under every screen in the workspace, which is a lot of furniture for two
 * links almost nobody clicks — but they still have to exist, and this is where
 * a person looks for anything about their account.
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
        className="inline-flex items-center gap-2 rounded-pill py-1 pl-1 pr-2.5 transition-colors duration-fast ease-brand-out hover:bg-ink/[0.05]"
      >
        <span className="flex h-7 w-7 items-center justify-center rounded-pill bg-ink text-[0.75rem] font-semibold uppercase text-cream">
          {initialsFor(display)}
        </span>
        <span className="hidden max-w-[9rem] truncate text-[0.875rem] font-semibold text-ink sm:block">
          {display}
        </span>
      </button>

      {open && (
        <div
          role="menu"
          className="absolute right-0 z-30 mt-2 w-60 origin-top-right animate-modal-in rounded-card bg-surface p-1.5 shadow-overlay"
        >
          <div className="flex items-center gap-2.5 px-2.5 py-2.5">
            <span className="flex h-9 w-9 items-center justify-center rounded-pill bg-ink text-[0.875rem] font-semibold uppercase text-cream">
              {initialsFor(display)}
            </span>
            <div className="min-w-0">
              <p className="truncate text-[0.9375rem] font-semibold text-ink">{display}</p>
              <p className="t-caption truncate">your cosigno operator</p>
            </div>
          </div>

          <div className="flex items-center justify-between rounded-btn px-2.5 py-1.5">
            <span className="t-caption">Theme</span>
            <ThemeToggleButton />
          </div>

          <div className="my-1 h-px bg-line/50" aria-hidden="true" />

          <Link
            href="/app/account"
            role="menuitem"
            onClick={() => setOpen(false)}
            className="flex items-center gap-2.5 rounded-btn px-2.5 py-2 text-[0.9375rem] text-ink transition-colors duration-fast hover:bg-ink/[0.05]"
          >
            <Settings size={15} strokeWidth={1.9} aria-hidden="true" />
            Account
          </Link>
          <Link
            href="/app/account/plan"
            role="menuitem"
            onClick={() => setOpen(false)}
            className="flex items-center gap-2.5 rounded-btn px-2.5 py-2 text-[0.9375rem] text-ink transition-colors duration-fast hover:bg-ink/[0.05]"
          >
            <CreditCard size={15} strokeWidth={1.9} aria-hidden="true" />
            Plan &amp; usage
          </Link>
          <button
            role="menuitem"
            onClick={signOut}
            className="flex w-full items-center gap-2.5 rounded-btn px-2.5 py-2 text-[0.9375rem] text-ink transition-colors duration-fast hover:bg-ink/[0.05]"
          >
            <LogOut size={15} strokeWidth={1.9} aria-hidden="true" />
            Sign out
          </button>

          <div className="my-1 h-px bg-line/50" aria-hidden="true" />

          <div className="flex items-center gap-3 px-2.5 pb-1.5 pt-1">
            <Link href="/privacy" className="t-caption hover:text-ink">
              Privacy
            </Link>
            <Link href="/terms" className="t-caption hover:text-ink">
              Terms
            </Link>
            <span className="t-caption ml-auto">© {new Date().getFullYear()} aethric</span>
          </div>
        </div>
      )}
    </div>
  );
}
