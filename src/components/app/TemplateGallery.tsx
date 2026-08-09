"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { Search } from "lucide-react";
import { useToast } from "@/components/Toast";
import {
  ALL_TEMPLATES,
  TEMPLATE_CATEGORIES,
  recommendedFor,
  searchTemplates,
  type Template,
} from "@/lib/templates/catalog";

/**
 * The template gallery: what cosigno can actually do for you, browsable.
 *
 * Every card starts something real — an engine template runs turnkey, a goal
 * template starts a mission that asks for the one fact it's missing, and a
 * compose template opens the ask box with the goal prefilled so one phrase
 * finishes it. There is no card here whose backend doesn't exist.
 *
 * The featured rows are real signal only: "recently used" is your history on
 * this device, "recommended" is derived from the apps you actually connected.
 * No trending, no popularity numbers — we don't collect what they'd need.
 */

const RECENT_KEY = "cosigno.templates.recent";

function readRecent(): string[] {
  try {
    const raw = localStorage.getItem(RECENT_KEY);
    const arr = raw ? (JSON.parse(raw) as unknown) : [];
    return Array.isArray(arr) ? arr.filter((x): x is string => typeof x === "string") : [];
  } catch {
    return [];
  }
}

function pushRecent(key: string): void {
  try {
    const next = [key, ...readRecent().filter((k) => k !== key)].slice(0, 6);
    localStorage.setItem(RECENT_KEY, JSON.stringify(next));
  } catch {
    /* private mode — recents simply don't persist */
  }
}

export function TemplateGallery() {
  const router = useRouter();
  const toast = useToast();
  const [busy, setBusy] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [recentKeys, setRecentKeys] = useState<string[]>([]);
  const [connectedKeys, setConnectedKeys] = useState<string[]>([]);

  useEffect(() => {
    setRecentKeys(readRecent());
    fetch("/api/connections")
      .then((r) => r.json())
      .then((d) => {
        const items = Array.isArray(d.connections) ? d.connections : [];
        setConnectedKeys(
          items
            .filter((c: { status?: string }) => c.status === "connected")
            .map((c: { provider_key?: string }) => String(c.provider_key ?? ""))
        );
      })
      .catch(() => undefined);
  }, []);

  const recent = useMemo(
    () =>
      recentKeys
        .map((k) => ALL_TEMPLATES.find((t) => t.key === k))
        .filter((t): t is Template => Boolean(t)),
    [recentKeys]
  );
  const recommended = useMemo(
    () => recommendedFor(connectedKeys).filter((t) => !recentKeys.includes(t.key)).slice(0, 4),
    [connectedKeys, recentKeys]
  );
  const matches = useMemo(() => searchTemplates(query), [query]);
  const searching = query.trim().length > 0;

  async function run(t: Template) {
    setBusy(t.key);
    pushRecent(t.key);
    try {
      if (t.run.kind === "compose") {
        // The goal needs your subject — land in the ask box mid-thought.
        router.push(`/app?handle=${encodeURIComponent(t.run.prefill)}`);
        return;
      }
      const body =
        t.run.kind === "engine" ? { template: t.run.template } : { goal: t.run.goal };
      const res = await fetch("/api/missions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.message || "couldn't start the mission.");
      toast("success", "mission started.");
      router.push(`/app/missions/${data.mission.id}`);
    } catch (e) {
      toast("error", e instanceof Error ? e.message : "couldn't start the mission.");
      setBusy(null);
    }
  }

  return (
    <div className="flex flex-col gap-10">
      {/* search */}
      <label className="relative block">
        <Search
          size={17}
          strokeWidth={2.4}
          aria-hidden="true"
          className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-ink-soft"
        />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="What would you like help with?"
          aria-label="search templates"
          className="w-full rounded-card bg-surface/70 py-3.5 pl-11 pr-4 text-base font-semibold shadow-soft outline-none ring-1 ring-inset ring-transparent transition-all duration-fast placeholder:text-ink-soft/60 focus:ring-ink/30"
        />
      </label>

      {searching ? (
        <section>
          <h2 className="text-xs font-extrabold uppercase tracking-[0.16em] text-ink-soft">
            {matches.length === 0
              ? "Nothing matches"
              : `${matches.length} match${matches.length === 1 ? "" : "es"}`}
          </h2>
          {matches.length === 0 ? (
            <p className="mt-3 max-w-xl text-sm text-ink-soft">
              no template covers that yet — but the ask box does. describe it in your own
              words on{" "}
              <a href="/app" className="font-bold underline underline-offset-2">
                home
              </a>{" "}
              and cosigno compiles a plan and shows it to you before anything runs.
            </p>
          ) : (
            <Grid templates={matches} busy={busy} onRun={run} />
          )}
        </section>
      ) : (
        <>
          {/* featured — real signal only */}
          {recent.length > 0 && (
            <section>
              <h2 className="text-xs font-extrabold uppercase tracking-[0.16em] text-ink-soft">
                Recently used
              </h2>
              <Grid templates={recent} busy={busy} onRun={run} />
            </section>
          )}
          {recommended.length > 0 && (
            <section>
              <h2 className="text-xs font-extrabold uppercase tracking-[0.16em] text-ink-soft">
                Recommended — works with your connected apps
              </h2>
              <Grid templates={recommended} busy={busy} onRun={run} />
            </section>
          )}

          {TEMPLATE_CATEGORIES.map((cat) => (
            <section key={cat.id}>
              <h2 className="text-xs font-extrabold uppercase tracking-[0.16em] text-ink-soft">
                {cat.title}
              </h2>
              <Grid templates={cat.templates} busy={busy} onRun={run} />
            </section>
          ))}

          <p className="text-sm text-ink-soft">
            anything else? describe it in your own words on{" "}
            <a href="/app" className="font-bold underline underline-offset-2">
              home
            </a>{" "}
            — cosigno compiles open-ended goals into a plan and shows it to you before
            anything runs.
          </p>
        </>
      )}
    </div>
  );
}

function Grid({
  templates,
  busy,
  onRun,
}: {
  templates: Template[];
  busy: string | null;
  onRun: (t: Template) => void;
}) {
  return (
    <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {templates.map((t) => (
        <Card key={t.key} template={t} busy={busy} onRun={onRun} />
      ))}
    </div>
  );
}

/**
 * The card: icon, title, one sentence, apps, the approval fact, run. No
 * estimated minutes — a duration we'd be inventing — and no badges. What a
 * card promises is exactly what pressing run does.
 */
function Card({
  template: t,
  busy,
  onRun,
}: {
  template: Template;
  busy: string | null;
  onRun: (t: Template) => void;
}) {
  const needsSubject = t.run.kind === "compose";
  return (
    <article className="group flex flex-col rounded-card bg-surface/60 p-5 shadow-soft transition-all duration-base ease-brand-out hover:-translate-y-0.5 hover:shadow-lift">
      <span
        className="flex h-12 w-12 items-center justify-center rounded-btn bg-cream-deep text-2xl"
        aria-hidden="true"
      >
        {t.icon}
      </span>
      <h3 className="mt-3 text-base font-extrabold leading-snug">{t.title}</h3>
      <p className="mt-1.5 flex-1 text-sm leading-snug text-ink-soft">{t.outcome}</p>
      <p className="mt-3 text-xs font-semibold text-ink-soft">{t.apps.join(" · ")}</p>
      <p className="mt-1 text-xs text-ink-soft">{t.approval}</p>
      <button
        onClick={() => onRun(t)}
        disabled={busy !== null}
        className="mt-4 w-full rounded-btn bg-ink py-2.5 text-sm font-extrabold lowercase text-cream transition-all duration-fast active:scale-[0.98] group-hover:bg-signal group-hover:text-on-signal disabled:bg-cream-deep disabled:text-ink-soft disabled:cursor-not-allowed"
      >
        {busy === t.key ? "starting…" : needsSubject ? "start — add your subject" : "run"}
      </button>
    </article>
  );
}
