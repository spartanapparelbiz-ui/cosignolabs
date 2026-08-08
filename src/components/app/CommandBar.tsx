"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowRight,
  Clock,
  FileText,
  LayoutGrid,
  Plug,
  Rocket,
  Search,
  ShieldQuestion,
  Sparkles,
} from "lucide-react";
import { ConnectorLogo } from "@/components/integrations/ConnectorLogo";
import { CosignoMark } from "@/components/brand/Logo";

/**
 * ⌘K — the fastest way anywhere in the workspace.
 *
 * It searches only what cosigno already holds: missions, decisions waiting on
 * you, connected apps, files it produced, and the pages themselves. It does not
 * reach into connected systems, so nothing here can be slow, cost a rate limit,
 * or offer a category the product can't deliver.
 *
 * Everything it returns goes somewhere. A search result that isn't a link is a
 * dead end wearing a costume — including the no-match state, which offers to
 * hand what you typed to cosigno as a mission rather than shrugging.
 *
 * The empty box is treated as a first-class screen, not an absence: your recent
 * searches, the work already waiting on you, and the four pinned destinations.
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

/** Results are grouped, and the groups are ordered by what costs most to miss. */
const GROUPS: ReadonlyArray<{ kind: ResultKind; label: string }> = [
  { kind: "decision", label: "Waiting on you" },
  { kind: "mission", label: "Missions" },
  { kind: "app", label: "Apps" },
  { kind: "file", label: "Files" },
  { kind: "page", label: "Go to" },
];

const PINNED: ReadonlyArray<SearchResult> = [
  { kind: "page", title: "Home", subtitle: "today's work", href: "/app" },
  { kind: "page", title: "Missions", subtitle: "everything cosigno is working on", href: "/app/missions" },
  { kind: "page", title: "Approvals", subtitle: "decisions waiting on you", href: "/app/approvals" },
  { kind: "page", title: "Connections", subtitle: "the apps cosigno can work with", href: "/app/connections" },
];

const RECENT_KEY = "cosigno.recentSearches";
const RECENT_MAX = 4;

function readRecent(): string[] {
  try {
    const raw = JSON.parse(localStorage.getItem(RECENT_KEY) ?? "[]");
    return Array.isArray(raw) ? raw.filter((s) => typeof s === "string").slice(0, RECENT_MAX) : [];
  } catch {
    return [];
  }
}

function rememberSearch(q: string) {
  const clean = q.trim();
  if (clean.length < 2) return;
  try {
    const next = [clean, ...readRecent().filter((s) => s !== clean)].slice(0, RECENT_MAX);
    localStorage.setItem(RECENT_KEY, JSON.stringify(next));
  } catch {
    /* storage may be unavailable — recents are a convenience, never state */
  }
}

export function CommandBar() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [recentItems, setRecentItems] = useState<SearchResult[]>([]);
  const [recentQueries, setRecentQueries] = useState<string[]>([]);
  const [active, setActive] = useState(0);
  const [searching, setSearching] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  // Open on ⌘K / Ctrl+K from anywhere in the workspace.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((v) => !v);
      }
      if (e.key === "Escape") setOpen(false);
    }
    window.addEventListener("keydown", onKey);
    // A visible affordance elsewhere in the chrome opens the same panel.
    const onOpen = () => setOpen(true);
    window.addEventListener("cosigno:search", onOpen);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("cosigno:search", onOpen);
    };
  }, []);

  useEffect(() => {
    if (!open) {
      setQuery("");
      setResults([]);
      setActive(0);
      return;
    }
    // Focus after paint so the dialog is actually in the DOM.
    requestAnimationFrame(() => inputRef.current?.focus());
    setRecentQueries(readRecent());
    // The page behind must not scroll under an open overlay.
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    let alive = true;
    fetch("/api/search?recent=1", { cache: "no-store" })
      .then((r) => r.json())
      .then((d) => alive && setRecentItems(Array.isArray(d.results) ? d.results : []))
      .catch(() => undefined);
    return () => {
      alive = false;
      document.body.style.overflow = prev;
    };
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

  /** Hand what was typed to the operator instead of ending on "no matches". */
  const delegate = useCallback(
    (text: string) => {
      setOpen(false);
      rememberSearch(text);
      router.push("/app");
      // The composer listens for this on every surface it renders on.
      setTimeout(
        () => window.dispatchEvent(new CustomEvent("cosigno:compose", { detail: { text } })),
        60
      );
    },
    [router]
  );

  const go = useCallback(
    (r: SearchResult) => {
      setOpen(false);
      rememberSearch(query);
      router.push(r.href);
    },
    [router, query]
  );

  /**
   * One flat list of everything selectable, in the order it is drawn — the
   * arrow keys move through what the eye sees, across group boundaries, which
   * is the only ordering that doesn't feel broken.
   */
  const sections = useMemo(() => {
    const typed = query.trim();
    if (!typed) {
      const out: Array<{ label: string; items: SearchResult[] }> = [];
      if (recentQueries.length) {
        out.push({
          label: "Recent searches",
          items: recentQueries.map((q) => ({
            kind: "page" as const,
            title: q,
            subtitle: "search again",
            href: `?q=${encodeURIComponent(q)}`,
          })),
        });
      }
      if (recentItems.length) out.push({ label: "Picking up where you left off", items: recentItems });
      out.push({ label: "Go to", items: [...PINNED] });
      return out;
    }
    return GROUPS.map(({ kind, label }) => ({
      label,
      items: results.filter((r) => r.kind === kind),
    })).filter((s) => s.items.length > 0);
  }, [query, results, recentItems, recentQueries]);

  const flat = useMemo(() => sections.flatMap((s) => s.items), [sections]);
  // The list changes shape as you type (recents → grouped results), so the
  // highlight is clamped rather than trusted — otherwise Enter can land on
  // nothing after the sections shrink under it.
  const cursor = active < flat.length ? active : 0;

  // Keep the highlighted row in view when the arrows walk past the fold.
  useEffect(() => {
    listRef.current
      ?.querySelector<HTMLElement>(`[data-index="${active}"]`)
      ?.scrollIntoView({ block: "nearest" });
  }, [active]);

  const pick = useCallback(
    (r: SearchResult) => {
      // A recent-search row re-runs the search rather than navigating.
      if (r.href.startsWith("?q=")) {
        setQuery(decodeURIComponent(r.href.slice(3)));
        inputRef.current?.focus();
        return;
      }
      go(r);
    },
    [go]
  );

  if (!open) return null;

  const typed = query.trim();
  const noMatches = Boolean(typed) && !searching && results.length === 0;

  return (
    <div
      className="fixed inset-0 z-50 flex animate-overlay-in items-start justify-center bg-ink/45 p-4 pt-[11vh] backdrop-blur-md"
      role="dialog"
      aria-modal="true"
      aria-label="search cosigno"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) setOpen(false);
      }}
    >
      <div className="w-full max-w-xl animate-command-in overflow-hidden rounded-card bg-surface shadow-depth-lift ring-1 ring-inset ring-line/70">
        {/* ------------------------------ the query ------------------------------ */}
        <div className="flex items-center gap-3 border-b border-line/70 px-5">
          <Search size={17} className="shrink-0 text-ink-soft" aria-hidden="true" />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "ArrowDown") {
                e.preventDefault();
                setActive((i) => (flat.length ? (i + 1) % flat.length : 0));
              } else if (e.key === "ArrowUp") {
                e.preventDefault();
                setActive((i) => (flat.length ? (i - 1 + flat.length) % flat.length : 0));
              } else if (e.key === "Enter") {
                e.preventDefault();
                if (flat[cursor]) pick(flat[cursor]);
                else if (typed) delegate(typed);
              }
            }}
            placeholder="Search missions, apps, decisions — or describe a job"
            aria-label="search"
            // The panel itself is the focus ring here: an outlined box inside
            // an already-focused modal is a second answer to a question nobody
            // asked.
            className="min-h-[62px] flex-1 bg-transparent text-[15px] font-semibold outline-none placeholder:font-medium placeholder:text-ink-soft/70 focus-visible:shadow-none focus-visible:outline-none"
          />
          <kbd className="shrink-0 rounded-btn bg-cream-deep px-2 py-1 text-[10px] font-bold lowercase text-ink-soft">
            esc
          </kbd>
        </div>

        {/* ------------------------------ the answers ------------------------------ */}
        <div ref={listRef} className="max-h-[52vh] overflow-y-auto px-2 py-2">
          {noMatches ? (
            <NoMatches query={typed} onDelegate={() => delegate(typed)} />
          ) : (
            sections.map((section, si) => {
              // The flat index this section starts at, so arrow-key highlight
              // and draw order stay in lockstep.
              const offset = sections.slice(0, si).reduce((n, s) => n + s.items.length, 0);
              return (
                <div key={section.label} className={si === 0 ? "" : "mt-1"}>
                  <p className="px-3 pb-1 pt-2 text-[10px] font-extrabold uppercase tracking-widest text-ink-soft/80">
                    {section.label}
                  </p>
                  {section.items.map((r, i) => {
                    const index = offset + i;
                    return (
                      <Row
                        key={`${r.kind}-${r.href}-${r.title}`}
                        result={r}
                        index={index}
                        active={index === cursor}
                        onHover={() => setActive(index)}
                        onPick={() => pick(r)}
                        isRecentQuery={section.label === "Recent searches"}
                      />
                    );
                  })}
                </div>
              );
            })
          )}

          {/* Typing always offers the operator, even when there ARE matches —
              the thing you want most often isn't a page, it's the work. */}
          {typed && !noMatches && (
            <button
              onClick={() => delegate(typed)}
              className="mt-1 flex w-full items-center gap-3 rounded-btn px-3 py-2.5 text-left transition-colors duration-fast hover:bg-cream-deep/70"
            >
              <Sparkles size={15} className="shrink-0 text-signal" aria-hidden="true" />
              <span className="min-w-0 flex-1 truncate text-[13px] font-bold">
                Ask cosigno to “{typed}”
              </span>
              <ArrowRight size={13} className="shrink-0 text-ink-soft" aria-hidden="true" />
            </button>
          )}
        </div>

        {/* ------------------------------ the keys ------------------------------ */}
        <div className="flex items-center gap-4 border-t border-line/70 bg-cream/60 px-5 py-2.5">
          <span className="flex items-center gap-1.5 text-[10px] font-bold text-ink-soft">
            <Key>↑</Key>
            <Key>↓</Key>
            move
          </span>
          <span className="flex items-center gap-1.5 text-[10px] font-bold text-ink-soft">
            <Key>↵</Key>
            open
          </span>
          <span className="ml-auto inline-flex items-center gap-1.5 opacity-70">
            <CosignoMark size={12} />
            <span className="text-[10px] font-bold lowercase tracking-widest text-ink-soft">
              cosigno
            </span>
          </span>
        </div>
      </div>
    </div>
  );
}

function Key({ children }: { children: React.ReactNode }) {
  return (
    <kbd className="inline-flex h-[18px] min-w-[18px] items-center justify-center rounded-[5px] bg-cream-deep px-1 text-[10px] font-bold text-ink-soft">
      {children}
    </kbd>
  );
}

function Row({
  result,
  index,
  active,
  onHover,
  onPick,
  isRecentQuery,
}: {
  result: SearchResult;
  index: number;
  active: boolean;
  onHover: () => void;
  onPick: () => void;
  isRecentQuery: boolean;
}) {
  const Icon = ICON[result.kind];
  return (
    <button
      data-index={index}
      onClick={onPick}
      onMouseEnter={onHover}
      className={`flex w-full items-center gap-3 rounded-btn px-3 py-2.5 text-left transition-colors duration-fast ${
        active ? "bg-cream-deep" : ""
      }`}
    >
      <span className="grid h-7 w-7 shrink-0 place-items-center rounded-btn bg-cream-deep/80" aria-hidden="true">
        {result.providerKey ? (
          <ConnectorLogo kind="app" providerKey={result.providerKey} displayName={result.title} size={15} />
        ) : isRecentQuery ? (
          <Clock size={14} className="text-ink-soft" />
        ) : (
          <Icon size={14} className="text-ink-soft" />
        )}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[13px] font-bold">{result.title}</span>
        {result.subtitle && (
          <span className="block truncate text-[11px] font-medium text-ink-soft">{result.subtitle}</span>
        )}
      </span>
      <ArrowRight
        size={13}
        className={`shrink-0 text-ink-soft transition-opacity duration-fast ${
          active ? "opacity-100" : "opacity-0"
        }`}
        aria-hidden="true"
      />
    </button>
  );
}

/**
 * Nothing matched — so offer the thing that always works. The mark sits above
 * it so the moment still feels like cosigno rather than a browser saying no.
 */
function NoMatches({ query, onDelegate }: { query: string; onDelegate: () => void }) {
  return (
    <div className="flex flex-col items-center px-6 py-10 text-center">
      <span className="opacity-25">
        <CosignoMark size={30} />
      </span>
      <p className="mt-3 text-[13px] font-bold">Nothing here matches “{query}”.</p>
      <p className="mt-1 max-w-xs text-[11px] font-medium leading-relaxed text-ink-soft">
        cosigno only searches what it already holds — your missions, decisions, apps and files.
      </p>
      <button
        onClick={onDelegate}
        className="mt-4 inline-flex items-center gap-2 rounded-btn bg-signal px-4 py-2 text-[12px] font-extrabold text-ink shadow-soft transition-transform duration-fast hover:-translate-y-px"
      >
        <Sparkles size={13} aria-hidden="true" />
        Make it a mission instead
      </button>
    </div>
  );
}
