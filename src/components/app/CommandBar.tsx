"use client";

import { Fragment, useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  CornerDownLeft,
  FileText,
  LayoutGrid,
  Plug,
  Rocket,
  Search,
  ShieldQuestion,
  Sparkles,
} from "lucide-react";
import { ConnectorLogo } from "@/components/integrations/ConnectorLogo";
import {
  actionsFor,
  flatten,
  groupResults,
  type PaletteAction,
} from "@/lib/command/palette";
import type { ResultKind, SearchResult } from "@/lib/search/global";

/**
 * ⌘K — the fastest way to anything, and the fastest way to start anything.
 *
 * It searches only what cosigno already holds: missions, decisions waiting on
 * you, connected apps, files it produced, and the pages themselves. It does
 * not reach into connected systems, so nothing here can be slow, cost a rate
 * limit, or offer a category the product can't deliver.
 *
 * It also takes requests. Typing a goal offers to delegate it — which means
 * putting it in the ask box, where the normal understanding-and-confirm flow
 * runs. **The palette composes and navigates; it never authorises.** A "quick
 * approve" shortcut would let someone sign an outward-facing action from a
 * text field without reading it, which is precisely the thing this product
 * exists to prevent. A decision found here is opened, not signed.
 *
 * Everything it returns goes somewhere. A search result that isn't a link is
 * a dead end wearing a costume.
 */

const ICON: Record<ResultKind, typeof Rocket> = {
  mission: Rocket,
  decision: ShieldQuestion,
  app: Plug,
  file: FileText,
  page: LayoutGrid,
};

/** Shown before anything is typed — the palette teaches its own grammar. */
const HINTS: Array<{ label: string; detail: string }> = [
  { label: "type a goal", detail: "\"draft the investor update\" — delegate it without leaving this box" },
  { label: "type a name", detail: "a mission, a file, an app, or a decision waiting on you" },
  { label: "↑ ↓ then ⏎", detail: "move and open, without touching the mouse" },
];

export function CommandBar() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [active, setActive] = useState(0);
  const [searching, setSearching] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);

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
    return () => window.removeEventListener("keydown", onKey);
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

  const actions = actionsFor(query);
  const groups = groupResults(results);
  const flat = flatten(actions, groups);

  const run = useCallback(
    (entry: { action?: PaletteAction; result?: SearchResult }) => {
      setOpen(false);
      const href = entry.action?.href ?? entry.result?.href;
      const compose = entry.action?.compose;
      if (!href) return;
      router.push(href);
      if (compose) {
        // The ask box may not be mounted yet on a cross-page jump, so the
        // compose event is dispatched after navigation has had a frame to
        // land. The composer only ever fills the field — it never submits.
        setTimeout(() => {
          window.dispatchEvent(new CustomEvent("cosigno:compose", { detail: { text: compose } }));
        }, 120);
      }
    },
    [router]
  );

  // Keep the highlighted row in view when arrowing past the fold.
  useEffect(() => {
    const el = listRef.current?.querySelector<HTMLElement>('[data-active="true"]');
    el?.scrollIntoView({ block: "nearest" });
  }, [active]);

  if (!open) return null;

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((i) => (flat.length ? (i + 1) % flat.length : 0));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((i) => (flat.length ? (i - 1 + flat.length) % flat.length : 0));
    } else if (e.key === "Enter" && flat[active]) {
      e.preventDefault();
      run(flat[active]);
    }
  }

  // The flat index of the first item of each group, so the rendered rows and
  // the keyboard order stay in lockstep.
  let cursor = actions.length;

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-ink/40 p-4 pt-[12vh] backdrop-blur-[3px]"
      role="dialog"
      aria-modal="true"
      aria-label="command palette"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) setOpen(false);
      }}
    >
      <div className="w-full max-w-xl animate-spring-in overflow-hidden rounded-card bg-surface shadow-e4 ring-1 ring-inset ring-line/60">
        <div className="flex items-center gap-2.5 border-b border-line px-4">
          <Search size={15} className="shrink-0 text-ink-soft" aria-hidden="true" />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder="search, or type what you want done…"
            aria-label="search or delegate"
            aria-autocomplete="list"
            aria-controls="cosigno-palette-list"
            role="combobox"
            aria-expanded
            className="min-h-[52px] flex-1 bg-transparent text-sm font-semibold outline-none placeholder:font-medium placeholder:text-ink-soft/70"
          />
          {searching && (
            <span
              className="h-3 w-3 shrink-0 animate-orb-think rounded-pill border-2 border-line border-t-signal"
              aria-hidden="true"
            />
          )}
          <kbd className="shrink-0 rounded-btn bg-cream-deep px-1.5 py-0.5 text-[10px] font-bold text-ink-soft">
            esc
          </kbd>
        </div>

        {query.trim() ? (
          <ul id="cosigno-palette-list" ref={listRef} role="listbox" className="max-h-[52vh] overflow-y-auto p-1.5">
            {actions.length > 0 && (
              <>
                <GroupLabel>do it</GroupLabel>
                {actions.map((a, i) => (
                  <Row
                    key={a.title}
                    index={i}
                    active={active === i}
                    onHover={setActive}
                    onRun={() => run({ action: a })}
                    icon={<Sparkles size={15} className="text-signal" aria-hidden="true" />}
                    title={a.title}
                    subtitle={a.subtitle}
                    accent
                  />
                ))}
              </>
            )}

            {groups.map((g) => {
              const start = cursor;
              cursor += g.items.length;
              // A Fragment, not a wrapper element: the label and the rows are
              // each their own <li>, and an <li> may not contain another one.
              return (
                <Fragment key={g.kind}>
                  <GroupLabel>{g.label}</GroupLabel>
                  {g.items.map((r, j) => {
                    const index = start + j;
                    const Icon = ICON[r.kind];
                    return (
                      <Row
                        key={`${r.kind}-${r.href}-${r.title}`}
                        index={index}
                        active={active === index}
                        onHover={setActive}
                        onRun={() => run({ result: r })}
                        icon={
                          r.providerKey ? (
                            <ConnectorLogo
                              kind="app"
                              providerKey={r.providerKey}
                              displayName={r.title}
                              size={16}
                            />
                          ) : (
                            <Icon size={15} className="text-ink-soft" aria-hidden="true" />
                          )
                        }
                        title={r.title}
                        subtitle={r.subtitle}
                      />
                    );
                  })}
                </Fragment>
              );
            })}

            {/* Say plainly that there is nothing, rather than showing an empty
                box the reader has to interpret. */}
            {!searching && flat.length === 0 && (
              <li className="px-2.5 py-8 text-center">
                <p className="text-xs font-bold">nothing matches “{query.trim()}”.</p>
                <p className="mt-1 text-[11px] text-ink-soft">
                  cosigno searches what it already holds — it doesn&apos;t search inside
                  your connected apps from here.
                </p>
              </li>
            )}
          </ul>
        ) : (
          <div className="flex flex-col gap-0.5 p-2">
            {HINTS.map((h) => (
              <div key={h.label} className="flex items-baseline gap-2.5 px-2.5 py-1.5">
                <span className="shrink-0 text-[11px] font-extrabold lowercase">{h.label}</span>
                <span className="min-w-0 flex-1 text-[11px] text-ink-soft">{h.detail}</span>
              </div>
            ))}
          </div>
        )}

        <div className="flex items-center gap-3 border-t border-line/70 px-4 py-2 text-[10px] font-bold lowercase text-ink-soft/80">
          <span className="inline-flex items-center gap-1">
            <CornerDownLeft size={10} aria-hidden="true" /> open
          </span>
          <span>↑↓ move</span>
          <span className="ml-auto">nothing here runs without your approval</span>
        </div>
      </div>
    </div>
  );
}

function GroupLabel({ children }: { children: React.ReactNode }) {
  return (
    <li className="px-2.5 pb-1 pt-2 text-[10px] font-extrabold uppercase tracking-widest text-ink-soft/70">
      {children}
    </li>
  );
}

function Row({
  index,
  active,
  onHover,
  onRun,
  icon,
  title,
  subtitle,
  accent,
}: {
  index: number;
  active: boolean;
  onHover: (i: number) => void;
  onRun: () => void;
  icon: React.ReactNode;
  title: string;
  subtitle?: string;
  accent?: boolean;
}) {
  return (
    <li>
      <button
        type="button"
        role="option"
        aria-selected={active}
        data-active={active}
        onClick={onRun}
        onMouseEnter={() => onHover(index)}
        className={`flex w-full items-center gap-2.5 rounded-btn px-2.5 py-2 text-left transition-colors duration-fast ${
          active ? "bg-cream-deep" : ""
        } ${accent ? "ring-1 ring-inset ring-signal/25" : ""}`}
      >
        <span className="shrink-0">{icon}</span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-xs font-bold">{title}</span>
          {subtitle && (
            <span className="block truncate text-[11px] text-ink-soft">{subtitle}</span>
          )}
        </span>
        {active && (
          <CornerDownLeft size={11} className="shrink-0 text-ink-soft" aria-hidden="true" />
        )}
      </button>
    </li>
  );
}
