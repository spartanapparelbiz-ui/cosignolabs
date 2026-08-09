"use client";

import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { AnimatePresence, motion, useInView } from "framer-motion";
import { Search } from "lucide-react";
import { DrawnCheck } from "./ui";
import { EASE_OUT, MaskedLines, Rise, useStillness } from "./primitives";

/**
 * Monitoring — the room gets darker.
 *
 * The section repaints itself by overriding the palette variables rather than
 * hard-coding a dark skin, so every token inside it (surfaces, hairlines, the
 * mark, the orange) resolves correctly and the section reads one step deeper
 * than the page in both light and dark themes.
 *
 * The stream is real: events arrive on an interval, the newest at the bottom,
 * older ones riding up and out. The filters and the search box actually
 * filter and actually search. It runs only while the section is on screen,
 * and not at all under reduced motion, where the last twelve events are
 * simply listed.
 */

const DEEP: CSSProperties = {
  "--c-ink": "245 240 232",
  "--c-cream": "16 14 11",
  "--c-cream-deep": "31 27 22",
  "--c-ink-soft": "168 160 149",
  "--c-line": "56 50 42",
  "--c-signal": "255 99 64",
  "--c-surface": "28 25 20",
  "--logo-check": "#f7f0e5",
  "--logo-wordmark": "#f7f0e5",
} as CSSProperties;

type Kind = "auto" | "signed" | "held";

const EVENTS: { kind: Kind; text: string }[] = [
  { kind: "auto", text: "read 217 new messages" },
  { kind: "signed", text: "sent 4 replies, signed by you" },
  { kind: "held", text: "refund $48.00, waiting for you" },
  { kind: "auto", text: "summarised thursday's calls" },
  { kind: "signed", text: "posted the release note in #launch" },
  { kind: "held", text: "external content tried to direct the agent" },
  { kind: "auto", text: "searched drive for the q3 deck" },
  { kind: "signed", text: "updated 12 records in notion" },
  { kind: "held", text: "delete 40 files, waiting for you" },
  { kind: "auto", text: "read 9 calendar invites" },
  { kind: "signed", text: "$96.00 refunded, typed confirmation" },
  { kind: "auto", text: "drafted 3 follow-ups" },
];

const FILTERS: { id: "all" | Kind; label: string }[] = [
  { id: "all", label: "everything" },
  { id: "signed", label: "signed by you" },
  { id: "auto", label: "ran on its own" },
  { id: "held", label: "held" },
];

const MISSIONS = [
  { name: "clear the inbox", state: "running", detail: "4 of 6" },
  { name: "sort out the duplicate charges", state: "held", detail: "1 waiting for you" },
  { name: "build tomorrow's brief", state: "done", detail: "closed 08:12" },
];

/** Rows on screen at once, and how much history the filters can reach back into. */
const WINDOW = 7;
const POOL = 36;

/**
 * Clock derived from the sequence number rather than the wall clock: the
 * server and the browser render the same string, so the stream hydrates
 * without a mismatch and still ticks forward as events arrive.
 */
const CLOCK_START = 11 * 3600 + 4 * 60 + 12; // 11:04:12

function stamp(seq: number): string {
  const t = CLOCK_START + seq * 7;
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(Math.floor(t / 3600) % 24)}:${pad(Math.floor(t / 60) % 60)}:${pad(t % 60)}`;
}

export function Monitoring() {
  const ref = useRef<HTMLElement>(null);
  const still = useStillness();
  const live = useInView(ref, { margin: "0px 0px -15% 0px" });
  const [cursor, setCursor] = useState(WINDOW);
  const [filter, setFilter] = useState<(typeof FILTERS)[number]["id"]>("all");
  const [query, setQuery] = useState("");

  useEffect(() => {
    if (!live || still) return;
    const id = window.setInterval(() => setCursor((c) => c + 1), 1700);
    return () => window.clearInterval(id);
  }, [live, still]);

  /**
   * The stream's recent history, oldest first — newest arrives at the foot.
   * The pool is deeper than the window on purpose: filtering and searching run
   * over the history, then the last `WINDOW` matches are shown. Searching only
   * the seven rows currently on screen would answer "nothing found" for events
   * that plainly just went past, which is worse than not offering search.
   */
  const rows = useMemo(() => {
    const size = still ? EVENTS.length : POOL;
    return Array.from({ length: size }, (_, i) => {
      const seq = cursor - size + i;
      const e = EVENTS[((seq % EVENTS.length) + EVENTS.length) % EVENTS.length];
      return { seq, ...e };
    });
  }, [cursor, still]);

  const q = query.trim().toLowerCase();
  const matched = rows.filter(
    (r) => (filter === "all" || r.kind === filter) && (!q || r.text.includes(q))
  );
  const visible = still ? matched : matched.slice(-WINDOW);

  return (
    <section
      ref={ref}
      aria-labelledby="monitoring-title"
      style={DEEP}
      className="bg-cream py-24 text-ink sm:py-32"
    >
      <div className="mx-auto w-full max-w-6xl px-4">
        <header className="mx-auto max-w-2xl text-center">
          <p className="text-[11px] font-extrabold uppercase tracking-[0.22em] text-ink-soft">
            monitoring
          </p>
          <MaskedLines
            as="h2"
            id="monitoring-title"
            lines={["you can always ask", "what it is doing."]}
            className="mt-4 font-display text-[clamp(2rem,5.6vw,4rem)] font-bold leading-[0.98] tracking-[-0.03em] text-ink"
          />
          <p className="mx-auto mt-5 max-w-xl text-sm font-semibold leading-relaxed text-ink-soft sm:text-base">
            proposals, approvals, vetoes and executions land in one stream,
            each with the payload it carried. what did it do, and who said yes.
            filterable, exportable, never a reconstruction.
          </p>
        </header>

        <Rise className="mt-12 grid gap-4 lg:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)]">
          {/* -------------------------------------------------- the stream */}
          <div className="overflow-hidden rounded-card bg-surface shadow-depth">
            <div className="flex flex-wrap items-center gap-2 border-b border-line/60 px-4 py-3">
              <span className="mr-auto inline-flex items-center gap-2 text-[11px] font-extrabold lowercase text-ink">
                <span
                  aria-hidden="true"
                  className="h-1.5 w-1.5 rounded-pill bg-signal motion-safe:animate-orb-pulse"
                />
                activity
              </span>
              <label className="flex items-center gap-2 rounded-btn bg-cream-deep px-2.5 py-1.5">
                <Search size={13} strokeWidth={2.6} className="text-ink-soft" aria-hidden="true" />
                <input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="search activity"
                  aria-label="search activity"
                  className="w-28 bg-transparent text-[11px] font-semibold lowercase text-ink outline-none placeholder:text-ink-soft sm:w-36"
                />
              </label>
            </div>

            <div className="flex flex-wrap gap-1.5 border-b border-line/60 px-4 py-2.5">
              {FILTERS.map((f) => (
                <button
                  key={f.id}
                  type="button"
                  onClick={() => setFilter(f.id)}
                  aria-pressed={filter === f.id}
                  className={`rounded-pill px-2.5 py-1 text-[11px] font-bold lowercase transition-colors duration-fast ${
                    filter === f.id
                      ? "bg-signal/15 text-ink ring-1 ring-inset ring-signal/45"
                      : "text-ink-soft ring-1 ring-inset ring-line hover:text-ink"
                  }`}
                >
                  {f.label}
                </button>
              ))}
            </div>

            <div
              className="relative h-[22rem] overflow-hidden px-4 py-3"
              style={{
                maskImage: "linear-gradient(to bottom, transparent, black 12%, black 100%)",
                WebkitMaskImage:
                  "linear-gradient(to bottom, transparent, black 12%, black 100%)",
              }}
            >
              <ul className="flex h-full flex-col justify-end gap-1.5">
                <AnimatePresence initial={false} mode="popLayout">
                  {visible.map((r) => (
                    <motion.li
                      key={r.seq}
                      layout={!still}
                      initial={still ? false : { opacity: 0, y: 14 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -10 }}
                      transition={{ duration: 0.42, ease: EASE_OUT }}
                      className="flex items-center gap-3 rounded-btn bg-cream-deep/70 px-3 py-2.5"
                    >
                      <span className="font-mono text-[10px] text-ink-soft">{stamp(r.seq)}</span>
                      <span className="min-w-0 flex-1 truncate text-[12px] font-bold lowercase text-ink">
                        {r.text}
                      </span>
                      <KindBadge kind={r.kind} />
                    </motion.li>
                  ))}
                </AnimatePresence>
                {visible.length === 0 && (
                  <li className="rounded-btn bg-cream-deep/60 px-3 py-2.5 text-[12px] font-bold lowercase text-ink-soft">
                    nothing in recent activity matches that.
                  </li>
                )}
              </ul>
            </div>
          </div>

          {/* ------------------------------------------------ mission board */}
          <div className="flex flex-col gap-4">
            <div className="rounded-card bg-surface p-4 shadow-depth">
              <p className="text-[11px] font-extrabold lowercase text-ink-soft">missions</p>
              <ul className="mt-3 space-y-2">
                {MISSIONS.map((m) => (
                  <li
                    key={m.name}
                    className="flex items-center gap-3 rounded-btn bg-cream-deep/70 px-3 py-2.5"
                  >
                    <span
                      aria-hidden="true"
                      className={`h-1.5 w-1.5 shrink-0 rounded-pill ${
                        m.state === "held"
                          ? "bg-signal motion-safe:animate-orb-pulse"
                          : m.state === "running"
                            ? "bg-ink-soft"
                            : "bg-signal"
                      }`}
                    />
                    <span className="min-w-0 flex-1 truncate text-[12px] font-bold lowercase text-ink">
                      {m.name}
                    </span>
                    <span className="shrink-0 font-mono text-[10px] text-ink-soft">
                      {m.detail}
                    </span>
                  </li>
                ))}
              </ul>
            </div>

            <div className="rounded-card bg-surface p-4 shadow-depth">
              <p className="text-[11px] font-extrabold lowercase text-ink-soft">
                emergency stop
              </p>
              <p className="mt-2 text-[12px] font-semibold leading-relaxed text-ink-soft">
                one control halts every running mission and clears the queue.
                anything already signed keeps its receipt; nothing unsigned
                survives.
              </p>
              <span className="mt-3 inline-flex items-center rounded-btn px-3.5 py-2 text-[12px] font-extrabold lowercase text-ink ring-1 ring-inset ring-ink">
                stop everything
              </span>
            </div>
          </div>
        </Rise>
      </div>
    </section>
  );
}

function KindBadge({ kind }: { kind: Kind }) {
  if (kind === "signed") {
    return (
      <span className="inline-flex shrink-0 items-center gap-1 text-[10px] font-extrabold lowercase text-ink">
        <span className="text-signal">
          <DrawnCheck size={12} />
        </span>
        signed
      </span>
    );
  }
  if (kind === "held") {
    return (
      <span className="shrink-0 rounded-pill px-2 py-0.5 text-[10px] font-extrabold lowercase text-ink ring-1 ring-inset ring-ink/50">
        held
      </span>
    );
  }
  return (
    <span className="shrink-0 text-[10px] font-extrabold lowercase text-ink-soft">auto</span>
  );
}
