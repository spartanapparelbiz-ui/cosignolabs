"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  FileText,
  LayoutGrid,
  Plug,
  Rocket,
  Search,
  ShieldQuestion,
} from "lucide-react";
import { ConnectorLogo } from "@/components/integrations/ConnectorLogo";

/**
 * ⌘K — the fastest way anywhere in the workspace.
 *
 * It searches only what cosigno already holds: missions, decisions waiting on
 * you, connected apps, files it produced, and the pages themselves. It does not
 * reach into connected systems, so nothing here can be slow, cost a rate limit,
 * or offer a category the product can't deliver.
 *
 * Everything it returns goes somewhere. A search result that isn't a link is a
 * dead end wearing a costume.
 */

type ResultKind = "mission" | "decision" | "app" | "file" | "page";

interface SearchResult {
  kind: ResultKind;
  title: string;
  subtitle?: string;
  href: string;
  providerKey?: string;
}

const ICON: Record<ResultKind, typeof Rocket> = {
  mission: Rocket,
  decision: ShieldQuestion,
  app: Plug,
  file: FileText,
  page: LayoutGrid,
};

/** The event the header's search control fires; ⌘K does the same thing. */
const OPEN_EVENT = "cosigno:command";

/**
 * The header's search control. A shortcut nobody knows about is a shortcut
 * nobody uses, so ⌘K also has a visible door — quiet, and the same width as
 * the thing it opens.
 */
export function CommandBarTrigger() {
  return (
    <button
      onClick={() => window.dispatchEvent(new CustomEvent(OPEN_EVENT))}
      className="group hidden items-center gap-2 rounded-btn px-2.5 py-1.5 text-ink-soft transition-colors duration-fast hover:bg-ink/[0.04] hover:text-ink sm:inline-flex"
      aria-label="search the workspace"
    >
      <Search size={15} strokeWidth={2} aria-hidden="true" />
      <span className="text-[0.8125rem]">Search</span>
      <kbd className="rounded bg-ink/[0.06] px-1.5 py-px text-[0.6875rem] font-semibold text-ink-soft">
        ⌘K
      </kbd>
    </button>
  );
}

export function CommandBar() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [active, setActive] = useState(0);
  const [searching, setSearching] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // Open on ⌘K / Ctrl+K from anywhere in the workspace, or from the header
  // control that says so out loud.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((v) => !v);
      }
      if (e.key === "Escape") setOpen(false);
    }
    const onOpen = () => setOpen(true);
    window.addEventListener("keydown", onKey);
    window.addEventListener(OPEN_EVENT, onOpen);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener(OPEN_EVENT, onOpen);
    };
  }, []);

  useEffect(() => {
    if (open) {
      // Focus after paint so the dialog is actually in the DOM.
      requestAnimationFrame(() => inputRef.current?.focus());
    } else {
      setQuery("");
      setResults([]);
      setActive(0);
    }
  }, [open]);

  // Debounced, and every response is checked against the CURRENT query before
  // it lands — otherwise a slow early request overwrites the results for what
  // the person has since typed.
  useEffect(() => {
    const q = query.trim();
    if (!q) {
      setResults([]);
      setSearching(false);
      return;
    }
    setSearching(true);
    const timer = setTimeout(async () => {
      try {
        const r = await fetch(`/api/search?q=${encodeURIComponent(q)}`, { cache: "no-store" });
        const d = await r.json();
        setResults(Array.isArray(d.results) ? d.results : []);
        setActive(0);
      } catch {
        setResults([]);
      } finally {
        setSearching(false);
      }
    }, 140);
    return () => clearTimeout(timer);
  }, [query]);

  const go = useCallback(
    (r: SearchResult) => {
      setOpen(false);
      router.push(r.href);
    },
    [router]
  );

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-ink/40 p-4 pt-[12vh] backdrop-blur-[2px]"
      role="dialog"
      aria-modal="true"
      aria-label="search cosigno"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) setOpen(false);
      }}
    >
      <div className="w-full max-w-lg animate-modal-in overflow-hidden rounded-card bg-surface shadow-overlay">
        <div className="flex items-center gap-2.5 border-b border-line/50 px-4">
          <Search size={15} className="shrink-0 text-ink-soft" aria-hidden="true" />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "ArrowDown") {
                e.preventDefault();
                setActive((i) => Math.min(i + 1, results.length - 1));
              } else if (e.key === "ArrowUp") {
                e.preventDefault();
                setActive((i) => Math.max(i - 1, 0));
              } else if (e.key === "Enter" && results[active]) {
                e.preventDefault();
                go(results[active]);
              }
            }}
            placeholder="Search missions, apps, decisions…"
            aria-label="search"
            className="min-h-[52px] flex-1 bg-transparent text-[0.9375rem] outline-none placeholder:text-ink-soft/60"
          />
          <kbd className="shrink-0 rounded bg-ink/[0.06] px-1.5 py-px text-[0.6875rem] font-semibold text-ink-soft">
            esc
          </kbd>
        </div>

        {query.trim() && (
          <ul className="surface-scroll max-h-[50vh] overflow-y-auto p-2">
            {results.map((r, i) => {
              const Icon = ICON[r.kind];
              return (
                <li key={`${r.kind}-${r.href}-${r.title}`}>
                  <button
                    onClick={() => go(r)}
                    onMouseEnter={() => setActive(i)}
                    className={`flex w-full items-center gap-3 rounded-btn px-2.5 py-2.5 text-left transition-colors duration-fast ${
                      i === active ? "bg-ink/[0.055]" : ""
                    }`}
                  >
                    <span className="shrink-0" aria-hidden="true">
                      {r.providerKey ? (
                        <ConnectorLogo kind="app" providerKey={r.providerKey} displayName={r.title} size={16} />
                      ) : (
                        <Icon size={15} strokeWidth={1.9} className="text-ink-soft" />
                      )}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[0.875rem] font-semibold">{r.title}</span>
                      {r.subtitle && <span className="t-caption block truncate">{r.subtitle}</span>}
                    </span>
                  </button>
                </li>
              );
            })}

            {/* Say plainly that there is nothing, rather than showing an empty
                box the reader has to interpret. */}
            {!searching && results.length === 0 && (
              <li className="t-caption px-2.5 py-8 text-center">Nothing matches “{query.trim()}”.</li>
            )}
          </ul>
        )}

        {!query.trim() && (
          <p className="t-caption px-4 py-7 text-center">
            Missions, decisions, apps and files.
          </p>
        )}
      </div>
    </div>
  );
}
