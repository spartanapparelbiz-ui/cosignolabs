"use client";

import { Monitor, Moon, Sun } from "lucide-react";
import { useTheme, type ThemePref } from "@/lib/theme";

const OPTIONS: { id: ThemePref; label: string; icon: typeof Sun }[] = [
  { id: "light", label: "light", icon: Sun },
  { id: "dark", label: "dark", icon: Moon },
  { id: "system", label: "system", icon: Monitor },
];

/**
 * A segmented light / dark / system control. Writes the preference to
 * localStorage and flips <html data-theme> immediately (see useTheme).
 */
export function ThemeToggle() {
  const { pref, set } = useTheme();
  return (
    <div
      role="radiogroup"
      aria-label="color theme"
      className="inline-flex gap-0.5 rounded-pill bg-ink/[0.05] p-1"
    >
      {OPTIONS.map((o) => {
        const Icon = o.icon;
        const active = pref === o.id;
        return (
          <button
            key={o.id}
            role="radio"
            aria-checked={active}
            onClick={() => set(o.id)}
            className={`inline-flex items-center gap-1.5 rounded-pill px-3 py-1.5 text-[0.8125rem] transition-all duration-fast ease-brand-out ${
              active ? "bg-surface font-semibold text-ink shadow-rest" : "text-ink-soft hover:text-ink"
            }`}
          >
            <Icon size={14} strokeWidth={1.9} aria-hidden="true" />
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

/** Compact single-button theme cycle (light → dark → system) for the header. */
export function ThemeToggleButton() {
  const { pref, set } = useTheme();
  const next: Record<ThemePref, ThemePref> = { light: "dark", dark: "system", system: "light" };
  const Icon = pref === "light" ? Sun : pref === "dark" ? Moon : Monitor;
  return (
    <button
      onClick={() => set(next[pref])}
      aria-label={`theme: ${pref} — click to change`}
      title={`theme: ${pref}`}
      className="inline-flex h-9 w-9 items-center justify-center rounded-btn text-ink-soft transition-all duration-fast ease-brand-out hover:bg-cream-deep hover:text-ink"
    >
      <Icon size={16} strokeWidth={2.4} aria-hidden="true" />
    </button>
  );
}
